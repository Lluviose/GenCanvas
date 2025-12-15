import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useProjectsStore } from '@/store/projectsStore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, FolderKanban, Plus, Trash2 } from 'lucide-react';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, addProject, deleteProject, hydrate } = useProjectsStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(k) || (p.description || '').toLowerCase().includes(k));
  }, [projects, keyword]);

  const openProject = (projectId: string) => {
    navigate(`/projects/${projectId}/canvases`);
  };

  const createProject = () => {
    if (!name.trim()) {
      toast.error('请输入项目名称');
      return;
    }
    const p = addProject({ name, description: desc });
    setShowCreate(false);
    setName('');
    setDesc('');
    toast.success('项目已创建');
    openProject(p.id);
  };

  const confirmDelete = (projectId: string) => {
    setPendingDeleteId(projectId);
    setShowDelete(true);
  };

  const doDelete = () => {
    if (!pendingDeleteId) return;
    deleteProject(pendingDeleteId);
    setShowDelete(false);
    setPendingDeleteId(null);
    toast.success('项目已删除');
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-6 py-10 pb-24 md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">项目</h1>
            <p className="text-muted-foreground">用项目来组织不同主题的创作图谱。</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新建项目
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Input
            placeholder="搜索项目…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="max-w-md"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FolderKanban className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">还没有项目</h3>
            <p className="text-sm text-muted-foreground mb-5">创建一个项目，进入画布开始探索提示词与生成结果。</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              创建第一个项目
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <div 
                key={p.id} 
                className="rounded-2xl border bg-card hover:bg-card/80 transition-colors cursor-pointer"
                onClick={() => openProject(p.id)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description || '—'}</div>
                      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          confirmDelete(p.id);
                        }}
                        title="删除项目"
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
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建后会进入画布列表（包含默认画布）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createProject()} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述（可选）</label>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="例如：电商海报 / 角色设计 / 场景概念…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={createProject}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent onClose={() => setShowDelete(false)}>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>该操作不会删除本地图库/提示词库，但会删除项目本身。</DialogDescription>
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
