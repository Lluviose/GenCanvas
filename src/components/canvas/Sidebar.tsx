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
import { BookMarked, Copy, GitBranch, Image as ImageIcon, Loader2, Play, RotateCcw, Sparkles, Star, Trash2, Wand2, X, ArrowRight, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
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
  idle: '未生成',
  queued: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
};

const REV_SOURCE_LABEL: Record<string, string> = {
  manual: '手动',
  asset: '提示词库',
  suggestion: '建议',
  rollback: '还原',
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
    branchNode,
    generateFromNode,
    generateNodes,
    toggleFavoriteNode,
    analyzeNodePrompt,
    analyzeNodeImage,
    savePromptToLibrary,
    applyPromptAssetToNode,
    clearSelection,
    selectOnlyNode,
    clearFailedNodes,
  } = useCanvasStore();

  const quickBranchPresets = usePreferencesStore((s) => s.prefs.quickBranchPresets) || QUICK_BRANCH_SUGGESTIONS;
  const prefs = usePreferencesStore((s) => s.prefs);
  const updatePrefs = usePreferencesStore((s) => s.updatePrefs);

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
  const [continuing, setContinuing] = useState(false);
  const [continuingFromImage, setContinuingFromImage] = useState(false);
  const [analyzingPrompt, setAnalyzingPrompt] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [batchConcurrency, setBatchConcurrency] = useState<(typeof CONCURRENCY_OPTIONS)[number]>(3);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchBranchDraft, setBatchBranchDraft] = useState('');
  const [batchBranching, setBatchBranching] = useState(false);
  const [canvasSearch, setCanvasSearch] = useState('');
  const [activeCanvasTag, setActiveCanvasTag] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [customBranchInput, setCustomBranchInput] = useState('');
  
  // Sidebar Tabs
  const [sidebarTab, setSidebarTab] = useState<'canvas' | 'library'>('canvas');
  const [librarySearch, setLibrarySearch] = useState('');
  const [activeLibraryTag, setActiveLibraryTag] = useState('');

  const favoriteNodes = useMemo(() => activeNodes.filter((n) => n.data.favorite), [activeNodes]);
  const failedNodesCount = useMemo(() => activeNodes.filter((n) => n.data.status === 'failed').length, [activeNodes]);

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
      .slice(0, 18)
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

  const libraryTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of promptLibrary) {
      for (const t of p.tags || []) {
        const k = String(t || '').trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([t]) => t);
  }, [promptLibrary]);

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
    
    toast.success('已从库中创建节点');
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

  const promptSuggestion = useMemo(() => {
    const parsed = selectedNode?.data?.promptAnalysis?.parsed;
    const suggestedPrompt = typeof parsed?.suggestedPrompt === 'string' ? parsed.suggestedPrompt : '';
    return { suggestedPrompt };
  }, [selectedNode?.data?.promptAnalysis?.parsed]);

  const imageAnalysis = useMemo(() => {
    if (!selectedNode || !activeImageId) return null;
    return selectedNode.data.imageAnalyses?.[activeImageId] || null;
  }, [selectedNode, activeImageId]);

  const imageSuggestion = useMemo(() => {
    const parsed = imageAnalysis?.parsed as any;
    const suggestedPrompt = typeof parsed?.suggestedPrompt === 'string' ? String(parsed.suggestedPrompt).trim() : '';
    return { suggestedPrompt };
  }, [imageAnalysis?.parsed]);

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
  const isNodeBusy = Boolean(selectedNode && (selectedNode.data.status === 'running' || selectedNode.data.status === 'queued'));

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
    toast.success('已保存');
  };

  const handleGenerate = async () => {
    if (!nodeId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('请先填写提示词');
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
      toast.error('请先填写提示词');
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

  const handleContinue = async () => {
    if (!nodeId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('请先填写提示词');
      return;
    }

    const overrides: Partial<NodeData> = {
      prompt: String(formData.prompt || ''),
      promptParts: formData.promptParts,
      count: Math.max(1, Math.min(8, Number(formData.count || 1) || 1)),
      imageSize: (formData.imageSize || selectedNode?.data.imageSize || '2K') as NodeData['imageSize'],
      aspectRatio: (formData.aspectRatio || selectedNode?.data.aspectRatio || 'auto') as NodeData['aspectRatio'],
    };

    setContinuing(true);
    try {
      const newIds = await generateFromNode(nodeId, { mode: 'append', overrides });
      if (newIds?.[0]) onFocusNode?.(newIds[0]);
    } finally {
      setContinuing(false);
    }
  };

  const handleAnalyzePrompt = async () => {
    if (!nodeId) return;
    const prompt = String(formData.prompt || '').trim();
    if (!prompt) {
      toast.error('请先填写提示词');
      return;
    }
    setAnalyzingPrompt(true);
    try {
      const patch = buildEditablePatch();
      commitNodeEdit(nodeId, patch, { source: 'manual' });
      await analyzeNodePrompt(nodeId);
    } finally {
      setAnalyzingPrompt(false);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!nodeId || !activeImageId) return;
    setAnalyzingImage(true);
    try {
      await analyzeNodeImage(nodeId, activeImageId);
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleContinueFromImage = async () => {
    if (!nodeId || !activeImageId) return;
    if (!hasEffectivePromptContent(String(formData.prompt || ''), formData.promptParts)) {
      toast.error('请先填写提示词');
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

  const parseBatchTweaks = (raw: string) =>
    String(raw || '')
      .split(/\r?\n/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

  const handleBatchBranch = async (autoGenerate: boolean) => {
    if (!nodeId) return;
    const basePrompt = String(formData.prompt || '').trim();
    if (!basePrompt) {
      toast.error('请先填写提示词');
      return;
    }
    const tweaks = parseBatchTweaks(batchBranchDraft);
    if (tweaks.length === 0) {
      toast.error('请至少输入一行分支变化');
      return;
    }

    const baseOverrides = buildEditablePatch();
    delete (baseOverrides as any).tags;
    delete (baseOverrides as any).notes;

    setBatchBranching(true);
    try {
      const newIds: string[] = [];
      for (const tweak of tweaks) {
        const nextPrompt = `${basePrompt}, ${tweak}`;
        const newId = branchNode(nodeId, { ...baseOverrides, prompt: nextPrompt, notes: tweak } as Partial<NodeData>);
        if (newId) newIds.push(newId);
      }

      if (newIds.length === 0) return;
      selectOnlyNode(newIds[0]);
      onFocusNode?.(newIds[0]);

      if (autoGenerate) {
        await generateNodes(newIds, { concurrency: batchConcurrency });
      }

      setBatchBranchDraft('');
    } finally {
      setBatchBranching(false);
    }
  };

  if (selectedNodes.length > 1) {
    const ids = selectedNodes.map((n) => n.id);

    return (
      <div className="w-full bg-background h-full flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">对比 {selectedNodes.length} 个节点</div>
            <div className="text-xs text-muted-foreground truncate">批量生成并横向对比结果</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={batchConcurrency}
              onChange={(e) => setBatchConcurrency(Number(e.target.value) as any)}
              title="并发数"
            >
              {CONCURRENCY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  并发 {v}
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
              title="并发批量生成"
            >
              {batchGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  批量生成
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => clearSelection()}
              title="清除选择"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {selectedNodes.map((node) => {
            const disabled = node.data.status === 'running' || node.data.status === 'queued';
            const status =
              node.data.status === 'queued'
                ? '排队中'
                : node.data.status === 'running'
                  ? '生成中'
                  : node.data.status === 'completed'
                    ? '完成'
                    : node.data.status === 'failed'
                      ? '失败'
                      : '空闲';

            return (
              <div
                key={node.id}
                className="rounded-xl border border-border bg-card p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      {node.data.imageSize} · {node.data.aspectRatio} · {node.data.count} 张
                    </div>
                    <div className="text-sm font-medium text-foreground/90 line-clamp-2">
                      {node.data.prompt || <span className="text-muted-foreground italic">（空提示词）</span>}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 text-xs px-2 py-1 rounded-md border',
                      node.data.status === 'completed'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        : node.data.status === 'failed'
                          ? 'border-red-500/20 bg-red-500/10 text-red-300'
                          : node.data.status === 'running' || node.data.status === 'queued'
                            ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                            : 'border-border bg-background text-muted-foreground'
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
                        className="relative aspect-square rounded-lg overflow-hidden border border-border bg-background"
                      >
                        <img src={img.url} alt={img.id} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full aspect-[2/1] rounded-lg border border-dashed border-border bg-background flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <ImageIcon className="h-7 w-7 opacity-30" />
                    <span className="text-xs opacity-60">暂无图片</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={disabled}
                    onClick={async () => {
                      if (!hasEffectivePromptContent(String(node.data.prompt || ''), node.data.promptParts)) {
                        toast.error('请先填写提示词');
                        return;
                      }
                      const newIds = await generateFromNode(node.id, { mode: 'append' });
                      if (newIds?.[0]) onFocusNode?.(newIds[0]);
                    }}
                    title={disabled ? '该节点正在生成' : '生成该节点'}
                  >
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    生成
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => {
                      selectOnlyNode(node.id);
                      onFocusNode?.(node.id);
                    }}
                    title="打开单节点详情"
                  >
                    打开
                  </Button>
                </div>

                {node.data.errorMessage ? (
                  <div className={cn('text-xs', node.data.status === 'failed' ? 'text-red-300' : 'text-amber-300')}>
                    {node.data.errorMessage}
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
      <div className="w-full bg-background h-full flex flex-col">
        {/* Tab Header */}
        <div className="px-4 py-0 border-b border-border bg-card">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSidebarTab('canvas')}
              className={cn(
                "py-3 text-sm font-medium border-b-2 transition-colors",
                sidebarTab === 'canvas'
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              画布节点
            </button>
            <button
              onClick={() => setSidebarTab('library')}
              className={cn(
                "py-3 text-sm font-medium border-b-2 transition-colors",
                sidebarTab === 'library'
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              提示词库
            </button>
          </div>
        </div>

        {/* Tab 1: 画布检索 */}
        {sidebarTab === 'canvas' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border bg-card/50">
              <div className="text-xs text-muted-foreground">检索当前画布内的节点与历史</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-2">
                <Input
                  value={canvasSearch}
                  onChange={(e) => setCanvasSearch(e.target.value)}
                  placeholder="搜索：人物/风格/构图/氛围…"
                  className="bg-background"
                />
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant={favoritesOnly ? 'secondary' : 'outline'}
                    className="h-8"
                    onClick={() => setFavoritesOnly((v) => !v)}
                  >
                    <Star className={cn('mr-2 h-4 w-4', favoritesOnly ? 'fill-yellow-400 text-yellow-400' : '')} />
                    只看收藏
                  </Button>
                  <div className="flex items-center gap-2">
                    {failedNodesCount > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          if (!confirm(`确定清除 ${failedNodesCount} 个失败节点吗？`)) return;
                          clearFailedNodes();
                        }}
                        title="一键清除生成失败的节点"
                      >
                        清除失败（{failedNodesCount}）
                      </Button>
                    ) : null}
                    {activeCanvasTag ? (
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setActiveCanvasTag('')}>
                        清除标签
                      </Button>
                    ) : null}
                  </div>
                </div>
                {topTags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {topTags.map((t) => {
                      const active = activeCanvasTag === t;
                      return (
                        <button
                          key={t}
                          className={cn(
                            'px-2 py-1 rounded-full border text-[11px]',
                            active
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          )}
                          onClick={() => setActiveCanvasTag((prev) => (prev === t ? '' : t))}
                          title="按标签过滤"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {favoriteNodes.length ? (
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    收藏节点
                  </div>
                  <div className="space-y-2">
                    {favoriteNodes.slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-2"
                      >
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            selectOnlyNode(n.id);
                            onFocusNode?.(n.id);
                          }}
                          title="打开节点"
                        >
                          <div className="text-xs text-foreground/90 truncate">{n.data.prompt || '（未填写提示词）'}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{STATUS_LABEL[n.data.status] || n.data.status}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleFavoriteNode(n.id)}
                          title="取消收藏"
                        >
                          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        </Button>
                      </div>
                    ))}
                    {favoriteNodes.length > 8 ? (
                      <div className="text-[11px] text-muted-foreground">还有 {favoriteNodes.length - 8} 个收藏…</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="text-sm font-medium">搜索结果</div>
                {filteredNodes.length ? (
                  <div className="space-y-2">
                    {filteredNodes.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-2"
                      >
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            selectOnlyNode(n.id);
                            onFocusNode?.(n.id);
                          }}
                          title="打开节点"
                        >
                          <div className="text-xs text-foreground/90 truncate">{n.data.prompt || '（未填写提示词）'}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {STATUS_LABEL[n.data.status] || n.data.status}
                            {n.data.tags?.length ? ` · ${n.data.tags.slice(0, 3).join(' / ')}` : ''}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleFavoriteNode(n.id)}
                          title={n.data.favorite ? '取消收藏' : '收藏节点'}
                        >
                          <Star
                            className={cn(
                              'h-4 w-4',
                              n.data.favorite ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-400'
                            )}
                          />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">暂无匹配节点</div>
                )}
              </div>

              <div className="text-xs text-muted-foreground flex items-center justify-center gap-2 pt-4">
                <Sparkles className="h-4 w-4 opacity-60" />
                双击画布空白处可创建新节点
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: 提示词库 (Global Library) */}
        {sidebarTab === 'library' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border bg-card/50">
              <div className="text-xs text-muted-foreground">从全局库中复用资产，点击使用创建新节点</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-2">
                <Input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="搜索库：标题/提示词/标签…"
                  className="bg-background"
                />
                
                {libraryTags.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {libraryTags.map((t) => {
                      const active = activeLibraryTag === t;
                      return (
                        <button
                          key={t}
                          className={cn(
                            'px-2 py-1 rounded-full border text-[11px]',
                            active
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          )}
                          onClick={() => setActiveLibraryTag((prev) => (prev === t ? '' : t))}
                        >
                          {t}
                        </button>
                      );
                    })}
                    {activeLibraryTag && (
                       <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setActiveLibraryTag('')}>
                        清除
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {filteredLibrary.length ? (
                  filteredLibrary.map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-border bg-card p-3 space-y-2 group hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate text-foreground/90">
                            {asset.title || asset.prompt}
                          </div>
                          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                            {asset.prompt}
                          </div>
                          {asset.tags?.length ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {asset.tags.slice(0, 3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 rounded border border-border/50 bg-background/50 text-[10px] text-muted-foreground">
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      
                      <div className="pt-2 flex items-center justify-between border-t border-border/50 mt-2">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                           {asset.isFavorite && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                           {typeof asset.aiQualityScore === 'number' && asset.aiQualityScore >= 80 && (
                             <span className="text-emerald-400 flex items-center gap-0.5">
                               <Wand2 className="w-3 h-3" />
                               {Math.round(asset.aiQualityScore)}
                             </span>
                           )}
                        </div>
                        <Button 
                          size="sm" 
                          className="h-7 px-3 text-xs"
                          onClick={() => handleCreateFromAsset(asset)}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          使用
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <BookMarked className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    没有找到匹配的提示词
                  </div>
                )}
                
                {promptLibrary.length === 0 && (
                   <div className="p-4 rounded-lg bg-secondary/30 text-center space-y-2">
                     <p className="text-xs text-muted-foreground">提示词库为空</p>
                     <p className="text-[10px] text-muted-foreground/70">
                       在画布中选中满意的节点，点击“存入提示词库”，即可在这里复用。
                     </p>
                   </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-background h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{selectedNode.data.modelName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {selectedNode.data.imageSize} · {selectedNode.data.aspectRatio} · {selectedNode.data.count} 张
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearSelection} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedNode.data.errorMessage ? (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs',
              selectedNode.data.status === 'failed'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            )}
          >
            {selectedNode.data.errorMessage}
          </div>
        ) : null}

        {/* Prompt */}
        <div className="space-y-2">
          <label className="text-sm font-medium">提示词</label>
          <PromptPartsEditor
            value={String(formData.prompt || '')}
            promptParts={formData.promptParts}
            placeholder="描述主体、风格、构图、光线、材质、镜头…（可用右侧 + 插入参考图）"
            onChange={({ prompt, promptParts: nextParts }) => {
              handleChange('prompt', prompt);
              handleChange('promptParts', nextParts);
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">标签（逗号分隔）</label>
          <Input
            value={tagsDraft}
            onChange={(e) => {
              setTagsDraft(e.target.value);
              handleChange('tags', parseTags(e.target.value));
            }}
            placeholder="例如：写实, 插画, 人像, 特写, 雨夜…"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">分支说明 / 备注（可选）</label>
          <textarea
            className="w-full min-h-[90px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            value={String(formData.notes || '')}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="这条分支想探索什么变化？例如：从写实→插画 / 全身像→特写 / 白天→雨夜…"
          />
        </div>

        {/* 快速分支 - 核心功能突出显示 */}
        <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">从这里继续</div>
              <div className="text-[11px] text-muted-foreground">点击快速分支或输入自定义变化</div>
            </div>
          </div>
          
          {/* 快速分支建议 */}
          <div className="flex flex-wrap gap-1.5">
            {quickBranchPresets.map((s, i) => (
              <button
                key={`${s.label}-${s.value}-${i}`}
                className="px-2.5 py-1 rounded-full border border-border bg-card text-xs hover:border-primary/40 hover:bg-primary/10 transition-colors"
                onClick={() => {
                  const basePrompt = String(formData.prompt || '').trim();
                  if (!basePrompt) {
                    toast.error('请先填写提示词');
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

          {/* 自定义分支输入 */}
          <div className="space-y-2">
            <Input
              className="h-9 text-xs"
              placeholder="输入自定义变化，如：赛博朋克风格"
              value={customBranchInput}
              onChange={(e) => setCustomBranchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customBranchInput.trim()) {
                  e.preventDefault();
                  const basePrompt = String(formData.prompt || '').trim();
                  if (!basePrompt) {
                    toast.error('请先填写提示词');
                    return;
                  }
                  const nextPrompt = `${basePrompt}, ${customBranchInput.trim()}`;
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="h-9"
                disabled={!customBranchInput.trim()}
                onClick={() => {
                  const basePrompt = String(formData.prompt || '').trim();
                  if (!basePrompt) {
                    toast.error('请先填写提示词');
                    return;
                  }
                  const nextPrompt = `${basePrompt}, ${customBranchInput.trim()}`;
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
                分支
              </Button>

              <Button
                size="sm"
                className="h-9 bg-primary hover:bg-primary/90"
                onClick={handleContinue}
                disabled={continuing}
              >
                {continuing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    继续生成中…
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    继续生成（新节点）
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Generation config */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">张数</label>
            <Input
              type="number"
              min={1}
              max={8}
              value={Number(formData.count || 1)}
              onChange={(e) => handleChange('count', Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">尺寸</label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={(formData.imageSize as any) || '2K'}
              onChange={(e) => handleChange('imageSize', e.target.value)}
            >
              {IMAGE_SIZE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">比例</label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={(formData.aspectRatio as any) || 'auto'}
              onChange={(e) => handleChange('aspectRatio', e.target.value)}
            >
              {ASPECT_RATIO_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">继续模式</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={String(formData.generationBaseMode || '')}
            onChange={(e) => {
              const v = String(e.target.value || '').trim();
              handleChange('generationBaseMode', v === 'prompt' ? 'prompt' : v === 'image' ? 'image' : undefined);
            }}
          >
            <option value="">默认（跟随设置）</option>
            <option value="image">基于当前图</option>
            <option value="prompt">纯提示词</option>
          </select>
          <div className="text-[11px] text-muted-foreground">
            默认值可在设置中调整；也可以在单个节点上覆盖默认行为。
          </div>
        </div>

        {/* Version history */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">历史版本</div>
            <div className="text-[11px] text-muted-foreground">{revisions.length ? `${revisions.length} 条` : '暂无'}</div>
          </div>

          {revisions.length ? (
            <div className="space-y-2">
              {revisions.slice(0, 8).map((rev) => (
                <div
                  key={rev.id}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(rev.createdAt).toLocaleString()}{' '}
                        {rev.source ? `· ${REV_SOURCE_LABEL[rev.source] || rev.source}` : ''}
                      </div>
                      <div className="text-xs text-foreground/90 line-clamp-2 mt-0.5">
                        {rev.prompt || '（空提示词）'}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {rev.imageSize} · {rev.aspectRatio} · {rev.count} 张
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3"
                        disabled={isNodeBusy || generating}
                        onClick={() => {
                          restoreNodeRevision(nodeId, rev.id);
                          setFormData((prev) => ({
                            ...prev,
                            prompt: rev.prompt,
                            count: rev.count,
                            imageSize: rev.imageSize,
                            aspectRatio: rev.aspectRatio,
                          }));
                          toast.success('已还原到历史版本');
                        }}
                      >
                        还原
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3"
                        disabled={isNodeBusy || generating}
                        onClick={async () => {
                          setGenerating(true);
                          try {
                            restoreNodeRevision(nodeId, rev.id);
                            setFormData((prev) => ({
                              ...prev,
                              prompt: rev.prompt,
                              count: rev.count,
                              imageSize: rev.imageSize,
                              aspectRatio: rev.aspectRatio,
                            }));
                            const newIds = await generateFromNode(nodeId, { mode: 'append' });
                            if (newIds?.[0]) onFocusNode?.(newIds[0]);
                          } finally {
                            setGenerating(false);
                          }
                        }}
                      >
                        还原并生成
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {revisions.length > 8 ? (
                <div className="text-[11px] text-muted-foreground">还有 {revisions.length - 8} 条历史版本…</div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">在当前节点内修改提示词/参数后，会自动记录历史。</div>
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

        {/* Actions - 精简布局 */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleSave}>
            保存修改
          </Button>
          <Button onClick={handleGenerate} disabled={generating || regenerating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4 fill-current" />
                生成
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleRegenerate} disabled={generating || regenerating}>
            {regenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                重新生成中…
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                重新生成
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => duplicateNode(nodeId)}>
            <Copy className="mr-2 h-4 w-4" />
            复制节点
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">批量分叉</div>
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                value={batchConcurrency}
                onChange={(e) => setBatchConcurrency(Number(e.target.value) as any)}
                title="并发数"
              >
                {CONCURRENCY_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    并发 {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            className="w-full min-h-[90px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            value={batchBranchDraft}
            onChange={(e) => setBatchBranchDraft(e.target.value)}
            placeholder={`每行一个变化，例如：\n插画风\n特写镜头\n雨夜霓虹`}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => void handleBatchBranch(false)}
              disabled={batchBranching || !batchBranchDraft.trim()}
            >
              {batchBranching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中…
                </>
              ) : (
                <>
                  <GitBranch className="mr-2 h-4 w-4" />
                  只创建
                </>
              )}
            </Button>
            <Button
              onClick={() => void handleBatchBranch(true)}
              disabled={batchBranching || !batchBranchDraft.trim()}
            >
              {batchBranching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  创建并生成…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  创建并生成
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleAnalyzePrompt} disabled={analyzingPrompt}>
            {analyzingPrompt ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                分析提示词
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              savePromptToLibrary(nodeId);
            }}
          >
            <BookMarked className="mr-2 h-4 w-4" />
            存入提示词库
          </Button>
        </div>

        {/* Prompt analysis */}
        {selectedNode.data.promptAnalysis?.raw ? (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">提示词分析</div>
              {promptSuggestion.suggestedPrompt ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      prompt: promptSuggestion.suggestedPrompt,
                    }));
                    toast.success('已填入建议提示词');
                  }}
                >
                  应用建议
                </Button>
              ) : null}
            </div>
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{selectedNode.data.promptAnalysis.raw}</pre>
            {promptSuggestion.suggestedPrompt ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  branchNode(nodeId, {
                    prompt: promptSuggestion.suggestedPrompt,
                  } as Partial<NodeData>);
                }}
              >
                <GitBranch className="mr-2 h-4 w-4" />
                用建议创建分支
              </Button>
            ) : null}
            {promptSuggestion.suggestedPrompt ? (
              <Button
                size="sm"
                className="w-full"
                onClick={async () => {
                  setContinuing(true);
                  try {
                    const newIds = await generateFromNode(nodeId, {
                      mode: 'append',
                      overrides: { prompt: promptSuggestion.suggestedPrompt } as Partial<NodeData>,
                    });
                    if (newIds?.[0]) onFocusNode?.(newIds[0]);
                  } finally {
                    setContinuing(false);
                  }
                }}
              >
                <GitBranch className="mr-2 h-4 w-4" />
                用建议继续生成（新节点）
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Images */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-400" />
              生成结果
            </label>
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                value={prefs.continueFromImageMode}
                onChange={(e) =>
                  updatePrefs({
                    continueFromImageMode: (e.target.value === 'multi_turn' ? 'multi_turn' : 'image_only') as any,
                  })
                }
                title="继续生成模式"
              >
                <option value="image_only">仅发送该图</option>
                <option value="multi_turn">多轮对话（含历史）</option>
              </select>
              {prefs.continueFromImageMode === 'multi_turn' ? (
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={prefs.continueHistoryNodes}
                  onChange={(e) => updatePrefs({ continueHistoryNodes: Number(e.target.value) })}
                  title="发送的历史节点数"
                >
                  {[2, 3, 4, 6, 8, 10, 12].map((v) => (
                    <option key={v} value={v}>
                      历史 {v} 节点
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleContinueFromImage}
                disabled={!activeImageId || continuingFromImage}
                title="从当前选中的图片继续生成一个新分支节点"
              >
                {continuingFromImage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    继续中…
                  </>
                ) : (
                  <>
                    <GitBranch className="mr-2 h-4 w-4" />
                    基于图继续
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleAnalyzeImage}
                disabled={!activeImageId || analyzingImage}
              >
                {analyzingImage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    分析中…
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    分析图片
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setAiChatOpen(true)}
                disabled={!activeImageId}
                title="对当前图片开启 AI 对话（分析模型）"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI对话
              </Button>
            </div>
          </div>
          {selectedNode.data.images?.length ? (
            <div className="grid grid-cols-2 gap-2">
              {selectedNode.data.images.map((img) => (
                <button
                  key={img.id}
                  className={cn(
                    'relative aspect-square rounded-lg overflow-hidden border',
                    activeImageId === img.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  )}
                  onClick={() => setActiveImageId(img.id)}
                  title="选择图片"
                >
                  <img src={img.url} alt={img.id} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <div className="w-full aspect-[2/1] rounded-lg border border-dashed border-border bg-background flex flex-col items-center justify-center text-muted-foreground gap-2">
              <ImageIcon className="h-8 w-8 opacity-30" />
              <span className="text-xs opacity-60">暂无图片</span>
            </div>
          )}
        </div>

        {/* Image analysis */}
        {imageAnalysis?.raw ? (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="text-sm font-medium">图片分析</div>
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{imageAnalysis.raw}</pre>
            {imageSuggestion.suggestedPrompt ? (
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    if (!nodeId) return;
                    const newId = branchNode(nodeId, { prompt: imageSuggestion.suggestedPrompt } as Partial<NodeData>);
                    if (newId) onFocusNode?.(newId);
                  }}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  用图片建议创建分支
                </Button>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    if (!nodeId || !activeImageId) return;
                    setContinuingFromImage(true);
                    try {
                      const newIds = await generateFromNode(nodeId, {
                        mode: 'append',
                        overrides: {
                          prompt: imageSuggestion.suggestedPrompt,
                          generationBaseMode: 'image',
                          referenceImageId: activeImageId,
                        } as Partial<NodeData>,
                      });
                      if (newIds?.[0]) onFocusNode?.(newIds[0]);
                    } finally {
                      setContinuingFromImage(false);
                    }
                  }}
                  disabled={continuingFromImage}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  用图片建议继续生成（基于图）
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Prompt library */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-primary/80" />
            提示词库
          </div>
          {promptLibrary.length ? (
            <div className="space-y-2">
              {promptLibrary.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-foreground/90 truncate">{p.title || p.prompt}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.prompt}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0"
                    onClick={() => applyPromptAssetToNode(p.id, nodeId)}
                  >
                    应用
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">暂无收藏的提示词</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-card">
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => {
            if (!confirm('确定删除这个节点吗？')) return;
            removeNode(nodeId);
            clearSelection();
            toast.success('节点已删除');
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除节点
        </Button>
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
    <div className="relative h-full flex flex-col shrink-0">
      <div
        className={cn(
          "absolute top-1/2 z-10 transition-all duration-300",
          isCollapsed ? "-left-6" : "-left-3"
        )}
        style={{ transform: 'translateY(-50%)' }}
      >
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-6 border-border shadow-sm rounded-l-md rounded-r-none border border-r-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
      
      <div 
        className={cn(
          "h-full bg-background border-l border-border transition-[width] duration-300 ease-in-out overflow-hidden",
          isCollapsed ? "w-0 border-l-0" : "w-[380px]"
        )}
      >
        <div 
          className={cn(
            "w-[380px] h-full flex flex-col",
            isCollapsed && "invisible pointer-events-none"
          )}
        >
           <SidebarContent {...props} />
        </div>
      </div>
    </div>
  );
}
