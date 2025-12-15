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
  ConnectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useCanvasStore, AppNode } from '@/store/canvasStore';
import { useCanvasesStore } from '@/store/canvasesStore';
import CustomNode from '@/components/canvas/CustomNode';
import Sidebar from '@/components/canvas/Sidebar';
import type { NodeData } from '@/types';
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
  Sun,
  Moon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/components/ui/toast';

// Simple ID gen for MVP
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const nodeTypes = {
  generationNode: CustomNode,
};

// 默认边样式
const defaultEdgeOptions = {
  style: { stroke: 'hsl(262 83% 58%)', strokeWidth: 2 },
  type: 'smoothstep',
  animated: true,
};

function CanvasContent() {
  const { projectId = 'default', canvasId = 'default' } = useParams();
  const { 
    nodes, 
    edges, 
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
    generateNode,
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

  const { project, zoomIn, zoomOut, fitView } = useReactFlow();
  const [isPanMode, setIsPanMode] = useState(false);
    const [zoomTier, setZoomTier] = useState<'high' | 'medium' | 'low'>('high');

  const onMove = useCallback((_: any, viewport: { zoom: number }) => {
    const z = viewport.zoom;
    let tier: 'high' | 'medium' | 'low' = 'high';
    if (z < 0.45) tier = 'low';
    else if (z < 0.8) tier = 'medium';
    
    setZoomTier((prev) => (prev === tier ? prev : tier));
  }, []);
  
  // 主题切换
  const { theme, setTheme } = useThemeStore();
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  const ThemeIcon = theme === 'light' ? Sun : Moon;

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
    const baseNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
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
    nodes,
  ]);

  const onDoubleClick = useCallback((event: React.MouseEvent) => {
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
          const offset = Math.min(560, Math.max(0, nodes.length) * 40);

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
            void generateNode(nodeId);
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
        const offset = Math.min(560, Math.max(0, nodes.length) * 40) + 80;

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
            void generateNode(nodeId);
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
    nodes.length,
    canvasId,
    prefs.defaultCount,
    prefs.defaultImageSize,
    prefs.defaultAspectRatio,
    modelName,
    fitView,
    generateNode,
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
        await generateNode(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [selectedNodeId, removeNode, setSelectedNodeId, duplicateNode, generateNode]);

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDoubleClick={onDoubleClick}
          panOnDrag={isPanMode}
          selectionOnDrag={!isPanMode}
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
            className="!bg-transparent !border-border" 
            maskColor="transparent"
            nodeColor="hsl(var(--primary))"
          />
          
          {/* 左上角工具栏 - 返回按钮 + 状态显示 */}
          <Panel position="top-left" className="!m-4">
            <div className="flex items-start gap-2">
              {/* 返回按钮 */}
              <Link
                to={`/projects/${projectId}/canvases`}
                className="bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-xl flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                画布
              </Link>
              
              {/* 状态面板 */}
              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                    <Files className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate max-w-[220px]">{canvasName}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {stats.total}
                      </span>
                      {stats.running > 0 && (
                        <span className="flex items-center gap-1 text-blue-400">
                          <Play className="w-3 h-3 fill-current" />
                          {stats.running}
                        </span>
                      )}
                      {stats.favorites > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Star className="w-3 h-3 fill-current" />
                          {stats.favorites}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90"
                    onClick={() => handleAddNode()}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    新建
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          {/* 右上角控制栏 */}
          <Panel position="top-right" className="!m-4">
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl p-1.5 shadow-xl flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 w-8 p-0",
                  !isPanMode && "bg-primary/20 text-primary"
                )}
                onClick={() => setIsPanMode(false)}
                title="选择模式 (V)"
              >
                <MousePointer2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 w-8 p-0",
                  isPanMode && "bg-primary/20 text-primary"
                )}
                onClick={() => setIsPanMode(true)}
                title="拖动模式 (H)"
              >
                <Hand className="w-4 h-4" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => zoomIn()}
                title="放大 (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => zoomOut()}
                title="缩小 (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => fitView({ padding: 0.2 })}
                title="适应视图 (F)"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <div className="w-px h-5 bg-border mx-1 hidden" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hidden"
                onClick={toggleTheme}
                title={`切换到${theme === 'light' ? '深色' : '浅色'}模式`}
              >
                <ThemeIcon className="w-4 h-4" />
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
    try {
      localStorage.setItem('photopro:last-canvas', JSON.stringify({ projectId, canvasId }));
    } catch {
      // ignore
    }
  }, [hydrate, hydrateCanvases, refreshWorkbenchHealth, projectId, canvasId]);

  return (
    <ReactFlowProvider>
      <div className="h-[calc(100vh-56px)] w-full"> 
        <CanvasContent />
      </div>
    </ReactFlowProvider>
  );
}
