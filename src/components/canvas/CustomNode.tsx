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
      "w-[320px] rounded-xl transition-all duration-200 group",
      "bg-gradient-to-b from-card to-background",
      "border shadow-lg",
      selected 
        ? "border-primary ring-2 ring-primary/20 shadow-primary/20" 
        : "border-border hover:border-border/80",
      data.favorite && "ring-1 ring-yellow-400/30"
    )}>
      {/* 连接点 */}
      <Handle 
        type="target" 
        position={targetHandlePosition} 
        className={cn(
          "!w-3 !h-3 !bg-primary !border-2 !border-card",
          generateDirection === 'right' ? "!-left-1.5" : "!-top-1.5"
        )}
      />

      {/* 顶部状态栏 - 更紧凑 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border [.zoom-level-low_&]:hidden">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all",
            status.color, status.bg
          )}>
            {status.icon}
            <span className="[.zoom-level-low_&]:hidden">{status.label}</span>
          </div>
          {data.favorite && (
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          )}
          {hasChangesFromParent && parentId && (
            <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded [.zoom-level-low_&]:hidden" title="相对父节点有修改">
              已修改
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground [.zoom-level-low_&]:hidden">
          {data.imageSize} · {data.aspectRatio} · {data.count}张
        </span>
      </div>

      {/* 节点关系导航 - 更紧凑 */}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between gap-2 border-b border-border/50 [.zoom-level-low_&]:hidden">
        {parentId ? (
          <button
            className="min-w-0 inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNodeId(parentId);
              focusNode(parentId);
            }}
            title="查看父节点"
          >
            <span className="opacity-60">↑</span>
            <span className="truncate max-w-[120px]">{parentLabel}</span>
          </button>
        ) : (
          <span className="opacity-60 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            起点
          </span>
        )}

        <div className="flex items-center gap-2">
          {durationLabel ? <span className="opacity-60">{durationLabel}</span> : null}
          {childCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                className="inline-flex items-center hover:text-foreground transition-colors bg-secondary px-1 py-0.5 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeData(data.id, { collapsed: !data.collapsed });
                }}
                title={data.collapsed ? '展开子树' : '收起子树'}
              >
                {data.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <button
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors bg-secondary px-1.5 py-0.5 rounded"
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

      {/* Prompt 区域 - 更紧凑，突出关键信息 */}
      <div className="px-3 py-2 [.zoom-level-low_&]:hidden">
        {isEditing ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <PromptPartsEditor
              value={draftPrompt}
              promptParts={draftPromptParts}
              placeholder="输入提示词…（可用右侧 + 插入参考图）"
              editorClassName="min-h-[84px]"
              onChange={({ prompt, promptParts }) => {
                setDraftPrompt(prompt);
                setDraftPromptParts(promptParts);
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
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
                保存并生成
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(false);
                  setDraftPrompt(data.prompt || '');
                  setDraftPromptParts(data.promptParts);
                }}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="cursor-text"
          >
            {/* 分支说明/备注优先显示 */}
            {data.notes && (
              <div className="mb-1.5 px-2 py-1 rounded bg-primary/5 border border-primary/10">
                <p className="text-xs text-primary/80 font-medium line-clamp-1">
                  {data.notes}
                </p>
              </div>
            )}
            <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed [.zoom-level-medium_&]:line-clamp-1">
              {data.prompt || (
                <span className="text-muted-foreground italic">双击编辑提示词...</span>
              )}
            </p>
            {data.negativePrompt && (
              <p className="text-[11px] text-red-400/60 mt-1 line-clamp-1 [.zoom-level-medium_&]:hidden">
                <span className="opacity-70">排除:</span> {data.negativePrompt}
              </p>
            )}
            {tags.length ? (
              <div className="flex flex-wrap gap-1 mt-1.5 [.zoom-level-medium_&]:hidden">
                {tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded border border-border bg-background text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
                {tags.length > 4 ? (
                  <span className="text-[10px] text-muted-foreground/50">+{tags.length - 4}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {data.errorMessage ? (
        <div
          className={cn(
            "px-4 pb-3 text-xs [.zoom-level-low_&]:hidden",
            data.status === 'failed' ? "text-red-300" : "text-amber-300"
          )}
        >
          {data.errorMessage}
        </div>
      ) : null}

      {/* 图片预览区域 - 更大的缩略图便于对比 */}
      <div className={cn("px-3 pb-2", "transition-all duration-300", "[.zoom-level-low_&]:p-1 [.zoom-level-low_&]:h-full")}>
        {data.images && data.images.length > 0 ? (
          <div className={cn(
            "rounded-lg overflow-hidden relative",
            data.images.length === 1 ? "" : "grid grid-cols-2 gap-1"
          )}>
            {/* Status Overlay for Low Zoom */}
            <div className="hidden [.zoom-level-low_&]:flex absolute top-2 left-2 z-10 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/90 shadow-sm border border-white/10">
              {status.icon}
            </div>

            {data.images.slice(0, 4).map((img, idx) => (
              <div 
                key={img.id} 
                className={cn(
                  "relative bg-muted overflow-hidden rounded-md",
                  "group/img cursor-pointer",
                  data.images.length === 1 ? "aspect-[4/3]" : "aspect-square"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(data.id);
                  // 可以添加预览大图逻辑，目前先仅选中
                }}
              >
                <ResolvedImage 
                  src={img.url} 
                  alt={`生成图片 ${idx + 1}`} 
                  className="object-cover w-full h-full transition-transform group-hover/img:scale-105" 
                />
                
                {/* 悬浮操作层 - 核心交互优化 */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px] [.zoom-level-low_&]:hidden">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 rounded-full bg-black/40 hover:bg-primary text-white border border-white/20"
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
                    <GitBranch className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 rounded-full bg-black/40 hover:bg-white/20 text-white border border-white/20"
                    title="下载原图"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadImage(img.url, img.id);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-7 w-7 p-0 rounded-full border border-white/20",
                      img.isFavorite 
                        ? "bg-yellow-400/90 text-black hover:bg-yellow-400" 
                        : "bg-black/40 hover:bg-white/20 text-white"
                    )}
                    title={img.isFavorite ? '取消收藏' : '收藏图片'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteImage(img.id);
                    }}
                  >
                    <Star className={cn("h-3.5 w-3.5", img.isFavorite && "fill-current")} />
                  </Button>
                </div>

                {/* 常驻收藏标记 (未悬浮时显示) */}
                {img.isFavorite && (
                  <div className="absolute top-1 right-1 pointer-events-none group-hover/img:opacity-0 transition-opacity [.zoom-level-low_&]:opacity-100">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow" />
                  </div>
                )}
                
                {/* AI评分显示 */}
                {typeof img.aiOverallScore === 'number' && (
                  <span className={cn(
                    "absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 font-medium group-hover/img:opacity-0 transition-opacity [.zoom-level-low_&]:opacity-100",
                    img.aiOverallScore >= 80 ? "text-emerald-300" : "text-white/80"
                  )}>
                    {Math.round(img.aiOverallScore)}
                  </span>
                )}
              </div>
            ))}
            {data.images.length > 4 && (
              <div className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white/80 px-1.5 py-0.5 rounded">
                +{data.images.length - 4}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full aspect-[3/1] rounded-lg border border-dashed border-border bg-background flex items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="h-5 w-5 opacity-30" />
            <span className="text-xs opacity-50 [.zoom-level-low_&]:hidden">点击生成</span>
          </div>
        )}

        {data.collapsed && childCount > 0 ? (
          <div className="mt-2 rounded-lg border border-border/60 bg-background/70 p-2 [.zoom-level-low_&]:hidden">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-1">
              <span className="truncate">已收起子树</span>
              {collapsedHiddenCount > 0 ? <span className="shrink-0">隐藏 {collapsedHiddenCount}</span> : null}
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
                        className="relative w-full aspect-square overflow-hidden rounded border border-border/40 bg-muted"
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
                          <div className="absolute inset-0 bg-black/55 text-white text-xs font-semibold flex items-center justify-center">
                            +{more}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/80">暂无可预览图片</div>
              )
            ) : (
              <div className="text-[11px] text-muted-foreground/80">子树图片预览已关闭（可在设置中开启）</div>
            )}
          </div>
        ) : null}
      </div>

      {/* 快速微调：从这里继续生成 - 核心交互，始终显示 */}
      <div
        className="px-3 pb-2 [.zoom-level-low_&]:hidden [.zoom-level-medium_&]:hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <Input
            className="h-7 text-xs border-border bg-background focus-visible:ring-primary/50 placeholder:text-muted-foreground/50"
            placeholder="输入变化后回车继续… 如：插画风/特写/雨夜"
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
            className="h-7 px-2 text-xs hover:bg-primary/10 hover:text-primary"
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

      {/* 底部操作栏 - 更紧凑，突出主要操作 */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between [.zoom-level-low_&]:hidden">
        <div className="flex items-center gap-0.5">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0 hover:bg-yellow-500/10"
            title={data.favorite ? '取消收藏' : '收藏节点'}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteNode(data.id);
            }}
          >
            <Star className={cn(
              "h-3.5 w-3.5 transition-colors",
              data.favorite 
                ? "fill-yellow-400 text-yellow-400" 
                : "text-muted-foreground hover:text-yellow-400"
            )} />
          </Button>
          <div className="relative">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 w-7 p-0"
              title="更多操作"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreActions(!showMoreActions);
              }}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            {showMoreActions && (
              <div 
                className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[120px] z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-secondary flex items-center gap-2"
                  onClick={() => {
                    duplicateNode(data.id);
                    setShowMoreActions(false);
                  }}
                >
                  <Copy className="h-3 w-3" />
                  复制节点
                </button>
                <button
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-secondary flex items-center gap-2 text-red-400"
                  onClick={() => {
                    removeNode(data.id);
                    setShowMoreActions(false);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  删除节点
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-7 px-2.5 text-xs border-border hover:bg-secondary hover:border-primary/30",
              "[.zoom-level-medium_&]:px-2"
            )}
            disabled={isGeneratingNext || isRegeneratingNext || data.status === 'running' || data.status === 'queued'}
            title="重新生成（只保留最新一批）"
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
            <RotateCcw className="h-3 w-3 mr-1" />
            重新生成
          </Button>

          <Button
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-medium [.zoom-level-medium_&]:px-2",
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
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                <span className="[.zoom-level-medium_&]:hidden">生成中</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1 fill-current" />
                <span className="[.zoom-level-medium_&]:hidden">生成</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 连接点 */}
      <Handle 
        type="source" 
        position={sourceHandlePosition} 
        className={cn(
          "!w-3 !h-3 !bg-primary !border-2 !border-card",
          generateDirection === 'right' ? "!-right-1.5" : "!-bottom-1.5"
        )}
      />
    </div>
  );
};

export default memo(CustomNode);
