import { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Node,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  BackgroundVariant,
  ConnectionMode,
  PanOnScrollMode,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useCanvasStore, AppNode } from '@/store/canvasStore';
import { useCanvasesStore } from '@/store/canvasesStore';
import CustomNode from '@/components/canvas/CustomNode';
import CustomEdge from '@/components/canvas/CustomEdge';
import Sidebar from '@/components/canvas/Sidebar';
import type { NodeData } from '@/types';
import { hasEffectivePromptContent } from '@/lib/promptParts';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  MousePointer2,
  Hand,
  Play,
  Files,
  Star,
  Layers,
  ArrowLeft,
  Home
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/components/ui/toast';
import { bgTaskManager } from '@/services/backgroundTaskManager';

// Simple ID gen for MVP
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const nodeTypes = {
  generationNode: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// 默认边样式
const defaultEdgeOptions = {
  style: { strokeWidth: 2 },
  type: 'custom',
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
  },
};

function CanvasContent() {
  const { projectId = 'default', canvasId = 'default' } = useParams();
  const { 
    nodes: allNodes, 
    edges: allEdges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode,
    setSelectedNodeId,
    selectedNodeId,
    clearSelection,
    galleryImages,
    removeNode,
    duplicateNode,
    generateFromNode,
  } = useCanvasStore();
  const activeCanvasKey = useCanvasStore((s) => s.activeCanvasKey);
  const promptLibrary = useCanvasStore((s) => s.promptLibrary);
  const selectOnlyNode = useCanvasStore((s) => s.selectOnlyNode);
  const modelName = useCanvasStore((s) => s.workbenchHealth?.generation?.model) || 'gemini-3-pro-image-preview';
  const prefs = usePreferencesStore((s) => s.prefs);
  const canvases = useCanvasesStore((s) => s.canvasesByProject[projectId] || []);
  const canvasName = useMemo(() => {
    const hit = canvases.find((c) => c.id === canvasId);
    if (hit?.name) return hit.name;
    if (canvasId === 'default') return '默认画布';
    return canvasId;
  }, [canvases, canvasId]);

  const { project, zoomIn, zoomOut, fitView, getNode } = useReactFlow();
  // Detect mobile to set default interaction mode
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window);
  const [isPanMode, setIsPanMode] = useState(isMobile); // Default to pan mode on mobile
    const [zoomTier, setZoomTier] = useState<'high' | 'medium' | 'low'>('high');

  const onMove = useCallback((_: any, viewport: { zoom: number }) => {
    const z = viewport.zoom;
    let tier: 'high' | 'medium' | 'low' = 'high';
    if (z < 0.45) tier = 'low';
    else if (z < 0.8) tier = 'medium';
    
    setZoomTier((prev) => (prev === tier ? prev : tier));
  }, []);
  

  type CollapsedPreviewItem = { nodeId: string; imageId: string; url: string };

  const { nodes: nodes, edges: edges, visibleNodeIds } = useMemo(() => {
    const nodesById = new Map<string, AppNode>();
    const activeIds = new Set<string>();

    for (const n of allNodes) {
      nodesById.set(n.id, n);
      if (!n.data.archived) activeIds.add(n.id);
    }

    const childrenById = new Map<string, string[]>();
    const parentsById = new Map<string, string[]>();

    for (const e of allEdges) {
      if (!activeIds.has(e.source) || !activeIds.has(e.target)) continue;
      const kids = childrenById.get(e.source);
      if (kids) kids.push(e.target);
      else childrenById.set(e.source, [e.target]);

      const parents = parentsById.get(e.target);
      if (parents) parents.push(e.source);
      else parentsById.set(e.target, [e.source]);
    }

    const latestLevelsRaw = Number(prefs.canvasVisibleLatestLevels || 0);
    const latestLevels = Number.isFinite(latestLevelsRaw) ? Math.max(0, Math.min(50, latestLevelsRaw)) : 0;

    let tailVisibleIds: Set<string> = activeIds;
    if (latestLevels > 0) {
      const leaves = Array.from(activeIds).filter((id) => (childrenById.get(id) || []).length === 0);

      if (leaves.length > 0) {
        const dist = new Map<string, number>();
        const queue = [...leaves];
        for (const leaf of leaves) dist.set(leaf, 0);

        for (let i = 0; i < queue.length; i++) {
          const cur = queue[i]!;
          const curDist = dist.get(cur)!;
          const parents = parentsById.get(cur) || [];
          for (const p of parents) {
            const nextDist = curDist + 1;
            const prev = dist.get(p);
            if (prev === undefined || nextDist < prev) {
              dist.set(p, nextDist);
              queue.push(p);
            }
          }
        }

        tailVisibleIds = new Set(
          Array.from(activeIds).filter((id) => {
            const d = dist.get(id);
            return d !== undefined && d < latestLevels;
          })
        );
      }
    }

    const previewEnabled = prefs.canvasCollapsedPreviewImages !== false;
    const previewDepthRaw = Number(prefs.canvasCollapsedPreviewDepth || 3);
    const previewDepth = Number.isFinite(previewDepthRaw) ? Math.max(1, Math.min(6, previewDepthRaw)) : 3;
    const previewLimit = 9;

    const hiddenIds = new Set<string>();
    const hiddenCountById = new Map<string, number>();
    const previewById = new Map<string, CollapsedPreviewItem[]>();
    const previewTotalById = new Map<string, number>();

    const collapsedRoots = allNodes
      .filter((n) => tailVisibleIds.has(n.id) && Boolean(n.data.collapsed) && !n.data.archived)
      .map((n) => n.id);

    for (const rootId of collapsedRoots) {
      if (hiddenIds.has(rootId)) continue;

      let hiddenCount = 0;
      let previewTotal = 0;
      const preview: CollapsedPreviewItem[] = [];
      const queue: Array<{ id: string; depth: number }> = [];
      const rootKids = childrenById.get(rootId) || [];
      for (const k of rootKids) queue.push({ id: k, depth: 1 });

      const seen = new Set<string>();

      for (let qi = 0; qi < queue.length; qi++) {
        const cur = queue[qi]!;
        if (seen.has(cur.id)) continue;
        seen.add(cur.id);

        hiddenIds.add(cur.id);
        hiddenCount += 1;

        if (previewEnabled && cur.depth <= previewDepth) {
          const node = nodesById.get(cur.id);
          const img = node?.data.images?.[0];
          if (img?.url) {
            previewTotal += 1;
            if (preview.length < previewLimit) {
              preview.push({ nodeId: cur.id, imageId: img.id, url: img.url });
            }
          }
        }

        const kids = childrenById.get(cur.id) || [];
        for (const k of kids) queue.push({ id: k, depth: cur.depth + 1 });
      }

      hiddenCountById.set(rootId, hiddenCount);
      if (previewEnabled) {
        previewById.set(rootId, preview);
        previewTotalById.set(rootId, previewTotal);
      }
    }

    const visibleNodeIds = new Set(Array.from(tailVisibleIds).filter((id) => !hiddenIds.has(id)));
    const filteredNodes = allNodes.filter((n) => visibleNodeIds.has(n.id));
    const filteredEdges = allEdges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    const nodesWithExtras = filteredNodes.map((n) => {
      const hiddenCount = hiddenCountById.get(n.id);
      const preview = previewById.get(n.id);
      const previewTotal = previewTotalById.get(n.id);
      if (hiddenCount === undefined && preview === undefined && previewTotal === undefined) return n;

      return {
        ...n,
        data: {
          ...(n.data as any),
          __collapsedHiddenCount: hiddenCount ?? 0,
          __collapsedPreview: preview,
          __collapsedPreviewTotal: previewTotal ?? preview?.length ?? 0,
        } as any,
      };
    });

    return { nodes: nodesWithExtras, edges: filteredEdges, visibleNodeIds };
  }, [
    allNodes,
    allEdges,
    prefs.canvasVisibleLatestLevels,
    prefs.canvasCollapsedPreviewImages,
    prefs.canvasCollapsedPreviewDepth,
  ]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!visibleNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, visibleNodeIds, setSelectedNodeId]);

  // 统计信息
  const stats = useMemo(() => {
    const total = nodes.length;
    const completed = nodes.filter(n => n.data.status === 'completed').length;
    const running = nodes.filter(n => n.data.status === 'running' || n.data.status === 'queued').length;
    const favorites = nodes.filter(n => n.data.favorite).length;
    return { total, completed, running, favorites };
  }, [nodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleAddNode = useCallback((event?: React.MouseEvent) => {
    // 如果有事件，使用事件位置；否则在视口中心创建
    let position = { x: 100, y: 100 };
    
    if (event) {
      position = project({
        x: event.clientX,
        y: event.clientY,
      });
    }

    const nodeId = generateId();
    const baseNode = selectedNodeId ? allNodes.find((n) => n.id === selectedNodeId) : null;
    const newNode: AppNode = {
      id: nodeId,
      type: 'generationNode',
      position,
      data: {
        id: nodeId,
        canvasId,
        type: 'txt2img',
        prompt: baseNode?.data.prompt || '',
        count: baseNode?.data.count ?? prefs.defaultCount,
        imageSize: (baseNode?.data.imageSize || prefs.defaultImageSize) as NodeData['imageSize'],
        aspectRatio: (baseNode?.data.aspectRatio || prefs.defaultAspectRatio) as NodeData['aspectRatio'],
        modelName,
        status: 'idle',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        images: [],
      },
    };

    addNode(newNode);
    selectOnlyNode(newNode.id);
  }, [
    project,
    addNode,
    selectOnlyNode,
    modelName,
    canvasId,
    prefs.defaultAspectRatio,
    prefs.defaultCount,
    prefs.defaultImageSize,
    selectedNodeId,
    allNodes,
  ]);

  const onDoubleClick = useCallback((event: React.MouseEvent) => {
    // 移动设备上禁用双击新增节点
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
    const target = event.target as HTMLElement | null;
    // 避免在节点上双击误触新增
    if (target && target.closest('.react-flow__node')) return;
    handleAddNode(event);
  }, [handleAddNode]);

  const focusNode = useCallback((nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    fitView({ nodes: [target], padding: 0.35, duration: 350 });
  }, [fitView, nodes]);

  useEffect(() => {
    if (!activeCanvasKey) return;
    if (typeof window === 'undefined') return;

    const safeParse = (raw: string) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const pendingPromptKey = 'photopro:pending-prompt-asset';
    const rawPrompt = localStorage.getItem(pendingPromptKey);
    if (rawPrompt) {
      localStorage.removeItem(pendingPromptKey);
      const payload: any = safeParse(rawPrompt);
      if (!payload) {
        toast.error('提示词资产数据损坏');
      } else {
        const assetId = String(payload?.assetId || '').trim();
        const asset = assetId ? promptLibrary.find((p) => p.id === assetId) : null;
        if (!asset) {
          toast.error('未找到提示词资产');
        } else {
          const nodeId = generateId();
          const now = new Date().toISOString();
          const offset = Math.min(560, Math.max(0, allNodes.length) * 40);

          const newNode: AppNode = {
            id: nodeId,
            type: 'generationNode',
            position: { x: 120 + offset, y: 120 + offset },
            data: {
              id: nodeId,
              canvasId,
              type: 'txt2img',
              prompt: asset.prompt,
              count: prefs.defaultCount,
              imageSize: prefs.defaultImageSize,
              aspectRatio: prefs.defaultAspectRatio,
              modelName,
              status: 'idle',
              createdAt: now,
              updatedAt: now,
              images: [],
            },
          };

          addNode(newNode);
          selectOnlyNode(nodeId);
          requestAnimationFrame(() => {
            fitView({ nodes: [newNode], padding: 0.35, duration: 350 });
          });

          if (payload?.autoGenerate) {
            void (async () => {
              const newIds = await generateFromNode(nodeId, { mode: 'append' });
              const focusId = newIds?.[0];
              if (!focusId) return;
              requestAnimationFrame(() => {
                const target = getNode(focusId);
                if (!target) return;
                fitView({ nodes: [target], padding: 0.35, duration: 350 });
              });
            })();
          }
        }
      }
    }

    const pendingImageKey = 'photopro:pending-gallery-image';
    const rawImage = localStorage.getItem(pendingImageKey);
    if (rawImage) {
      localStorage.removeItem(pendingImageKey);
      const payload: any = safeParse(rawImage);
      const imageId = String(payload?.imageId || '').trim();
      const img = imageId ? galleryImages.find((it) => it.id === imageId) : null;

      if (!img) {
        toast.error('未找到要复用的图片');
      } else {
          const nodeId = generateId();
          const now = new Date().toISOString();
          const offset = Math.min(560, Math.max(0, allNodes.length) * 40) + 80;

        const promptFromMeta = String(img.meta?.prompt || '').trim();
        const promptFromCaption = String(img.aiCaption || '').trim();
        const prompt = promptFromMeta || promptFromCaption || '';

        const newNode: AppNode = {
          id: nodeId,
          type: 'generationNode',
          position: { x: 120 + offset, y: 120 + offset },
          data: {
            id: nodeId,
            canvasId,
            type: 'txt2img',
            prompt,
            referenceImageId: img.id,
            count: prefs.defaultCount,
            imageSize: (img.meta?.imageSize || prefs.defaultImageSize) as NodeData['imageSize'],
            aspectRatio: (img.meta?.aspectRatio || prefs.defaultAspectRatio) as NodeData['aspectRatio'],
            modelName,
            status: 'idle',
            createdAt: now,
            updatedAt: now,
            images: [],
            tags: img.tags || undefined,
            notes: img.aiCaption || undefined,
          },
        };

        addNode(newNode);
        selectOnlyNode(nodeId);
        requestAnimationFrame(() => {
          fitView({ nodes: [newNode], padding: 0.35, duration: 350 });
        });

        if (payload?.autoGenerate) {
          if (!prompt) {
            toast.error('该图片没有可用的提示词，请在节点内补充后再生成');
          } else {
            void (async () => {
              const newIds = await generateFromNode(nodeId, { mode: 'append' });
              const focusId = newIds?.[0];
              if (!focusId) return;
              requestAnimationFrame(() => {
                const target = getNode(focusId);
                if (!target) return;
                fitView({ nodes: [target], padding: 0.35, duration: 350 });
              });
            })();
          }
        }
      }
    }
  }, [
    activeCanvasKey,
    promptLibrary,
    galleryImages,
    addNode,
    selectOnlyNode,
    allNodes.length,
    canvasId,
    prefs.defaultCount,
    prefs.defaultImageSize,
    prefs.defaultAspectRatio,
    modelName,
    fitView,
    getNode,
    generateFromNode,
  ]);

  // 全局快捷键：Delete 删除节点，Ctrl/Cmd+D 复制，Ctrl/Cmd+Enter 生成
  useEffect(() => {
    const handleKeydown = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (!selectedNodeId) return;

      if (e.key === 'Delete') {
        removeNode(selectedNodeId);
        setSelectedNodeId(null);
      }

      if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        duplicateNode(selectedNodeId);
      }

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const node = allNodes.find((n) => n.id === selectedNodeId) || null;
        if (!node) return;
        if (!hasEffectivePromptContent(String(node.data.prompt || ''), node.data.promptParts)) {
          toast.error('请先填写提示词');
          return;
        }
        void (async () => {
          const newIds = await generateFromNode(selectedNodeId, { mode: 'append' });
          const focusId = newIds?.[0];
          if (!focusId) return;
          requestAnimationFrame(() => {
            const target = getNode(focusId);
            if (!target) return;
            fitView({ nodes: [target], padding: 0.35, duration: 350 });
          });
        })();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [selectedNodeId, allNodes, removeNode, setSelectedNodeId, duplicateNode, generateFromNode, fitView, getNode]);

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 h-full relative touch-none">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDoubleClick={onDoubleClick}
          panOnDrag={isPanMode}
          selectionOnDrag={!isPanMode}
          panOnScroll={!isMobile} 
          zoomOnPinch={true}
          panOnScrollMode={PanOnScrollMode.Free}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className={cn("bg-background", `zoom-level-${zoomTier}`)}
          proOptions={{ hideAttribution: true }}
          onMove={onMove}
        >
          <Background 
            variant={BackgroundVariant.Dots}
            color="hsl(220 13% 18%)" 
            gap={24}
            size={1.5}
          />
          <Controls 
            showZoom={false}
            showFitView={false}
            showInteractive={false}
          />
          <MiniMap 
            className="!bg-card/30 !backdrop-blur-xl !border-border/20 !rounded-2xl !shadow-2xl" 
            maskColor="transparent"
            nodeColor="hsl(var(--primary))"
          />
          
          {/* 左上角工具栏 - 状态显示 */}
          <Panel
            position="top-left"
            className={cn(
              "!z-[100] pointer-events-none flex flex-col gap-2 sm:gap-3",
              isMobile ? "!m-2" : "!m-4"
            )}
          >
             {/* 占位，把位置留给 Header 的悬浮岛 */}
             {!isMobile && <div className="h-12 w-full"></div>}

             {/* 手机端返回按钮 */}
             {isMobile && (
               <Link 
                 to="/" 
                 className="pointer-events-auto bg-card/70 backdrop-blur-xl backdrop-saturate-150 border border-white/10 dark:border-white/5 rounded-2xl shadow-2xl p-2.5 flex items-center gap-2 w-fit transition-all hover:bg-card/80 active:scale-95"
               >
                 <ArrowLeft className="w-5 h-5 text-foreground" />
                 <Home className="w-4 h-4 text-muted-foreground" />
               </Link>
             )}

             {/* Canvas Info Card */}
             <div className="pointer-events-auto bg-card/70 backdrop-blur-xl backdrop-saturate-150 border border-white/10 dark:border-white/5 rounded-3xl shadow-2xl p-1.5 flex flex-col gap-1 w-fit transition-all hover:bg-card/80 group">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg flex items-center justify-center text-primary-foreground group-hover:scale-105 transition-transform duration-300">
                    <Files className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm tracking-tight">{canvasName}</span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {stats.total} 节点
                      </span>
                      {(stats.running > 0 || stats.favorites > 0) && (
                        <div className="w-px h-2.5 bg-border/50"></div>
                      )}
                      {stats.running > 0 && (
                        <span className="flex items-center gap-1 text-blue-500 animate-pulse">
                          <Play className="w-3 h-3 fill-current" />
                          {stats.running} 运行中
                        </span>
                      )}
                      {stats.favorites > 0 && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Star className="w-3 h-3 fill-current" />
                          {stats.favorites}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Actions Row */}
                <div className="flex items-center gap-1 mt-1 border-t border-border/20 pt-1.5 px-1">
                  <Button
                    size="sm"
                    className="flex-1 h-8 rounded-xl text-xs font-medium bg-primary/90 hover:bg-primary shadow-sm hover:shadow-md transition-all"
                    onClick={() => handleAddNode()}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    新建节点
                  </Button>
                </div>
             </div>
          </Panel>

          {/* 右上角控制栏 - 悬浮胶囊 */}
          <Panel
            position="top-right"
            className={cn(
              "!z-[100] pointer-events-none flex flex-col gap-2 sm:gap-3 animate-fade-in delay-100",
              isMobile ? "!m-2" : "!m-4"
            )}
          >
             {!isMobile && <div className="h-12 w-full"></div>}
            
            <div className="pointer-events-auto bg-card/70 backdrop-blur-xl backdrop-saturate-150 border border-white/10 dark:border-white/5 rounded-full p-1.5 shadow-2xl flex items-center gap-1 transition-all hover:bg-card/80">
              {/* 交互模式 */}
              <div className="flex items-center bg-secondary/50 rounded-full p-0.5 border border-border/10">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    !isPanMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setIsPanMode(false)}
                  title="选择模式 (V)"
                >
                  <MousePointer2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    isPanMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setIsPanMode(true)}
                  title="拖动模式 (H)"
                >
                  <Hand className="w-4 h-4" />
                </Button>
              </div>

              <div className="w-px h-4 bg-border/20 mx-1" />

              {/* 视图控制 */}
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                  onClick={() => zoomOut()}
                  title="缩小 (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-[10px] font-medium w-8 text-center tabular-nums text-muted-foreground select-none">
                  {Math.round((zoomTier === 'high' ? 1 : zoomTier === 'medium' ? 0.7 : 0.4) * 100)}%
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                  onClick={() => zoomIn()}
                  title="放大 (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>

              <div className="w-px h-4 bg-border/20 mx-1" />

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                onClick={() => fitView({ padding: 0.2 })}
                title="适应视图 (F)"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
          </Panel>

          {/* 底部提示 - 更简洁的引导 */}
        </ReactFlow>
      </div>
      
      {/* 右侧边栏 */}
      <Sidebar onFocusNode={focusNode} />
    </div>
  );
}

export default function CanvasPage() {
  const { projectId = 'default', canvasId = 'default' } = useParams();
  const hydrate = useCanvasStore((state) => state.hydrate);
  const refreshWorkbenchHealth = useCanvasStore((state) => state.refreshWorkbenchHealth);
  const hydrateCanvases = useCanvasesStore((s) => s.hydrate);

  useEffect(() => {
    hydrate(projectId, canvasId);
    hydrateCanvases(projectId);
    refreshWorkbenchHealth();
    
    // 初始化后台任务管理器（防止手机端退出后台时任务中断）
    bgTaskManager.init();
    
    try {
      localStorage.setItem('photopro:last-canvas', JSON.stringify({ projectId, canvasId }));
    } catch {
      // ignore
    }

    return () => {
      // 清理后台任务管理器
      bgTaskManager.destroy();
    };
  }, [hydrate, hydrateCanvases, refreshWorkbenchHealth, projectId, canvasId]);

  return (
    <ReactFlowProvider>
      <div className="h-screen supports-[height:100dvh]:h-[100dvh] w-full">
        <CanvasContent />
      </div>
    </ReactFlowProvider>
  );
}
