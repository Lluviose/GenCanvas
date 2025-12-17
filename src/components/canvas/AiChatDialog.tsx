import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareText, Sparkles, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/components/ui/toast';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  imageId: string;
  onFocusNode?: (nodeId: string) => void;
};

export function AiChatDialog({ open, onOpenChange, nodeId, imageId, onFocusNode }: Props) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId) || null);
  const image = useCanvasStore((s) => {
    const n = s.nodes.find((it) => it.id === nodeId);
    return (
      n?.data?.images?.find((img) => img.id === imageId) ||
      s.galleryImages.find((img) => img.id === imageId) ||
      null
    );
  });
  const session = useMemo(() => node?.data.aiChats?.[imageId] || null, [node?.data.aiChats, imageId]);

  const sendAiChatMessage = useCanvasStore((s) => s.sendAiChatMessage);
  const clearAiChat = useCanvasStore((s) => s.clearAiChat);
  const generateFromNode = useCanvasStore((s) => s.generateFromNode);

  const prefs = usePreferencesStore((s) => s.prefs);

  const [includeHistory, setIncludeHistory] = useState(Boolean(prefs.aiChatIncludeHistory));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const lastModelText = useMemo(() => {
    const msgs = session?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'model') return String(msgs[i]?.text || '');
    }
    return '';
  }, [session?.messages]);

  const [applyPromptDraft, setApplyPromptDraft] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIncludeHistory(Boolean(prefs.aiChatIncludeHistory));
  }, [open, prefs.aiChatIncludeHistory]);

  useEffect(() => {
    if (!open) return;
    setApplyPromptDraft('');
    setDraft('');
  }, [open, nodeId, imageId]);

  const presets = prefs.aiChatPresets || [];

  const handleSend = async (text: string, presetId?: string) => {
    if (!nodeId || !imageId) return;
    const msg = String(text || '').trim();
    if (!msg) {
      toast.error('请输入内容');
      return;
    }
    setSending(true);
    try {
      await sendAiChatMessage(nodeId, imageId, msg, { includeHistory, presetId });
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const canGenerate = Boolean(String(applyPromptDraft || '').trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw]" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 对话（分析模型）
          </DialogTitle>
          <DialogDescription>
            默认会附带当前图片（以及可选的对话历史）。你可以把 AI 回复编辑后，一键分叉到子节点继续生成。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: image + presets */}
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-2">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  当前图片
                </span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={includeHistory}
                    onChange={(e) => setIncludeHistory(e.target.checked)}
                  />
                  <span className="text-xs">带历史</span>
                </label>
              </div>
              {image?.url ? (
                <img src={image.url} alt={image.id} className="w-full max-h-56 object-contain rounded border border-border" />
              ) : (
                <div className="text-sm text-muted-foreground">未选择图片</div>
              )}
            </div>

            {presets.length ? (
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="text-sm font-medium">一键预设</div>
                <div className="flex flex-wrap gap-2">
                  {presets.slice(0, 12).map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      disabled={sending}
                      onClick={() => handleSend(p.prompt, p.id)}
                      title={p.prompt}
                    >
                      {p.title}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  if (!confirm('确定要清空当前图片的对话记录吗？')) return;
                  clearAiChat(nodeId, imageId);
                }}
                disabled={!session?.messages?.length}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清空对话
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setApplyPromptDraft(lastModelText)}
                disabled={!lastModelText}
                title="把最新 AI 回复填入下方编辑框"
              >
                使用最新回复
              </Button>
            </div>
          </div>

          {/* Right: chat log + input */}
          <div className="lg:col-span-8 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3 h-[38vh] overflow-y-auto space-y-2">
              {session?.messages?.length ? (
                session.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap border animate-fade-in',
                      m.role === 'user'
                        ? 'bg-secondary/30 border-border text-foreground'
                        : 'bg-primary/5 border-primary/20 text-foreground'
                    )}
                  >
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {m.role === 'user' ? '你' : 'AI'} · {new Date(m.createdAt).toLocaleString('zh-CN')}
                    </div>
                    <div>{m.text}</div>
                    {m.role === 'model' ? (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setApplyPromptDraft(m.text)}>
                          用作提示词
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">还没有对话记录。可点击左侧“一键预设”或在下方输入问题。</div>
              )}
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full min-h-[84px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="输入要问 AI 的内容（会附带当前图片）..."
              />
              <div className="flex justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  建议：让 AI 在结尾输出“改进后提示词：...”以便直接拿来生成。
                </div>
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => handleSend(draft)}
                  disabled={sending || !String(draft || '').trim()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      发送中…
                    </>
                  ) : (
                    '发送'
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="text-sm font-medium">一键继续生成（新分支）</div>
              <textarea
                className="w-full min-h-[84px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                value={applyPromptDraft}
                onChange={(e) => setApplyPromptDraft(e.target.value)}
                placeholder="把 AI 回复（或其中的“改进后提示词”部分）粘贴到这里，可编辑后生成新分支…"
              />
              <DialogFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  关闭
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    const prompt = String(applyPromptDraft || '').trim();
                    if (!prompt) {
                      toast.error('请先填写要生成的提示词');
                      return;
                    }
                    if (!node) return;
                    setGenerating(true);
                    try {
                      const newIds = await generateFromNode(nodeId, {
                        mode: 'append',
                        overrides: {
                          prompt,
                          promptParts: undefined,
                          generationBaseMode: 'image',
                          referenceImageId: imageId,
                          count: node.data.count,
                          imageSize: node.data.imageSize,
                          aspectRatio: node.data.aspectRatio,
                        },
                      });
                      if (newIds?.[0]) {
                        onFocusNode?.(newIds[0]);
                        onOpenChange(false);
                      }
                    } finally {
                      setGenerating(false);
                    }
                  }}
                  disabled={!canGenerate || generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中…
                    </>
                  ) : (
                    '创建分支并生成'
                  )}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
