import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { useCanvasStore, AppNode } from '@/store/canvasStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { NodeData, PromptAsset } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { hasEffectivePromptContent } from '@/lib/promptParts';
import { ResolvedImage } from '@/components/ui/ResolvedImage';
import { BookMarked, Copy, GitBranch, Image as ImageIcon, Loader2, Play, RotateCcw, Sparkles, Star, Trash2, X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { PromptPartsEditor } from './PromptPartsEditor';
import { AiChatDialog } from './AiChatDialog';

const IMAGE_SIZE_OPTIONS: Array<NodeData['imageSize']> = ['1K', '2K', '4K'];
const ASPECT_RATIO_OPTIONS: Array<NodeData['aspectRatio']> = ['auto', '1:1', '4:3', '3:4', '16:9', '9:16'];
const CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const;

// 快速分支建议 - 常用的变化方向
const QUICK_BRANCH_SUGGESTIONS = [
  { label: '插画风', value: 'illustration style, anime aesthetic' },
  { label: '写实风', value: 'photorealistic, hyperrealistic' },
  { label: '特写', value: 'close-up shot, detailed face' },
  { label: '远景', value: 'wide shot, landscape view' },
  { label: '雨夜', value: 'rainy night, neon lights, wet streets' },
  { label: '金色阳光', value: 'golden hour, warm sunlight' },
  { label: '赛博朋克', value: 'cyberpunk style, neon, futuristic' },
  { label: '水彩', value: 'watercolor painting style' },
];

const parseTags = (raw: string) =>
  String(raw || '')
    .split(/[,\uFF0C]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
};

type SidebarProps = {
  onFocusNode?: (nodeId: string) => void;
};

function SidebarContent({ onFocusNode }: SidebarProps) {
  const { getNodes } = useReactFlow();
  const {
    selectedNodeId,
    nodes,
    edges,
    promptLibrary,
    commitNodeEdit,
    restoreNodeRevision,
    removeNode,
    duplicateNode,
    addNode,
    generateFromNode,
    generateNodes,
    toggleFavoriteNode,
    savePromptToLibrary,
    clearSelection,
    selectOnlyNode,
  } = useCanvasStore();

  const quickBranchPresets = usePreferencesStore((s) => s.prefs.quickBranchPresets) || QUICK_BRANCH_SUGGESTIONS;
  const prefs = usePreferencesStore((s) => s.prefs);
  // updatePrefs removed - not used in current redesign

  const activeNodes = useMemo(() => nodes.filter((n) => !n.data.archived), [nodes]);
  const selectedNodes = useMemo(() => activeNodes.filter((n) => n.selected), [activeNodes]);
  const effectiveSelectedNodeId = selectedNodeId || (selectedNodes.length === 1 ? selectedNodes[0].id : null);
  const selectedNode = activeNodes.find((n) => n.id === effectiveSelectedNodeId) || null;
  const nodeId = effectiveSelectedNodeId;
  const [formData, setFormData] = useState<Partial<NodeData>>({});
  const [tagsDraft, setTagsDraft] = useState('');
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [continuingFromImage, setContinuingFromImage] = useState(false);
  // analyzingImage state removed - not used in current redesign
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [batchConcurrency, setBatchConcurrency] = useState<(typeof CONCURRENCY_OPTIONS)[number]>(3);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [canvasSearch, setCanvasSearch] = useState('');
  const [activeCanvasTag, setActiveCanvasTag] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [customBranchInput, setCustomBranchInput] = useState('');
  
  // Sidebar Tabs
  const [sidebarTab, setSidebarTab] = useState<'canvas' | 'library'>('canvas');
  const [librarySearch, setLibrarySearch] = useState('');
  const [activeLibraryTag] = useState('');

  // Note: favoriteNodes and failedNodesCount could be used for future features

  const topTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const n of activeNodes) {
      for (const t of n.data.tags || []) {
        const k = String(t || '').trim();
        if (!k) continue;
        tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Reduced to 10
      .map(([t]) => t);
  }, [activeNodes]);

  const filteredNodes = useMemo(() => {
    const q = canvasSearch.trim().toLowerCase();
    const activeTag = activeCanvasTag.trim();
    const result = activeNodes.filter((n) => {
      if (favoritesOnly && !n.data.favorite) return false;
      if (activeTag && !(n.data.tags || []).includes(activeTag)) return false;
      if (!q) return true;
      const hay = `${n.data.prompt || ''}\n${n.data.notes || ''}\n${(n.data.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
    result.sort((a, b) => {
      const at = String(a.data.updatedAt || a.data.createdAt || '');
      const bt = String(b.data.updatedAt || b.data.createdAt || '');
      return bt.localeCompare(at);
    });
    return result.slice(0, 60);
  }, [activeNodes, canvasSearch, activeCanvasTag, favoritesOnly]);

  // libraryTags removed - not currently used in redesigned UI

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const activeTag = activeLibraryTag.trim();
    return promptLibrary
      .filter((p) => {
        if (activeTag && !(p.tags || []).includes(activeTag)) return false;
        if (!q) return true;
        const hay = `${p.title || ''}\n${p.prompt || ''}\n${(p.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50);
  }, [promptLibrary, librarySearch, activeLibraryTag]);

  const handleCreateFromAsset = (asset: PromptAsset) => {
    const currentNodes = getNodes();
    // 简单的布局策略：在现有节点群的右下侧或中心偏移处
    // 这里简单地取最后一个节点的位置 + 偏移，或者默认位置
    const lastNode = currentNodes.length ? currentNodes[currentNodes.length - 1] : null;
    const offset = lastNode ? { x: lastNode.position.x + 60, y: lastNode.position.y + 60 } : { x: 120, y: 120 };
    
    const newNodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const newNode: AppNode = {
      id: newNodeId,
      type: 'generationNode',
      position: offset,
      data: {
        id: newNodeId,
        canvasId: selectedNode?.data.canvasId || 'default', // Fallback, likely unused if no selection
        type: 'txt2img',
        prompt: asset.prompt,
        count: prefs.defaultCount,
        imageSize: prefs.defaultImageSize,
        aspectRatio: prefs.defaultAspectRatio,
        modelName: selectedNode?.data.modelName || 'gemini-3-pro-image-preview',
        status: 'idle',
        createdAt: now,
        updatedAt: now,
        images: [],
        tags: asset.tags,
        notes: asset.notes,
      },
      selected: true,
    };

    addNode(newNode);
    selectOnlyNode(newNodeId);
    
    requestAnimationFrame(() => {
      onFocusNode?.(newNodeId);
    });
    
    toast.success('Created from library');
  };

  useEffect(() => {
    if (!selectedNode) return;
    setFormData(selectedNode.data);
    setActiveImageId(selectedNode.data.images?.[0]?.id || null);
    setTagsDraft((selectedNode.data.tags || []).join(', '));
    setAiChatOpen(false);
  }, [effectiveSelectedNodeId, selectedNode]);

  useEffect(() => {
    if (!selectedNode) return;
    const imgs = selectedNode.data.images || [];
    if (imgs.length === 0) {
      if (activeImageId) setActiveImageId(null);
      return;
    }
    if (!activeImageId || !imgs.some((img) => img.id === activeImageId)) {
      setActiveImageId(imgs[0].id);
    }
  }, [selectedNode?.data?.images, activeImageId, selectedNode]);

  const parentId = useMemo(() => {
    if (!effectiveSelectedNodeId) return null;
    return edges.find((e) => e.target === effectiveSelectedNodeId)?.source || null;
  }, [edges, effectiveSelectedNodeId]);

  const childIds = useMemo(() => {
    if (!effectiveSelectedNodeId) return [];
    const activeIds = new Set(activeNodes.map((n) => n.id));
    return edges
      .filter((e) => e.source === effectiveSelectedNodeId)
      .map((e) => e.target)
      .filter((id) => activeIds.has(id));
  }, [edges, effectiveSelectedNodeId, activeNodes]);

  const revisions = selectedNode?.data.revisions || [];

  const handleChange = (field: keyof NodeData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 产品决策：不支持 negativePrompt（负面提示词）。请勿在前端重新引入该输入或将其传入生成请求。
  const buildEditablePatch = (): Partial<NodeData> => ({
    prompt: String(formData.prompt || ''),
    promptParts: formData.promptParts,
    count: Math.max(1, Math.min(8, Number(formData.count || 1) || 1)),
    imageSize: (formData.imageSize || selectedNode?.data.imageSize || '2K') as NodeData['imageSize'],
    aspectRatio: (formData.aspectRatio || selectedNode?.data.aspectRatio || 'auto') as NodeData['aspectRatio'],
    ...(formData.generationBaseMode !== undefined ? { generationBaseMode: formData.generationBaseMode } : {}),
    ...(formData.tags !== undefined ? { tags: formData.tags } : {}),
    ...(formData.notes !== undefined ? { notes: formData.notes } : {}),
  });

  const handleSave = () => {
    if (!nodeId) return;
    commitNodeEdit(nodeId, buildEditablePatch(), { source: 'manual' });
    toast.success('Changes saved');
  };

  const handleGenerate = async () => {
    if (!nodeId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('Please enter a prompt');
      return;
    }
    setGenerating(true);
    try {
      const patch = buildEditablePatch();
      commitNodeEdit(nodeId, patch, { source: 'manual' });
      const newIds = await generateFromNode(nodeId, { mode: 'append' });
      if (newIds?.[0]) onFocusNode?.(newIds[0]);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!nodeId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('Please enter a prompt');
      return;
    }
    setRegenerating(true);
    try {
      const patch = buildEditablePatch();
      commitNodeEdit(nodeId, patch, { source: 'manual' });
      const newIds = await generateFromNode(nodeId, { mode: 'regenerate' });
      if (newIds?.[0]) onFocusNode?.(newIds[0]);
    } finally {
      setRegenerating(false);
    }
  };

  // handleAnalyzeImage removed - not used in current redesign

  const handleContinueFromImage = async () => {
    if (!nodeId || !activeImageId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('Please enter a prompt');
      return;
    }

    const overrides: Partial<NodeData> = {
      prompt: String(formData.prompt || ''),
      promptParts: formData.promptParts,
      count: Math.max(1, Math.min(8, Number(formData.count || 1) || 1)),
      imageSize: (formData.imageSize || selectedNode?.data.imageSize || '2K') as NodeData['imageSize'],
      aspectRatio: (formData.aspectRatio || selectedNode?.data.aspectRatio || 'auto') as NodeData['aspectRatio'],
    };

    setContinuingFromImage(true);
    try {
      const newIds = await generateFromNode(nodeId, {
        mode: 'append',
        overrides: { ...overrides, generationBaseMode: 'image', referenceImageId: activeImageId },
      });
      if (newIds?.[0]) onFocusNode?.(newIds[0]);
    } finally {
      setContinuingFromImage(false);
    }
  };

  if (selectedNodes.length > 1) {
    const ids = selectedNodes.map((n) => n.id);

    return (
      <div className="w-full h-full flex flex-col bg-transparent text-foreground">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Batch Mode</div>
            <div className="text-xs text-muted-foreground truncate">Comparing {selectedNodes.length} nodes</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-lg border-none bg-secondary/30 px-2 text-xs"
              value={batchConcurrency}
              onChange={(e) => setBatchConcurrency(Number(e.target.value) as any)}
              title="Concurrency"
            >
              {CONCURRENCY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}x
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-8"
              disabled={batchGenerating}
              onClick={async () => {
                setBatchGenerating(true);
                try {
                  await generateNodes(ids, { concurrency: batchConcurrency });
                } finally {
                  setBatchGenerating(false);
                }
              }}
            >
              {batchGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Run All
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => clearSelection()}
              title="Clear Selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {selectedNodes.map((node) => {
            // disabled state computed inline where needed
            const status = STATUS_LABEL[node.data.status] || node.data.status;

            return (
              <div
                key={node.id}
                className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      {node.data.imageSize} · {node.data.aspectRatio} · {node.data.count}
                    </div>
                    <div className="text-sm font-medium text-foreground/90 line-clamp-2">
                      {node.data.prompt || <span className="text-muted-foreground italic">(Empty)</span>}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 text-xs px-2 py-1 rounded-md font-medium',
                      node.data.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : node.data.status === 'failed'
                          ? 'bg-red-500/10 text-red-400'
                          : node.data.status === 'running' || node.data.status === 'queued'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {status}
                  </div>
                </div>

                {node.data.images?.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {node.data.images.slice(0, 4).map((img) => (
                      <div
                        key={img.id}
                        className="relative aspect-square rounded-lg overflow-hidden border border-white/5 bg-black/20"
                      >
                        <ResolvedImage src={img.url} alt={img.id} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!nodeId || !selectedNode) {
    // 无选中节点时：提供 "画布检索" 和 "全局库" 两个 Tab
    return (
      <div className="w-full h-full flex flex-col bg-transparent text-foreground">
        {/* Tab Header - Segmented Control */}
        <div className="px-5 py-4 shrink-0">
          <div className="flex p-1 bg-secondary/50 rounded-xl">
            <button
              onClick={() => setSidebarTab('canvas')}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm",
                sidebarTab === 'canvas'
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground hover:text-foreground shadow-none"
              )}
            >
              Canvas Nodes
            </button>
            <button
              onClick={() => setSidebarTab('library')}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all",
                sidebarTab === 'library'
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground hover:text-foreground shadow-none"
              )}
            >
              Prompt Library
            </button>
          </div>
        </div>

        {/* Tab 1: 画布检索 */}
        {sidebarTab === 'canvas' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 pb-3">
              <Input
                value={canvasSearch}
                onChange={(e) => setCanvasSearch(e.target.value)}
                placeholder="Search nodes..."
                className="bg-secondary/30 border-transparent focus-visible:bg-background h-9 rounded-xl text-xs"
              />
              <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar py-1">
                <button
                   onClick={() => setFavoritesOnly((v) => !v)}
                   className={cn(
                     "shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors flex items-center gap-1",
                     favoritesOnly 
                       ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-500" 
                       : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50"
                   )}
                >
                  <Star className={cn("w-3 h-3", favoritesOnly && "fill-current")} />
                  Favorites
                </button>
                {topTags.map((t) => (
                  <button
                    key={t}
                    className={cn(
                      'shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors',
                      activeCanvasTag === t
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50'
                    )}
                    onClick={() => setActiveCanvasTag((prev) => (prev === t ? '' : t))}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
              {filteredNodes.length ? (
                filteredNodes.map((n) => (
                  <div
                    key={n.id}
                    className="group flex flex-col gap-1.5 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer active:scale-[0.98]"
                    onClick={() => {
                      selectOnlyNode(n.id);
                      onFocusNode?.(n.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        n.data.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" :
                        n.data.status === 'failed' ? "bg-red-500/10 text-red-500" :
                        "bg-blue-500/10 text-blue-500"
                      )}>
                        {STATUS_LABEL[n.data.status] || n.data.status}
                      </span>
                      {n.data.favorite && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                    </div>
                    <p className="text-xs font-medium leading-relaxed line-clamp-2 text-foreground/90">
                      {n.data.prompt || <span className="text-muted-foreground italic">Empty prompt...</span>}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-1">
                      <span>{n.data.imageSize}</span>
                      <span>•</span>
                      <span>{new Date(n.data.updatedAt || n.data.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-5 h-5 opacity-40" />
                  </div>
                  <p className="text-xs text-muted-foreground">No nodes found</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">Double click canvas to create one</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: 提示词库 (Global Library) */}
        {sidebarTab === 'library' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 pb-3">
               <Input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search library..."
                  className="bg-secondary/30 border-transparent focus-visible:bg-background h-9 rounded-xl text-xs"
                />
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
                {filteredLibrary.length ? (
                  filteredLibrary.map((asset) => (
                    <div
                      key={asset.id}
                      className="group p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground/90 truncate">
                            {asset.title || 'Untitled Asset'}
                          </div>
                          {asset.tags?.length ? (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {asset.tags.slice(0, 3).map(t => (
                                <span key={t} className="text-[10px] text-muted-foreground/70">#{t}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button 
                          size="sm" 
                          className="h-7 w-7 p-0 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-none"
                          onClick={() => handleCreateFromAsset(asset)}
                          title="Use this prompt"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed bg-black/5 p-2 rounded-lg">
                        {asset.prompt}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <BookMarked className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No assets found
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-transparent text-foreground font-sans">
      {/* Header - Single Node Selection */}
      <div className="px-5 py-4 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-primary tracking-wide uppercase">Node Settings</span>
            {selectedNode.data.favorite && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {selectedNode.data.modelName} • {selectedNode.data.imageSize}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-secondary/50"
            onClick={() => toggleFavoriteNode(nodeId)}
            title={selectedNode.data.favorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star
              className={cn(
                'h-4 w-4',
                selectedNode.data.favorite ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-secondary/50"
            onClick={clearSelection}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 space-y-6 pb-6">
        {selectedNode.data.errorMessage ? (
          <div
            className={cn(
              'rounded-xl border px-3 py-2.5 text-xs font-medium',
              selectedNode.data.status === 'failed'
                ? 'border-red-500/20 bg-red-500/10 text-red-400'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
            )}
          >
            {selectedNode.data.errorMessage}
          </div>
        ) : null}

        {/* Prompt Section */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prompt</label>
          <div className="rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/5 focus-within:ring-primary/50 transition-all">
            <PromptPartsEditor
              value={String(formData.prompt || '')}
              promptParts={formData.promptParts}
              placeholder="What do you want to create?"
              className="bg-transparent border-none"
              editorClassName="bg-transparent border-none min-h-[100px] text-sm leading-relaxed px-3 py-3"
              onChange={({ prompt, promptParts: nextParts }) => {
                handleChange('prompt', prompt);
                handleChange('promptParts', nextParts);
              }}
            />
          </div>
        </div>
        
        {/* Params Grid */}
        <div className="grid grid-cols-2 gap-3">
           <div className="space-y-1.5">
             <label className="text-xs font-semibold text-muted-foreground">Count</label>
             <div className="flex items-center gap-2 bg-secondary/30 rounded-lg p-1">
                <Input
                  type="number"
                  min={1}
                  max={8}
                  className="h-7 bg-transparent border-none text-center font-mono text-sm shadow-none focus-visible:ring-0 px-0"
                  value={Number(formData.count || 1)}
                  onChange={(e) => handleChange('count', Number(e.target.value) || 1)}
                />
             </div>
           </div>
           <div className="space-y-1.5">
             <label className="text-xs font-semibold text-muted-foreground">Size</label>
              <select
                className="w-full h-9 rounded-lg border-none bg-secondary/30 px-2 text-xs font-medium focus:ring-2 focus:ring-primary/20"
                value={(formData.imageSize as any) || '2K'}
                onChange={(e) => handleChange('imageSize', e.target.value)}
              >
                {IMAGE_SIZE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
           </div>
           <div className="space-y-1.5 col-span-2">
             <label className="text-xs font-semibold text-muted-foreground">Aspect Ratio</label>
             <div className="grid grid-cols-6 gap-1">
                {ASPECT_RATIO_OPTIONS.map((v) => (
                  <button
                    key={v}
                    onClick={() => handleChange('aspectRatio', v)}
                    className={cn(
                      "aspect-square rounded-md flex items-center justify-center text-[10px] font-medium transition-all",
                      (formData.aspectRatio || 'auto') === v
                        ? "bg-primary text-primary-foreground shadow-sm scale-105"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                    )}
                    title={v}
                  >
                    {v === 'auto' ? 'A' : v.replace(':', '/')}
                  </button>
                ))}
             </div>
           </div>
        </div>

        {/* Tags & Notes */}
        <div className="space-y-3 pt-2 border-t border-white/5">
          <div className="space-y-1.5">
             <label className="text-xs font-semibold text-muted-foreground">Tags</label>
             <Input
                value={tagsDraft}
                onChange={(e) => {
                  setTagsDraft(e.target.value);
                  handleChange('tags', parseTags(e.target.value));
                }}
                placeholder="e.g. realistic, portrait..."
                className="h-8 bg-secondary/20 border-transparent rounded-lg text-xs"
              />
          </div>
          <div className="space-y-1.5">
             <label className="text-xs font-semibold text-muted-foreground">Notes</label>
             <textarea
                className="w-full min-h-[60px] rounded-lg border-transparent bg-secondary/20 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                value={String(formData.notes || '')}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Notes about this variation..."
              />
          </div>
        </div>

        {/* 快速分支 - Modern Card */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shadow-inner">
              <GitBranch className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold text-primary">Quick Branch</div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {quickBranchPresets.map((s, i) => (
              <button
                key={`${s.label}-${s.value}-${i}`}
                className="px-3 py-1.5 rounded-full bg-background/50 border border-primary/10 text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all active:scale-95"
                onClick={() => {
                  const basePrompt = String(formData.prompt || '').trim();
                  if (!basePrompt) {
                    toast.error('Please enter a prompt first');
                    return;
                  }
                  const nextPrompt = `${basePrompt}, ${s.value}`;
                  if (!nodeId) return;
                  void (async () => {
                    const newIds = await generateFromNode(nodeId, {
                      mode: 'append',
                      overrides: { prompt: nextPrompt, notes: s.label },
                    });
                    if (newIds?.[0]) onFocusNode?.(newIds[0]);
                  })();
                }}
                title={s.value}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Input
              className="h-10 pl-3 pr-16 bg-background/60 border-primary/10 rounded-xl text-xs backdrop-blur-sm focus:bg-background"
              placeholder="Custom variation..."
              value={customBranchInput}
              onChange={(e) => setCustomBranchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customBranchInput.trim()) {
                   // ... logic ...
                   const basePrompt = String(formData.prompt || '').trim();
                    if (!basePrompt) {
                      toast.error('Please enter a prompt first');
                      return;
                    }
                    const nextPrompt = `${basePrompt}, ${customBranchInput.trim()}`;
                    if (!nodeId) return;
                    void (async () => {
                      const newIds = await generateFromNode(nodeId, {
                        mode: 'append',
                        overrides: { prompt: nextPrompt, notes: customBranchInput.trim() },
                      });
                      if (newIds?.[0]) onFocusNode?.(newIds[0]);
                      setCustomBranchInput('');
                    })();
                }
              }}
            />
            <Button
              size="sm"
              className="absolute right-1 top-1 h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider"
              disabled={!customBranchInput.trim()}
              onClick={() => {
                  const basePrompt = String(formData.prompt || '').trim();
                  if (!basePrompt) {
                    toast.error('Please enter a prompt first');
                    return;
                  }
                  const nextPrompt = `${basePrompt}, ${customBranchInput.trim()}`;
                  if (!nodeId) return;
                  void (async () => {
                    const newIds = await generateFromNode(nodeId, {
                      mode: 'append',
                      overrides: { prompt: nextPrompt, notes: customBranchInput.trim() },
                    });
                    if (newIds?.[0]) onFocusNode?.(newIds[0]);
                    setCustomBranchInput('');
                  })();
              }}
            >
              GO
            </Button>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            className="h-10 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            onClick={handleGenerate} 
            disabled={generating || regenerating}
          >
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
            Generate
          </Button>
          <Button 
            variant="secondary" 
            className="h-10 rounded-xl bg-secondary/50 hover:bg-secondary font-medium"
            onClick={handleSave}
          >
            Save Changes
          </Button>
          <Button 
            variant="outline" 
            className="h-10 rounded-xl border-white/10 hover:bg-white/5"
            onClick={handleRegenerate} 
            disabled={generating || regenerating}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
          <Button 
            variant="outline" 
            className="h-10 rounded-xl border-white/10 hover:bg-white/5"
            onClick={() => duplicateNode(nodeId)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
        </div>

        {/* History List */}
        <div className="space-y-2 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Versions</label>
            <span className="text-[10px] text-muted-foreground bg-secondary/30 px-1.5 py-0.5 rounded">{revisions.length}</span>
          </div>
          {revisions.length > 0 ? (
            <div className="space-y-2">
              {revisions.slice(0, 5).map((rev) => (
                <div key={rev.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/10 hover:bg-secondary/30 transition-colors group">
                   <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                         <span>{new Date(rev.createdAt).toLocaleTimeString()}</span>
                         <span className="w-1 h-1 rounded-full bg-white/20"></span>
                         <span>{rev.imageSize}</span>
                      </div>
                      <div className="text-xs truncate opacity-70 mt-0.5">{rev.prompt}</div>
                   </div>
                   <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                          restoreNodeRevision(nodeId, rev.id);
                          setFormData((prev) => ({
                            ...prev,
                            prompt: rev.prompt,
                            count: rev.count,
                            imageSize: rev.imageSize,
                            aspectRatio: rev.aspectRatio,
                          }));
                          toast.success('Restored');
                      }}
                      title="Restore"
                    >
                      <RotateCcw className="w-3 h-3" />
                   </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground/50 italic">No history yet</div>
          )}
        </div>


        {/* Relations */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary/80" />
            迭代关系
          </div>

          {parentId ? (
            <button
              className="w-full text-left rounded-md border border-border bg-background px-3 py-2 hover:bg-secondary transition-colors"
              onClick={() => {
                selectOnlyNode(parentId);
                onFocusNode?.(parentId);
              }}
              title="跳转到父节点"
            >
              <div className="text-[11px] text-muted-foreground mb-0.5">父节点</div>
              <div className="text-xs text-foreground/90 truncate">
                {activeNodes.find((n) => n.id === parentId)?.data?.prompt || parentId}
              </div>
            </button>
          ) : (
            <div className="text-xs text-muted-foreground">起点节点（无父节点）</div>
          )}

          {childIds.length ? (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">子节点 {childIds.length} 个</div>
              <div className="space-y-1">
                {childIds.slice(0, 6).map((cid) => {
                  const child = activeNodes.find((n) => n.id === cid);
                  const label = child?.data?.prompt || cid;
                  const statusText = STATUS_LABEL[String(child?.data?.status || 'idle')] || String(child?.data?.status || 'idle');
                  return (
                    <button
                      key={cid}
                      className="w-full text-left rounded-md border border-border bg-background px-3 py-2 hover:bg-secondary transition-colors"
                      onClick={() => {
                        selectOnlyNode(cid);
                        onFocusNode?.(cid);
                      }}
                      title="跳转到子节点"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-foreground/90 truncate">{label}</div>
                        <div className="text-[11px] text-muted-foreground shrink-0">{statusText}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {childIds.length > 6 ? (
                <div className="text-[11px] text-muted-foreground">还有 {childIds.length - 6} 个子节点…</div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">暂无子节点</div>
          )}
        </div>

        {/* Images Section */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
              Generated Images
            </label>
            <div className="flex items-center gap-2">
              {activeImageId ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] rounded-lg border-white/10"
                    onClick={handleContinueFromImage}
                    disabled={continuingFromImage}
                  >
                    {continuingFromImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <GitBranch className="h-3 w-3 mr-1" />
                    )}
                    Continue
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] rounded-lg border-white/10"
                    onClick={() => setAiChatOpen(true)}
                    title="AI Chat"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Chat
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {selectedNode.data.images?.length ? (
            <div className="grid grid-cols-2 gap-2">
              {selectedNode.data.images.map((img) => (
                <button
                  key={img.id}
                  className={cn(
                    'relative aspect-square rounded-xl overflow-hidden border-2 transition-all',
                    activeImageId === img.id 
                      ? 'border-primary ring-2 ring-primary/20 scale-[1.02]' 
                      : 'border-white/5 hover:border-white/20'
                  )}
                  onClick={() => setActiveImageId(img.id)}
                >
                  <ResolvedImage src={img.url} alt={img.id} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <div className="w-full aspect-[2/1] rounded-xl border-2 border-dashed border-white/10 bg-secondary/10 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <ImageIcon className="h-6 w-6 opacity-20" />
              <span className="text-xs opacity-40">No images yet</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/5 space-y-2">
          <Button
            variant="outline"
            className="w-full h-9 rounded-xl border-white/10 text-xs font-medium hover:bg-white/5"
            onClick={() => {
              savePromptToLibrary(nodeId);
              toast.success('Saved to library');
            }}
          >
            <BookMarked className="mr-2 h-3.5 w-3.5" />
            Save to Library
          </Button>
          <Button
            variant="ghost"
            className="w-full h-9 rounded-xl text-xs font-medium text-red-400/80 hover:text-red-400 hover:bg-red-500/10"
            onClick={() => {
              if (!confirm('Delete this node?')) return;
              removeNode(nodeId);
              clearSelection();
              toast.success('Node deleted');
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete Node
          </Button>
        </div>
      </div>

      {nodeId && activeImageId ? (
        <AiChatDialog open={aiChatOpen} onOpenChange={setAiChatOpen} nodeId={nodeId} imageId={activeImageId} onFocusNode={onFocusNode} />
      ) : null}
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* 折叠/展开按钮 - 移动端始终可见 */}
      <div
        className={cn(
          "absolute z-50 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isCollapsed 
            ? "right-4 top-4" 
            : "md:right-[400px] right-[calc(100%-16px)] top-4 md:top-1/2 md:-translate-y-1/2",
          // 桌面端未收起时半隐藏，移动端始终可见
          !isCollapsed && "md:opacity-0 md:hover:opacity-100 md:pointer-events-none md:hover:pointer-events-auto"
        )}
      >
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full shadow-lg border border-white/10 bg-card/80 backdrop-blur-md hover:bg-card hover:scale-105 transition-all",
            !isCollapsed && "md:translate-x-1/2"
          )}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {isCollapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </div>
      
      {/* 侧边栏主体 - Floating Panel */}
      <div 
        className={cn(
          "absolute z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col",
          "pointer-events-none",
          // 移动端全屏，桌面端悬浮
          "top-0 bottom-0 right-0 md:top-4 md:bottom-4 md:right-4",
          isCollapsed ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
        )}
      >
        <div 
          className={cn(
            "w-full md:w-[380px] h-full flex flex-col",
            "bg-card/95 md:bg-card/85 backdrop-blur-2xl backdrop-saturate-150",
            "border-l md:border border-white/10 dark:border-white/5 shadow-2xl shadow-black/10",
            "md:rounded-[28px] overflow-hidden pointer-events-auto md:ring-1 ring-black/5"
          )}
        >
           <SidebarContent {...props} />
        </div>
      </div>
    </>
  );
}
