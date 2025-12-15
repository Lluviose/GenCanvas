import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BookMarked,
  Calendar,
  Check,
  Copy,
  Download,
  Filter,
  GitBranch,
  Grid3X3,
  Heart,
  LayoutGrid,
  Loader2,
  Play,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useProjectsStore } from '@/store/projectsStore';
import type { ImageMeta, PromptAsset } from '@/types';

type AssetTab = 'images' | 'prompts';
type ViewMode = 'grid' | 'masonry';
type ImageSortMode = 'newest' | 'oldest' | 'favorite' | 'score';
type PromptSortMode = 'updated' | 'newest' | 'oldest' | 'favorite' | 'quality';

const ASSETS_TAB_KEY = 'photopro:assets-tab';
const PENDING_PROMPT_ASSET_KEY = 'photopro:pending-prompt-asset';
const PENDING_GALLERY_IMAGE_KEY = 'photopro:pending-gallery-image';

const parseTags = (raw: string) =>
  String(raw || '')
    .split(/[,\uFF0C]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);

const copyText = async (text: string) => {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success('已复制');
    return;
  } catch {
    // ignore
  }

  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.style.position = 'fixed';
    el.style.left = '-10000px';
    el.style.top = '-10000px';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast.success('已复制');
  } catch {
    toast.error('复制失败，请手动复制');
  }
};

export default function GalleryPage() {
  const navigate = useNavigate();

  const prefs = usePreferencesStore((s) => s.prefs);
  const imageHighQualityThreshold = Math.max(0, Math.min(100, Number(prefs.aiImageHighQualityThreshold ?? 80) || 80));
  const promptHighQualityThreshold = Math.max(0, Math.min(100, Number(prefs.aiPromptHighQualityThreshold ?? 80) || 80));

  const images = useCanvasStore((state) => state.galleryImages);
  const toggleFavoriteImage = useCanvasStore((state) => state.toggleFavoriteImage);

  const promptLibrary = useCanvasStore((state) => state.promptLibrary);
  const createPromptAsset = useCanvasStore((state) => state.createPromptAsset);
  const updatePromptAsset = useCanvasStore((state) => state.updatePromptAsset);
  const deletePromptAsset = useCanvasStore((state) => state.deletePromptAsset);
  const toggleFavoritePromptAsset = useCanvasStore((state) => state.toggleFavoritePromptAsset);
  const autoTagPromptAsset = useCanvasStore((state) => state.autoTagPromptAsset);
  const autoTagGalleryImage = useCanvasStore((state) => state.autoTagGalleryImage);

  const projects = useProjectsStore((state) => state.projects);

  const [tab, setTab] = useState<AssetTab>(() => {
    if (typeof window === 'undefined') return 'images';
    try {
      const raw = localStorage.getItem(ASSETS_TAB_KEY);
      return raw === 'prompts' ? 'prompts' : 'images';
    } catch {
      return 'images';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ASSETS_TAB_KEY, tab);
    } catch {
      // ignore
    }
  }, [tab]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [imageSortMode, setImageSortMode] = useState<ImageSortMode>('newest');
  const [imageSearch, setImageSearch] = useState('');
  const [showImageFavoritesOnly, setShowImageFavoritesOnly] = useState(false);
  const [showImageHighQualityOnly, setShowImageHighQualityOnly] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageMeta | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiTaggingImageId, setAiTaggingImageId] = useState<string | null>(null);

  const [promptSearch, setPromptSearch] = useState('');
  const [promptSort, setPromptSort] = useState<PromptSortMode>('updated');
  const [promptFavoritesOnly, setPromptFavoritesOnly] = useState(false);
  const [promptHighQualityOnly, setPromptHighQualityOnly] = useState(false);
  const [activePromptTag, setActivePromptTag] = useState('');
  const [aiTaggingPromptId, setAiTaggingPromptId] = useState<string | null>(null);

  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [pendingDeletePromptId, setPendingDeletePromptId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftFavorite, setDraftFavorite] = useState(false);

  useEffect(() => {
    if (tab !== 'images') {
      setSelectedImage(null);
      setSelectMode(false);
      setSelectedIds([]);
    }
  }, [tab]);

  const openCreatePrompt = () => {
    setEditingPromptId(null);
    setDraftTitle('');
    setDraftPrompt('');
    setDraftTags('');
    setDraftNotes('');
    setDraftFavorite(false);
    setShowPromptEditor(true);
  };

  const openEditPrompt = (asset: PromptAsset) => {
    setEditingPromptId(asset.id);
    setDraftTitle(asset.title || '');
    setDraftPrompt(asset.prompt || '');
    setDraftTags((asset.tags || []).join(', '));
    setDraftNotes(asset.notes || '');
    setDraftFavorite(Boolean(asset.isFavorite));
    setShowPromptEditor(true);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const filteredImages = useMemo(() => {
    const keyword = imageSearch.trim().toLowerCase();
    return images
      .filter((img) => {
        if (showImageFavoritesOnly && !img.isFavorite) return false;
        const score =
          typeof img.aiOverallScore === 'number'
            ? img.aiOverallScore
            : typeof img.aiPromptAlignmentScore === 'number'
              ? img.aiPromptAlignmentScore
              : -1;
        if (showImageHighQualityOnly && score < imageHighQualityThreshold) return false;
        if (!keyword) return true;
        const promptText = String(img.meta?.prompt || '').toLowerCase();
        const urlText = String(img.url || '').toLowerCase();
        const tagsText = (img.tags || []).join(' ').toLowerCase();
        const captionText = String(img.aiCaption || '').toLowerCase();
        return (
          promptText.includes(keyword) || urlText.includes(keyword) || tagsText.includes(keyword) || captionText.includes(keyword)
        );
      })
      .sort((a, b) => {
        if (imageSortMode === 'score') {
          const aScore =
            typeof a.aiOverallScore === 'number'
              ? a.aiOverallScore
              : typeof a.aiPromptAlignmentScore === 'number'
                ? a.aiPromptAlignmentScore
                : -1;
          const bScore =
            typeof b.aiOverallScore === 'number'
              ? b.aiOverallScore
              : typeof b.aiPromptAlignmentScore === 'number'
                ? b.aiPromptAlignmentScore
                : -1;
          const delta = bScore - aScore;
          if (delta !== 0) return delta;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (imageSortMode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (imageSortMode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
      });
  }, [images, imageSearch, showImageFavoritesOnly, showImageHighQualityOnly, imageSortMode, imageHighQualityThreshold]);

  const allSelected = filteredImages.length > 0 && selectedIds.length === filteredImages.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(filteredImages.map((img) => img.id));
  };

  const handleDownload = async (image: ImageMeta) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${image.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) {
      toast.info('请选择要下载的图片');
      return;
    }
    let success = 0;
    for (const id of selectedIds) {
      const img = images.find((i) => i.id === id);
      if (!img) continue;
      try {
        await handleDownload(img);
        success += 1;
      } catch (error) {
        console.error(error);
      }
    }
    toast.success(`批量下载完成，成功 ${success} 张`);
  };

  const handleBatchFavorite = (target: boolean) => {
    if (selectedIds.length === 0) {
      toast.info('请选择要操作的图片');
      return;
    }

    let changed = 0;
    selectedIds.forEach((id) => {
      const img = images.find((i) => i.id === id);
      if (!img) return;
      if (img.isFavorite !== target) {
        toggleFavoriteImage(id);
        changed += 1;
      }
    });

    if (changed > 0) toast.success(target ? `已收藏 ${changed} 张` : `已取消收藏 ${changed} 张`);
    else toast.info('所选图片已是目标状态');
  };

  const promptTagStats = useMemo(() => {
    const map = new Map<string, number>();
    promptLibrary.forEach((p) => {
      (p.tags || []).forEach((tag) => {
        const t = String(tag || '').trim();
        if (!t) return;
        map.set(t, (map.get(t) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
  }, [promptLibrary]);

  const filteredPrompts = useMemo(() => {
    const keyword = promptSearch.trim().toLowerCase();
    const activeTag = activePromptTag.trim();

    return promptLibrary
      .filter((p) => {
        if (promptFavoritesOnly && !p.isFavorite) return false;
        if (
          promptHighQualityOnly &&
          (typeof p.aiQualityScore !== 'number' || p.aiQualityScore < promptHighQualityThreshold)
        )
          return false;
        if (activeTag && !(p.tags || []).includes(activeTag)) return false;
        if (!keyword) return true;

        const haystack = [
          p.title || '',
          p.prompt || '',
          p.notes || '',
          (p.tags || []).join(' '),
        ]
          .join('\n')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => {
        if (promptSort === 'quality') {
          const aScore = typeof a.aiQualityScore === 'number' ? a.aiQualityScore : -1;
          const bScore = typeof b.aiQualityScore === 'number' ? b.aiQualityScore : -1;
          const delta = bScore - aScore;
          if (delta !== 0) return delta;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        if (promptSort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (promptSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (promptSort === 'favorite') return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [
    promptLibrary,
    promptFavoritesOnly,
    promptHighQualityOnly,
    promptSearch,
    promptSort,
    activePromptTag,
    promptHighQualityThreshold,
  ]);

  const sendPromptToWorkbench = (assetId: string, autoGenerate: boolean) => {
    try {
      localStorage.setItem(PENDING_PROMPT_ASSET_KEY, JSON.stringify({ assetId, autoGenerate }));
    } catch {
      // ignore
    }
    navigate('/workbench');
    toast.success(autoGenerate ? '已发送到工作台并开始生成' : '已发送到工作台');
  };

  const sendImageToWorkbench = (imageId: string, autoGenerate: boolean) => {
    try {
      localStorage.setItem(PENDING_GALLERY_IMAGE_KEY, JSON.stringify({ imageId, autoGenerate }));
    } catch {
      // ignore
    }
    navigate('/workbench');
    toast.success(autoGenerate ? '已发送图片到工作台并开始生成' : '已发送图片到工作台');
  };

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const handleSavePrompt = () => {
    const prompt = draftPrompt.trim();
    if (!prompt) {
      toast.error('提示词不能为空');
      return;
    }

    const payload: Pick<PromptAsset, 'prompt'> &
      Partial<Omit<PromptAsset, 'id' | 'createdAt' | 'updatedAt'>> = {
      title: draftTitle.trim() || undefined,
      prompt,
      tags: parseTags(draftTags),
      notes: draftNotes.trim() || undefined,
      isFavorite: draftFavorite,
    };

    if (editingPromptId) {
      const existing = promptLibrary.find((p) => p.id === editingPromptId);
      if (existing && String(existing.prompt || '').trim() !== prompt) {
        payload.aiQualityScore = undefined;
        payload.aiSummary = undefined;
      }
      updatePromptAsset(editingPromptId, payload);
    } else {
      createPromptAsset(payload);
    }

    setShowPromptEditor(false);
  };

  const handleAiTagPrompt = async (assetId: string) => {
    setAiTaggingPromptId(assetId);
    try {
      await autoTagPromptAsset(assetId);
    } finally {
      setAiTaggingPromptId((prev) => (prev === assetId ? null : prev));
    }
  };

  const handleAiTagImage = async (imageId: string) => {
    setAiTaggingImageId(imageId);
    try {
      await autoTagGalleryImage(imageId);
    } finally {
      setAiTaggingImageId((prev) => (prev === imageId ? null : prev));
    }
  };

  const handleConfirmDeletePrompt = () => {
    if (!pendingDeletePromptId) return;
    deletePromptAsset(pendingDeletePromptId);
    setPendingDeletePromptId(null);
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-6 py-10 pb-24 md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">资产</h1>
            <p className="text-muted-foreground">整理图片与提示词，把高质量方案沉淀为可复用资产。</p>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'prompts' ? (
              <Button onClick={openCreatePrompt}>
                <Plus className="h-4 w-4 mr-2" />
                新建提示词
              </Button>
            ) : (
              <>
                <Button
                  variant={selectMode ? 'secondary' : 'outline'}
                  onClick={() => {
                    const next = !selectMode;
                    setSelectMode(next);
                    if (!next) setSelectedIds([]);
                  }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {selectMode ? '退出选择' : '批量选择'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode((v) => (v === 'grid' ? 'masonry' : 'grid'))}
                  title="切换布局"
                >
                  {viewMode === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <button
            className={cn(
              'h-10 px-4 rounded-lg border text-sm font-medium transition-colors flex items-center gap-2',
              tab === 'images'
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-card hover:bg-secondary text-muted-foreground border-input'
            )}
            onClick={() => setTab('images')}
          >
            <LayoutGrid className="h-4 w-4" />
            图片
            <span className="text-xs text-muted-foreground">({images.length})</span>
          </button>
          <button
            className={cn(
              'h-10 px-4 rounded-lg border text-sm font-medium transition-colors flex items-center gap-2',
              tab === 'prompts'
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-card hover:bg-secondary text-muted-foreground border-input'
            )}
            onClick={() => setTab('prompts')}
          >
            <BookMarked className="h-4 w-4" />
            提示词
            <span className="text-xs text-muted-foreground">({promptLibrary.length})</span>
          </button>
        </div>

        {tab === 'images' ? (
          <>
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索图片（提示词/标签/描述/URL）"
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showImageFavoritesOnly ? 'secondary' : 'outline'}
                  onClick={() => setShowImageFavoritesOnly((v) => !v)}
                  title="只看收藏"
                >
                  <Heart className={cn('h-4 w-4 mr-2', showImageFavoritesOnly && 'fill-rose-500 text-rose-500')} />
                  收藏
                </Button>
                <Button
                  variant={showImageHighQualityOnly ? 'secondary' : 'outline'}
                  onClick={() => setShowImageHighQualityOnly((v) => !v)}
                  title={`只看 AI 高分（≥${imageHighQualityThreshold}）`}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  优质
                </Button>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={imageSortMode}
                  onChange={(e) => setImageSortMode(e.target.value as ImageSortMode)}
                  title="排序"
                >
                  <option value="newest">最新</option>
                  <option value="oldest">最早</option>
                  <option value="favorite">收藏优先</option>
                  <option value="score">AI 得分</option>
                </select>
              </div>
            </div>

            {selectMode && filteredImages.length > 0 ? (
              <div className="rounded-xl border bg-card p-3 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  已选择 {selectedIds.length} / {filteredImages.length}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleSelectAll}>
                    {allSelected ? '取消全选' : '全选'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBatchDownload} disabled={selectedIds.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    下载
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchFavorite(true)}
                    disabled={selectedIds.length === 0}
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    收藏
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchFavorite(false)}
                    disabled={selectedIds.length === 0}
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    取消收藏
                  </Button>
                </div>
              </div>
            ) : null}

            {filteredImages.length === 0 ? (
              <div className="rounded-2xl border bg-card p-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <LayoutGrid className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">还没有图片资产</h3>
                <p className="text-sm text-muted-foreground mb-4">在工作台生成图片并收藏，它们会出现在这里。</p>
                <Button onClick={() => navigate('/workbench')}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  去工作台创作
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
                    : 'columns-2 md:columns-3 lg:columns-4 gap-3 [column-fill:balance]'
                )}
              >
                {filteredImages.map((img) => {
                  const selected = selectedIds.includes(img.id);
                  const itemWrapperClass = viewMode === 'grid' ? '' : 'mb-3 break-inside-avoid';
                  const mediaWrapperClass = viewMode === 'grid' ? 'aspect-square' : '';
                  const imageClass = viewMode === 'grid' ? 'w-full h-full object-cover' : 'w-full h-auto object-cover';
                  const score =
                    typeof img.aiOverallScore === 'number'
                      ? img.aiOverallScore
                      : typeof img.aiPromptAlignmentScore === 'number'
                        ? img.aiPromptAlignmentScore
                        : undefined;

                  return (
                    <div key={img.id} className={itemWrapperClass}>
                      <button
                        className={cn(
                          'group relative w-full overflow-hidden rounded-xl border bg-card text-left',
                          'hover:border-primary/40 transition-colors',
                          selectMode && selected && 'ring-2 ring-primary/20 border-primary/40'
                        )}
                        onClick={() => (selectMode ? toggleSelect(img.id) : setSelectedImage(img))}
                        title="查看详情"
                      >
                        <div className={mediaWrapperClass}>
                          <img src={img.url} alt={img.id} className={imageClass} />
                        </div>

                        {selectMode ? (
                          <div
                            className={cn(
                              'absolute top-2 left-2 h-6 w-6 rounded-lg border bg-black/30 flex items-center justify-center',
                              selected ? 'border-primary bg-primary/20' : 'border-white/30'
                            )}
                          >
                            {selected ? <Check className="h-4 w-4 text-white" /> : null}
                          </div>
                        ) : null}

                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="h-9 w-9 rounded-lg bg-black/35 hover:bg-black/55 flex items-center justify-center"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavoriteImage(img.id);
                            }}
                            title={img.isFavorite ? '取消收藏' : '收藏'}
                          >
                            <Heart
                              className={cn(
                                'h-4 w-4',
                                img.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-white'
                              )}
                            />
                          </button>
                          <button
                            className="h-9 w-9 rounded-lg bg-black/35 hover:bg-black/55 flex items-center justify-center"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownload(img);
                            }}
                            title="下载"
                          >
                            <Download className="h-4 w-4 text-white" />
                          </button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(img.createdAt)}
                            </span>
                            {typeof score === 'number' ? (
                              <span
                                className={cn(
                                  'truncate max-w-[50%] font-medium',
                                  score >= 80 ? 'text-emerald-200' : 'text-white/80'
                                )}
                                title="AI 得分"
                              >
                                AI {Math.round(score)}
                              </span>
                            ) : img.meta?.model ? (
                              <span className="truncate max-w-[50%]">{String(img.meta.model)}</span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索提示词（标题/正文/标签/备注）"
                  value={promptSearch}
                  onChange={(e) => setPromptSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={promptFavoritesOnly ? 'secondary' : 'outline'}
                  onClick={() => setPromptFavoritesOnly((v) => !v)}
                  title="只看收藏"
                >
                  <Star className={cn('h-4 w-4 mr-2', promptFavoritesOnly && 'fill-yellow-400 text-yellow-400')} />
                  收藏
                </Button>
                <Button
                  variant={promptHighQualityOnly ? 'secondary' : 'outline'}
                  onClick={() => setPromptHighQualityOnly((v) => !v)}
                  title={`只看 AI 高分（≥${promptHighQualityThreshold}）`}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  优质
                </Button>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={promptSort}
                  onChange={(e) => setPromptSort(e.target.value as PromptSortMode)}
                  title="排序"
                >
                  <option value="updated">最近更新</option>
                  <option value="newest">最新创建</option>
                  <option value="oldest">最早创建</option>
                  <option value="favorite">收藏优先</option>
                  <option value="quality">AI 评分</option>
                </select>
              </div>
            </div>

            {promptTagStats.length ? (
              <div className="flex items-center flex-wrap gap-2 mb-6">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  标签
                </span>
                {promptTagStats.map(([tagName, count]) => {
                  const active = activePromptTag === tagName;
                  return (
                    <button
                      key={tagName}
                      className={cn(
                        'h-8 px-3 rounded-full border text-xs transition-colors flex items-center gap-2',
                        active
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-card hover:bg-secondary text-muted-foreground border-input'
                      )}
                      onClick={() => setActivePromptTag((prev) => (prev === tagName ? '' : tagName))}
                      title="按标签筛选"
                    >
                      <span>{tagName}</span>
                      <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
                {activePromptTag ? (
                  <Button size="sm" variant="ghost" onClick={() => setActivePromptTag('')}>
                    清除
                  </Button>
                ) : null}
              </div>
            ) : null}

            {filteredPrompts.length === 0 ? (
              <div className="rounded-2xl border bg-card p-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <BookMarked className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">还没有提示词资产</h3>
                <p className="text-sm text-muted-foreground mb-5">
                  提示词是你的创作资产。在工作台收藏节点或在这里新建模板。
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={() => navigate('/workbench')}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    去工作台
                  </Button>
                  <Button onClick={openCreatePrompt}>
                    <Plus className="h-4 w-4 mr-2" />
                    新建提示词
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPrompts.map((p) => {
                  const projectName = p.sourceProjectId ? projectNameById.get(p.sourceProjectId) : undefined;
                  const sourceLabel = projectName
                    ? `来源：${projectName}${p.sourceCanvasId ? ` / ${p.sourceCanvasId}` : ''}`
                    : p.sourceCanvasId
                      ? `来源：${p.sourceCanvasId}`
                      : '';
                  return (
                    <div key={p.id} className="rounded-2xl border bg-card p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{p.title || p.prompt}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{formatDate(p.updatedAt || p.createdAt)}</span>
                            {typeof p.usageCount === 'number' ? <span>· 使用 {p.usageCount}</span> : null}
                            {typeof p.aiQualityScore === 'number' ? (
                              <span
                                className={cn(
                                  'ml-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                                  p.aiQualityScore >= 80
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                    : 'border-input bg-background text-muted-foreground'
                                )}
                                title="AI 质量评分（0-100）"
                              >
                                AI {Math.round(p.aiQualityScore)}
                              </span>
                            ) : null}
                          </div>
                          {sourceLabel ? <div className="text-xs text-muted-foreground mt-1">{sourceLabel}</div> : null}
                        </div>
                        <button
                          className="h-9 w-9 rounded-lg border bg-background hover:bg-accent flex items-center justify-center shrink-0"
                          onClick={() => toggleFavoritePromptAsset(p.id)}
                          title={p.isFavorite ? '取消收藏' : '收藏'}
                        >
                          <Star
                            className={cn(
                              'h-4 w-4',
                              p.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                            )}
                          />
                        </button>
                      </div>

                      {p.tags?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {p.tags.slice(0, 8).map((t) => (
                            <button
                              key={t}
                              className="h-7 px-2.5 rounded-full border text-xs bg-background hover:bg-accent text-muted-foreground"
                              onClick={() => setActivePromptTag((prev) => (prev === t ? '' : t))}
                              title="按标签筛选"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="text-sm whitespace-pre-wrap text-foreground/90 line-clamp-5">{p.prompt}</div>
                      {p.notes ? (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">备注：</span>
                          <span className="whitespace-pre-wrap line-clamp-3">{p.notes}</span>
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="bg-primary hover:bg-primary/90"
                            onClick={() => sendPromptToWorkbench(p.id, true)}
                          >
                            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                            复用并生成
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => sendPromptToWorkbench(p.id, false)}>
                            复用到工作台
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => copyText(p.prompt)}
                            title="复制提示词"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => handleAiTagPrompt(p.id)}
                            disabled={aiTaggingPromptId === p.id}
                            title="AI 打标签/评分"
                          >
                            {aiTaggingPromptId === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => openEditPrompt(p)}
                            title="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => setPendingDeletePromptId(p.id)}
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Image preview */}
      <Dialog open={Boolean(selectedImage)} onOpenChange={(open) => (!open ? setSelectedImage(null) : null)}>
        <DialogContent
          className="max-w-5xl w-[min(96vw,1040px)] p-0 overflow-hidden"
          onClose={() => setSelectedImage(null)}
        >
          {selectedImage ? (
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="bg-black/80 flex items-center justify-center p-2">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.id}
                  className="w-full h-full max-h-[70vh] object-contain rounded-lg"
                />
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">图片详情</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(selectedImage.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    className="h-9 w-9 rounded-lg border bg-background hover:bg-accent flex items-center justify-center shrink-0"
                    onClick={() => toggleFavoriteImage(selectedImage.id)}
                    title={selectedImage.isFavorite ? '取消收藏' : '收藏'}
                  >
                    <Heart
                      className={cn(
                        'h-4 w-4',
                        selectedImage.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground'
                      )}
                    />
                  </button>
                </div>

                <div className="rounded-xl border bg-background/40 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" />
                      元信息
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAiTagImage(selectedImage.id)}
                        disabled={aiTaggingImageId === selectedImage.id}
                      >
                        {aiTaggingImageId === selectedImage.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4 mr-2" />
                        )}
                        AI 分析
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDownload(selectedImage)}>
                        <Download className="h-4 w-4 mr-2" />
                        下载
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {selectedImage.meta?.model ? (
                      <div>
                        <span className="text-foreground/80 font-medium">模型：</span>
                        <span>{String(selectedImage.meta.model)}</span>
                      </div>
                    ) : null}
                    {selectedImage.meta?.imageSize ? (
                      <div>
                        <span className="text-foreground/80 font-medium">尺寸：</span>
                        <span>{String(selectedImage.meta.imageSize)}</span>
                      </div>
                    ) : null}
                    {selectedImage.meta?.aspectRatio ? (
                      <div>
                        <span className="text-foreground/80 font-medium">比例：</span>
                        <span>{String(selectedImage.meta.aspectRatio)}</span>
                      </div>
                    ) : null}
                    {typeof selectedImage.aiOverallScore === 'number' ? (
                      <div>
                        <span className="text-foreground/80 font-medium">总体：</span>
                        <span>{Math.round(selectedImage.aiOverallScore)}</span>
                      </div>
                    ) : null}
                    {typeof selectedImage.aiAestheticScore === 'number' ? (
                      <div>
                        <span className="text-foreground/80 font-medium">审美：</span>
                        <span>{Math.round(selectedImage.aiAestheticScore)}</span>
                      </div>
                    ) : null}
                    {typeof selectedImage.aiPromptAlignmentScore === 'number' ? (
                      <div>
                        <span className="text-foreground/80 font-medium">对齐：</span>
                        <span>{Math.round(selectedImage.aiPromptAlignmentScore)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedImage.aiCaption || selectedImage.tags?.length ? (
                  <div className="rounded-xl border bg-background/40 p-3 space-y-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Wand2 className="h-3.5 w-3.5" />
                      AI 标签
                    </div>
                    {selectedImage.aiCaption ? (
                      <div className="text-sm whitespace-pre-wrap text-foreground/90">{selectedImage.aiCaption}</div>
                    ) : null}
                    {selectedImage.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedImage.tags.slice(0, 16).map((t) => (
                          <button
                            key={t}
                            className="h-7 px-2.5 rounded-full border text-xs bg-background hover:bg-accent text-muted-foreground"
                            onClick={() => {
                              setImageSearch(t);
                              setSelectedImage(null);
                            }}
                            title="用该标签搜索"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">暂无标签</div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">还没有 AI 标签，点击“AI 分析”生成。</div>
                )}

                {selectedImage.meta?.prompt ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">提示词</div>
                    <div className="rounded-xl border bg-background/40 p-3 text-sm whitespace-pre-wrap">
                      {String(selectedImage.meta.prompt)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(String(selectedImage.meta?.prompt || ''))}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        复制提示词
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendImageToWorkbench(selectedImage.id, false)}
                        title="用这张图作为参考图创建新节点"
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        用此图开新节点
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => sendImageToWorkbench(selectedImage.id, true)}
                        title="用这张图作为参考图创建并立即生成"
                      >
                        <Play className="h-4 w-4 mr-2 fill-current" />
                        用此图并生成
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const prompt = String(selectedImage.meta?.prompt || '').trim();
                          if (!prompt) {
                            toast.error('没有可用的提示词');
                            return;
                          }
                          createPromptAsset({
                            prompt,
                            tags: selectedImage.tags || [],
                            notes: selectedImage.aiCaption ? `AI 描述：${selectedImage.aiCaption}` : undefined,
                          });
                        }}
                      >
                        <BookMarked className="h-4 w-4 mr-2" />
                        存为提示词
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">没有可用的提示词信息</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendImageToWorkbench(selectedImage.id, false)}
                        title="用这张图作为参考图创建新节点"
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        用此图开新节点
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => sendImageToWorkbench(selectedImage.id, true)}
                        title="用这张图作为参考图创建并立即生成"
                      >
                        <Play className="h-4 w-4 mr-2 fill-current" />
                        用此图并生成
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Prompt editor */}
      <Dialog open={showPromptEditor} onOpenChange={setShowPromptEditor}>
        <DialogContent onClose={() => setShowPromptEditor(false)} className="max-w-2xl w-[min(96vw,720px)]">
          <DialogHeader>
            <DialogTitle>{editingPromptId ? '编辑提示词' : '新建提示词'}</DialogTitle>
            <DialogDescription>保存后可在工作台一键复用。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">标题（可选）</label>
                <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="例如：赛博朋克雨夜人像" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">标签（逗号分隔）</label>
                <Input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="风格, 构图, 光照…" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">提示词</label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder="输入主提示词…"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">备注（可选）</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="记录这个提示词的使用建议、变体方向等…"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input bg-background"
                checked={draftFavorite}
                onChange={(e) => setDraftFavorite(e.target.checked)}
              />
              收藏
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPromptEditor(false)}>
              取消
            </Button>
            <Button onClick={handleSavePrompt}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt delete confirm */}
      <Dialog open={Boolean(pendingDeletePromptId)} onOpenChange={(open) => (!open ? setPendingDeletePromptId(null) : null)}>
        <DialogContent onClose={() => setPendingDeletePromptId(null)}>
          <DialogHeader>
            <DialogTitle>删除提示词</DialogTitle>
            <DialogDescription>该操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeletePromptId(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeletePrompt}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
