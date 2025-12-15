import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useProjectsStore } from '@/store/projectsStore';
import { useCanvasesStore } from '@/store/canvasesStore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Copy, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';

export default function CanvasesPage() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams();

  const { projects, hydrate: hydrateProjects } = useProjectsStore();
  const { canvasesByProject, hydrate: hydrateCanvases, addCanvas, updateCanvas, deleteCanvas, duplicateCanvas } =
    useCanvasesStore();

  const canvases = useMemo(() => canvasesByProject[projectId] || [], [canvasesByProject, projectId]);

  const [keyword, setKeyword] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [pendingCanvasId, setPendingCanvasId] = useState<string | null>(null);

  useEffect(() => {
    hydrateProjects();
  }, [hydrateProjects]);

  useEffect(() => {
    if (!projectId) return;
    hydrateCanvases(projectId);
  }, [hydrateCanvases, projectId]);

  const project = useMemo(() => projects.find((p) => p.id === projectId) || null, [projects, projectId]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return canvases;
    return canvases.filter(
      (c) =>
        c.name.toLowerCase().includes(k) ||
        String(c.description || '')
          .toLowerCase()
          .includes(k)
    );
  }, [canvases, keyword]);

  const openCanvas = (canvasId: string) => {
    navigate(`/projects/${projectId}/canvases/${canvasId}`);
  };

  const resetDraft = () => {
    setDraftName('');
    setDraftDesc('');
    setPendingCanvasId(null);
  };

  const openCreate = () => {
    resetDraft();
    setShowCreate(true);
  };

  const create = () => {
    if (!projectId) return;
    if (!draftName.trim()) {
      toast.error('请输入画布名称');
      return;
    }
    const c = addCanvas(projectId, { name: draftName, description: draftDesc });
    setShowCreate(false);
    resetDraft();
    toast.success('画布已创建');
    openCanvas(c.id);
  };

  const openEdit = (canvasId: string) => {
    const c = canvases.find((it) => it.id === canvasId);
    if (!c) return;
    setPendingCanvasId(canvasId);
    setDraftName(c.name || '');
    setDraftDesc(c.description || '');
    setShowEdit(true);
  };

  const saveEdit = () => {
    if (!projectId || !pendingCanvasId) return;
    if (!draftName.trim()) {
      toast.error('请输入画布名称');
      return;
    }
    updateCanvas(projectId, pendingCanvasId, { name: draftName, description: draftDesc });
    toast.success('画布已更新');
    setShowEdit(false);
    resetDraft();
  };

  const confirmDelete = (canvasId: string) => {
    setPendingCanvasId(canvasId);
    setShowDelete(true);
  };

  const doDelete = () => {
    if (!projectId || !pendingCanvasId) return;
    if (pendingCanvasId === 'default') {
      toast.error('默认画布不可删除');
      setShowDelete(false);
      resetDraft();
      return;
    }
    deleteCanvas(projectId, pendingCanvasId);
    toast.success('画布已删除');
    setShowDelete(false);
    resetDraft();
  };

  const doDuplicate = (canvasId: string) => {
    if (!projectId) return;
    const c = duplicateCanvas(projectId, canvasId);
    if (!c) {
      toast.error('复制失败');
      return;
    }
    toast.success('画布已复制');
    openCanvas(c.id);
  };

  if (!projectId || !project) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-background">
        <div className="container mx-auto px-6 py-10 pb-24 md:pb-10">
          <div className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <LayoutGrid className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">未找到项目</h3>
            <p className="text-sm text-muted-foreground mb-5">请先返回项目列表，选择一个项目进入画布管理。</p>
            <Button onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回项目
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-6 py-10 pb-24 md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                项目
              </Link>
              <span className="text-muted-foreground">/</span>
              <div className="font-semibold truncate">{project.name}</div>
            </div>
            <h1 className="text-3xl font-bold mb-2">画布</h1>
            <p className="text-muted-foreground">一个项目可以有多个画布，用来承载不同方向/任务的创作图谱。</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            新建画布
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Input placeholder="搜索画布…" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="max-w-md" />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <LayoutGrid className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">还没有画布</h3>
            <p className="text-sm text-muted-foreground mb-5">创建一个画布，在画布中用节点与分支探索你的提示词与生成结果。</p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              创建第一个画布
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border bg-card hover:bg-card/80 transition-colors cursor-pointer"
                onClick={() => openCanvas(c.id)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        {c.id === 'default' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            默认
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description || '—'}</div>
                      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(c.updatedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEdit(c.id);
                        }}
                        title="编辑画布"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          doDuplicate(c.id);
                        }}
                        title="复制画布"
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        disabled={c.id === 'default' || canvases.length <= 1}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          confirmDelete(c.id);
                        }}
                        title={c.id === 'default' ? '默认画布不可删除' : '删除画布'}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent onClose={() => setShowCreate(false)}>
          <DialogHeader>
            <DialogTitle>新建画布</DialogTitle>
            <DialogDescription>画布用于承载一次探索任务：节点 + 分支 + 对比 + 收藏沉淀。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述（可选）</label>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="例如：电商海报/角色设定/材质与光照探索…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={create}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent onClose={() => setShowEdit(false)}>
          <DialogHeader>
            <DialogTitle>编辑画布</DialogTitle>
            <DialogDescription>修改名称与描述不会影响画布内节点与生成结果。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述（可选）</label>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="例如：这个画布主攻插画风 + 低饱和胶片质感…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              取消
            </Button>
            <Button onClick={saveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent onClose={() => setShowDelete(false)}>
          <DialogHeader>
            <DialogTitle>删除画布</DialogTitle>
            <DialogDescription>将删除画布快照（节点/连线）。全局图片库与提示词库不会被删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={doDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
