import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { NodeData } from '@/types';
import { cn } from '@/lib/utils';
import { hasEffectivePromptContent } from '@/lib/promptParts';
import { ResolvedImage } from '@/components/ui/ResolvedImage';
import { resolveImageUrl } from '@/services/imageStorage';
import { 
  Play, 
  RotateCcw,
  MoreHorizontal, 
  Star, 
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  GitBranch,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Copy,
  Trash2,
  Sparkles,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCanvasStore } from '@/store/canvasStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/components/ui/toast';
import { PromptPartsEditor } from './PromptPartsEditor';

// 状态配置
const statusConfig = {
  idle: { 
    color: 'text-slate-400', 
    bg: 'bg-slate-400/10',
    icon: <div className="w-2 h-2 rounded-full bg-slate-400" />,
    label: '未生成'
  },
  queued: { 
    color: 'text-amber-400', 
    bg: 'bg-amber-400/10',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: '排队中'
  },
  running: { 
    color: 'text-blue-400', 
    bg: 'bg-blue-400/10',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: '生成中'
  },
  completed: { 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-400/10',
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: '已完成'
  },
  failed: { 
    color: 'text-red-400', 
    bg: 'bg-red-400/10',
    icon: <AlertCircle className="w-3 h-3" />,
    label: '失败'
  },
};

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return '';
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

const CustomNode = ({ data, selected }: NodeProps<NodeData>) => {
  const status = statusConfig[data.status] || statusConfig.idle;
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const commitNodeEdit = useCanvasStore((state) => state.commitNodeEdit);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const generateFromNode = useCanvasStore((state) => state.generateFromNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const toggleFavoriteNode = useCanvasStore((state) => state.toggleFavoriteNode);
  const toggleFavoriteImage = useCanvasStore((state) => state.toggleFavoriteImage);
  const prefs = usePreferencesStore((s) => s.prefs);
  const parentId = useCanvasStore((state) => state.edges.find((e) => e.target === data.id)?.source || null);
  const parentPrompt = useCanvasStore((state) => {
    const pid = state.edges.find((e) => e.target === data.id)?.source;
    if (!pid) return '';
    const p = state.nodes.find((n) => n.id === pid)?.data?.prompt || '';
    return String(p || '').trim();
  });
  const childCount = useCanvasStore((state) =>
    state.edges
      .filter((e) => e.source === data.id)
      .filter((e) => {
        const child = state.nodes.find((n) => n.id === e.target);
        return Boolean(child && !child.data.archived);
      }).length
  );
  const firstChildId = useCanvasStore((state) => {
    const edge = state.edges.find((e) => {
      if (e.source !== data.id) return false;
      const child = state.nodes.find((n) => n.id === e.target);
      return Boolean(child && !child.data.archived);
    });
    return edge?.target || null;
  });
  const { getNode, fitView } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(data.prompt || '');
  const [draftPromptParts, setDraftPromptParts] = useState(data.promptParts);
  const [quickTweak, setQuickTweak] = useState('');
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);
  const [isRegeneratingNext, setIsRegeneratingNext] = useState(false);
  const [, setRunTick] = useState(0);

  useEffect(() => {
    setDraftPrompt(data.prompt || '');
    setDraftPromptParts(data.promptParts);
  }, [data.prompt, data.promptParts]);

  useEffect(() => {
    if (!selected) setQuickTweak('');
  }, [selected]);

  useEffect(() => {
    if (data.status !== 'running') return;
    const t = window.setInterval(() => setRunTick((v) => v + 1), 250);
    return () => window.clearInterval(t);
  }, [data.status]);

  const runningDurationMs = (() => {
    if (data.status !== 'running') return undefined;
    const startedAt = data.lastRunAt ? Date.parse(data.lastRunAt) : NaN;
    if (!Number.isFinite(startedAt)) return undefined;
    return Math.max(0, Date.now() - startedAt);
  })();

  const durationLabel =
    data.status === 'running' ? formatDuration(runningDurationMs) : formatDuration(data.lastRunDurationMs);

  const tags = useMemo(() => (Array.isArray(data.tags) ? data.tags.filter(Boolean) : []), [data.tags]);

  const collapsedHiddenCount = Number((data as any)?.__collapsedHiddenCount || 0) || 0;
  const collapsedPreview = ((data as any)?.__collapsedPreview || []) as Array<{
    nodeId: string;
    imageId: string;
    url: string;
  }>;
  const collapsedPreviewTotal = Number((data as any)?.__collapsedPreviewTotal || collapsedPreview.length) || 0;

  const generateDirection = prefs.canvasGenerateDirection === 'right' ? 'right' : 'down';
  const targetHandlePosition = generateDirection === 'right' ? Position.Left : Position.Top;
  const sourceHandlePosition = generateDirection === 'right' ? Position.Right : Position.Bottom;

  const parentLabel = useMemo(() => {
    if (!parentId) return '';
    const text = parentPrompt || parentId;
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }, [parentId, parentPrompt]);

  const focusNode = (nodeId: string) => {
    const tryFocus = () => {
      const target = getNode(nodeId);
      if (!target) return false;
      fitView({ nodes: [target], padding: 0.35, duration: 350 });
      return true;
    };

    if (tryFocus()) return;
    requestAnimationFrame(() => {
      if (tryFocus()) return;
      setTimeout(() => {
        tryFocus();
      }, 60);
    });
  };
  
  // 判断是否有变化（相对于父节点）
  const hasChangesFromParent = useMemo(() => {
    if (!parentPrompt) return false;
    return String(data.prompt || '').trim() !== parentPrompt;
  }, [data.prompt, parentPrompt]);
  
  const handleDownloadImage = async (url: string, id: string) => {
    try {
      // Resolve idb:// URLs before downloading
      const resolvedUrl = await resolveImageUrl(url);
      if (!resolvedUrl) {
        throw new Error('无法获取图片数据');
      }
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${id}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      toast.error(error?.message || '下载失败');
    }
  };

  return (
    <div className={cn(
      "w-[320px] rounded-[24px] transition-all duration-300 group/node font-sans",
      "bg-card/80 backdrop-blur-xl backdrop-saturate-150",
      "border border-border/40 shadow-xl",
      selected 
        ? "ring-2 ring-primary ring-offset-2 ring-offset-background/50 border-primary/50 shadow-primary/10" 
        : "hover:border-primary/20 hover:shadow-2xl hover:-translate-y-0.5",
      data.favorite && "ring-1 ring-yellow-400/50"
    )}>
      {/* 连接点 - 隐形交互优化 */}
      <Handle 
        type="target" 
        position={targetHandlePosition} 
        className={cn(
          "!w-3.5 !h-3.5 !bg-primary !border-[3px] !border-background transition-all duration-300",
          !selected && "opacity-0 scale-50 group-hover/node:opacity-100 group-hover/node:scale-100",
          generateDirection === 'right' ? "!-left-1.5" : "!-top-1.5"
        )}
      />

      {/* 顶部状态栏 - iOS Widget Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 [.zoom-level-low_&]:hidden">
        <div className="flex items-center gap-2">
          {/* Status Dot */}
          <div className={cn(
            "w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-card/50",
            status.color.replace('text-', 'bg-').replace('/10', '') // Convert text color to bg color
          )} />
          <span className={cn("text-xs font-medium tracking-tight", status.color)}>
            {status.label}
          </span>
          
          {data.favorite && (
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          )}
          {hasChangesFromParent && parentId && (
            <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full" title="相对父节点有修改">
              Modified
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground/60 tracking-tight font-mono">
          {data.imageSize} · {data.count}
        </span>
      </div>

      {/* 节点关系导航 - Minimal Link */}
      <div className="px-4 py-1.5 text-[10px] text-muted-foreground/50 flex items-center justify-between gap-2 border-b border-border/10 [.zoom-level-low_&]:hidden">
        {parentId ? (
          <button
            className="min-w-0 inline-flex items-center gap-1.5 hover:text-primary transition-colors group/nav"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNodeId(parentId);
              focusNode(parentId);
            }}
            title="查看父节点"
          >
            <div className="w-1 h-3 rounded-full bg-border group-hover/nav:bg-primary/50 transition-colors" />
            <span className="truncate max-w-[120px] font-medium">{parentLabel}</span>
          </button>
        ) : (
          <span className="opacity-60 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span className="font-medium">Root Node</span>
          </span>
        )}

        <div className="flex items-center gap-2">
          {durationLabel ? <span className="opacity-60 font-mono">{durationLabel}</span> : null}
          {childCount > 0 ? (
            <div className="flex items-center gap-1">
              <button
                className="inline-flex items-center hover:bg-secondary/80 transition-colors px-1 py-0.5 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeData(data.id, { collapsed: !data.collapsed });
                }}
                title={data.collapsed ? '展开子树' : '收起子树'}
              >
                {data.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <button
                className="inline-flex items-center gap-1 hover:bg-secondary/80 transition-colors px-1.5 py-0.5 rounded-md text-primary font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!firstChildId) return;
                  if (data.collapsed) updateNodeData(data.id, { collapsed: false });
                  setSelectedNodeId(firstChildId);
                  focusNode(firstChildId);
                }}
                title="跳转到子节点"
              >
                <GitBranch className="w-3 h-3" />
                <span>{childCount}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prompt 区域 */}
      <div className="px-4 py-3 [.zoom-level-low_&]:hidden">
        {isEditing ? (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-xl border border-primary/20 shadow-sm overflow-hidden ring-4 ring-primary/5">
                <PromptPartsEditor
                  value={draftPrompt}
                  promptParts={draftPromptParts}
                  placeholder="输入提示词…"
                  editorClassName="min-h-[84px] bg-background/50"
                  onChange={({ prompt, promptParts }) => {
                    setDraftPrompt(prompt);
                    setDraftPromptParts(promptParts);
                  }}
                />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-8 rounded-full text-xs font-medium px-4 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                onClick={async (e) => {
                  e.stopPropagation();
                  const nextPrompt = String(draftPrompt || '').trim();
                  const nextParts = draftPromptParts;
                  if (!hasEffectivePromptContent(nextPrompt, nextParts)) {
                    toast.error('提示词不能为空');
                    return;
                  }
                  commitNodeEdit(data.id, { prompt: nextPrompt, promptParts: nextParts }, { source: 'manual' });
                  setIsEditing(false);

                  const newIds = await generateFromNode(data.id, { mode: 'append' });
                  if (newIds?.[0]) focusNode(newIds[0]);
                }}
              >
                Save & Run
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(false);
                  setDraftPrompt(data.prompt || '');
                  setDraftPromptParts(data.promptParts);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="cursor-text group/prompt"
          >
            {/* 分支说明/备注优先显示 */}
            {data.notes && (
              <div className="mb-2 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/10 w-fit">
                <p className="text-xs text-primary font-semibold tracking-tight line-clamp-1">
                  {data.notes}
                </p>
              </div>
            )}
            <p className="text-sm text-foreground/90 font-medium leading-relaxed tracking-tight line-clamp-2 [.zoom-level-medium_&]:line-clamp-1 group-hover/prompt:text-primary transition-colors">
              {data.prompt || (
                <span className="text-muted-foreground/60 italic font-normal">Double click to edit prompt...</span>
              )}
            </p>
            {data.negativePrompt && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 line-clamp-1 [.zoom-level-medium_&]:hidden flex items-center gap-1">
                <span className="w-1.5 h-0.5 rounded-full bg-red-400/50"></span>
                {data.negativePrompt}
              </p>
            )}
            {tags.length ? (
              <div className="flex flex-wrap gap-1.5 mt-2.5 [.zoom-level-medium_&]:hidden">
                {tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-secondary/50 border border-border/50 text-[10px] font-medium text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
                {tags.length > 4 ? (
                  <span className="text-[10px] text-muted-foreground/40 font-medium">+{tags.length - 4}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {data.errorMessage ? (
        <div
          className={cn(
            "px-4 pb-3 text-xs font-medium [.zoom-level-low_&]:hidden",
            data.status === 'failed' ? "text-red-400" : "text-amber-400"
          )}
        >
          {data.errorMessage}
        </div>
      ) : null}

      {/* 图片预览区域 - Gallery Style */}
      <div className={cn("px-3 pb-3", "transition-all duration-300", "[.zoom-level-low_&]:p-1.5 [.zoom-level-low_&]:h-full")}>
        {data.images && data.images.length > 0 ? (
          <div className={cn(
            "rounded-2xl overflow-hidden relative shadow-inner bg-black/5 ring-1 ring-black/5 dark:ring-white/5",
            data.images.length === 1 ? "" : "grid grid-cols-2 gap-0.5"
          )}>
            {/* Status Overlay for Low Zoom */}
            <div className="hidden [.zoom-level-low_&]:flex absolute top-2 left-2 z-10 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/90 shadow-sm border border-white/10">
              {status.icon}
            </div>

            {data.images.slice(0, 4).map((img, idx) => (
              <div 
                key={img.id} 
                className={cn(
                  "relative overflow-hidden",
                  "group/img cursor-pointer",
                  data.images.length === 1 ? "aspect-[4/3]" : "aspect-square"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(data.id);
                }}
              >
                <ResolvedImage 
                  src={img.url} 
                  alt={`生成图片 ${idx + 1}`} 
                  className="object-cover w-full h-full transition-transform duration-500 group-hover/img:scale-110" 
                />
                
                {/* 悬浮操作层 - 核心交互优化 */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px] [.zoom-level-low_&]:hidden">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white text-white hover:text-black border border-white/20 backdrop-blur-md transition-all scale-90 hover:scale-100"
                    title="以此图为垫图继续生成"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newId =
                        (await generateFromNode(data.id, {
                          mode: 'append',
                          overrides: { generationBaseMode: 'image', referenceImageId: img.id },
                        }))?.[0] || null;
                      if (newId) {
                        focusNode(newId);
                        toast.success('已创建图片分支');
                      }
                    }}
                  >
                    <GitBranch className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white text-white hover:text-black border border-white/20 backdrop-blur-md transition-all scale-90 hover:scale-100"
                    title="下载原图"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadImage(img.url, img.id);
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-8 w-8 p-0 rounded-full border border-white/20 backdrop-blur-md transition-all scale-90 hover:scale-100",
                      img.isFavorite 
                        ? "bg-yellow-400 text-black hover:bg-yellow-500 border-transparent shadow-[0_0_10px_rgba(250,204,21,0.5)]" 
                        : "bg-white/10 hover:bg-white text-white hover:text-black"
                    )}
                    title={img.isFavorite ? '取消收藏' : '收藏图片'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteImage(img.id);
                    }}
                  >
                    <Star className={cn("h-4 w-4", img.isFavorite && "fill-current")} />
                  </Button>
                </div>

                {/* 常驻收藏标记 */}
                {img.isFavorite && (
                  <div className="absolute top-2 right-2 pointer-events-none group-hover/img:opacity-0 transition-opacity [.zoom-level-low_&]:opacity-100">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-md" />
                  </div>
                )}
                
                {/* AI评分显示 */}
                {typeof img.aiOverallScore === 'number' && (
                  <span className={cn(
                    "absolute bottom-1.5 left-1.5 text-[10px] px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md font-semibold group-hover/img:opacity-0 transition-opacity [.zoom-level-low_&]:opacity-100",
                    img.aiOverallScore >= 80 ? "text-emerald-300 ring-1 ring-emerald-500/30" : "text-white/90"
                  )}>
                    {Math.round(img.aiOverallScore)}
                  </span>
                )}
              </div>
            ))}
            {data.images.length > 4 && (
              <div className="absolute bottom-1.5 right-1.5 text-[10px] font-bold bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-full border border-white/10">
                +{data.images.length - 4}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full aspect-[2/1] rounded-2xl border-2 border-dashed border-border/50 bg-secondary/20 flex flex-col items-center justify-center text-muted-foreground gap-2 transition-colors hover:border-primary/30 hover:bg-primary/5">
            <ImageIcon className="h-6 w-6 opacity-20" />
            <span className="text-xs font-medium opacity-40 [.zoom-level-low_&]:hidden">No Images Generated</span>
          </div>
        )}

        {data.collapsed && childCount > 0 ? (
          <div className="mt-3 rounded-2xl border border-border/40 bg-secondary/30 p-2 [.zoom-level-low_&]:hidden">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground font-medium mb-2 px-1">
              <span className="truncate flex items-center gap-1.5">
                <ChevronDown className="w-3 h-3" />
                Collapsed Branch
              </span>
              {collapsedHiddenCount > 0 ? <span className="shrink-0 bg-background/50 px-1.5 rounded-md">+{collapsedHiddenCount}</span> : null}
            </div>

            {prefs.canvasCollapsedPreviewImages !== false ? (
              collapsedPreview.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {collapsedPreview.map((p, idx) => {
                    const isLast = idx === collapsedPreview.length - 1;
                    const more = Math.max(0, collapsedPreviewTotal - collapsedPreview.length);
                    return (
                      <button
                        key={`${p.imageId}_${p.nodeId}`}
                        className="relative w-full aspect-square overflow-hidden rounded-lg border border-border/20 bg-muted hover:ring-2 hover:ring-primary/50 transition-all"
                        title="展开并定位到该节点"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateNodeData(data.id, { collapsed: false });
                          setSelectedNodeId(p.nodeId);
                          focusNode(p.nodeId);
                        }}
                      >
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                        {isLast && more > 0 ? (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] text-white text-xs font-bold flex items-center justify-center">
                            +{more}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/50 px-1 italic">No preview images</div>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 快速微调：从这里继续生成 - Always Visible but Cleaner */}
      <div
        className="px-4 pb-3 [.zoom-level-low_&]:hidden [.zoom-level-medium_&]:hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative group/input">
          <Input
            className="h-9 pl-3 pr-9 text-xs border-border/50 bg-secondary/30 focus-visible:ring-primary/30 focus-visible:bg-background transition-all rounded-xl placeholder:text-muted-foreground/40"
            placeholder="Type tweak & enter to branch..."
            value={quickTweak}
            onChange={(e) => setQuickTweak(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setQuickTweak('');
                return;
              }
              if (e.key !== 'Enter') return;
              e.preventDefault();

              const tweak = String(quickTweak || '').trim();
              if (!tweak) return;

              const basePrompt = String(data.prompt || '').trim();
              const nextPrompt = basePrompt ? `${basePrompt}, ${tweak}` : tweak;
              setQuickTweak('');
              void (async () => {
                const newIds = await generateFromNode(data.id, {
                  mode: 'append',
                  overrides: { prompt: nextPrompt, notes: tweak },
                });
                if (newIds?.[0]) focusNode(newIds[0]);
              })();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-1 top-1 h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            onClick={() => {
              const tweak = String(quickTweak || '').trim();
              const basePrompt = String(data.prompt || '').trim();
              
              if (!tweak && !basePrompt) {
                toast.error('请先填写提示词');
                return;
              }

              const nextPrompt = tweak ? (basePrompt ? `${basePrompt}, ${tweak}` : tweak) : basePrompt;
              setQuickTweak('');
              void (async () => {
                const newIds = await generateFromNode(data.id, {
                  mode: 'append',
                  overrides: { prompt: nextPrompt, notes: tweak || undefined },
                });
                if (newIds?.[0]) focusNode(newIds[0]);
              })();
            }}
            title="从此继续生成新分支"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 底部操作栏 - iOS Toolbar Style */}
      <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between [.zoom-level-low_&]:hidden bg-secondary/5 rounded-b-[24px]">
        <div className="flex items-center gap-1">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 w-8 p-0 rounded-full hover:bg-yellow-400/10 hover:text-yellow-400 transition-colors"
            title={data.favorite ? '取消收藏' : '收藏节点'}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteNode(data.id);
            }}
          >
            <Star className={cn(
              "h-4 w-4 transition-colors",
              data.favorite 
                ? "fill-yellow-400 text-yellow-400" 
                : "text-muted-foreground/60"
            )} />
          </Button>
          <div className="relative">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 w-8 p-0 rounded-full hover:bg-secondary text-muted-foreground/60 hover:text-foreground"
              title="更多操作"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreActions(!showMoreActions);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showMoreActions && (
              <div 
                className="absolute bottom-full left-0 mb-2 bg-popover/90 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl py-1.5 min-w-[140px] z-50 overflow-hidden ring-1 ring-black/5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-xs font-medium text-left hover:bg-primary/10 hover:text-primary flex items-center gap-2 transition-colors"
                  onClick={() => {
                    duplicateNode(data.id);
                    setShowMoreActions(false);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制节点
                </button>
                <div className="h-px bg-border/50 my-1 mx-2" />
                <button
                  className="w-full px-3 py-2 text-xs font-medium text-left hover:bg-red-500/10 hover:text-red-500 flex items-center gap-2 text-red-400/80 transition-colors"
                  onClick={() => {
                    removeNode(data.id);
                    setShowMoreActions(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除节点
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 px-3 text-xs font-medium rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary",
              "[.zoom-level-medium_&]:px-2"
            )}
            disabled={isGeneratingNext || isRegeneratingNext || data.status === 'running' || data.status === 'queued'}
            onClick={async (e) => {
              e.stopPropagation();
              if (!hasEffectivePromptContent(String(data.prompt || ''), data.promptParts)) {
                toast.error('请先填写提示词');
                return;
              }
              setIsRegeneratingNext(true);
              try {
                const newIds = await generateFromNode(data.id, { mode: 'regenerate' });
                if (newIds?.[0]) focusNode(newIds[0]);
              } finally {
                setIsRegeneratingNext(false);
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            重试
          </Button>

          <Button
            size="sm"
            className={cn(
              "h-8 px-4 text-xs font-semibold rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95",
              isGeneratingNext ? "bg-blue-600 hover:bg-blue-700" : "bg-primary hover:bg-primary/90"
            )}
            disabled={isGeneratingNext || isRegeneratingNext || data.status === 'running' || data.status === 'queued'}
            onClick={async (e) => {
              e.stopPropagation();
              if (!hasEffectivePromptContent(String(data.prompt || ''), data.promptParts)) {
                toast.error('请先填写提示词');
                return;
              }
              setIsGeneratingNext(true);
              try {
                const newIds = await generateFromNode(data.id, { mode: 'append' });
                if (newIds?.[0]) focusNode(newIds[0]);
              } finally {
                setIsGeneratingNext(false);
              }
            }}
          >
            {isGeneratingNext ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                <span className="[.zoom-level-medium_&]:hidden">Generating</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                <span className="[.zoom-level-medium_&]:hidden">Generate</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 连接点 - 输出 */}
      <Handle 
        type="source" 
        position={sourceHandlePosition} 
        className={cn(
          "!w-3.5 !h-3.5 !bg-primary !border-[3px] !border-background transition-all duration-300",
          !selected && "opacity-0 scale-50 group-hover/node:opacity-100 group-hover/node:scale-100",
          generateDirection === 'right' ? "!-right-1.5" : "!-bottom-1.5"
        )}
      />
    </div>
  );
};

export default memo(CustomNode);
