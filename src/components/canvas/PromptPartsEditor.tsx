import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ImagePolicy } from '@/types/media';
import type { PromptImagePart, PromptPart } from '@/types';
import { cn } from '@/lib/utils';
import { estimateBase64Bytes, fileToBase64Image, formatBytes, toImageSrc } from '@/lib/imageProcessing';
import { extractPromptPlainText, hasPromptImages, normalizePromptParts } from '@/lib/promptParts';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DEFAULT_IMAGE_POLICY: ImagePolicy = {
  enableWebp: true,
  webpQuality: 0.95,
  maxDimension: 3072,
  maxImageMB: 4,
  maxTotalMB: 14,
  maxImages: 5,
};

const makeId = (prefix: string) => {
  const cryptoAny = globalThis.crypto as any;
  if (cryptoAny?.randomUUID) return `${prefix}_${cryptoAny.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const isImagePart = (p: PromptPart): p is PromptImagePart => p.type === 'image';

type Props = {
  value: string;
  promptParts?: PromptPart[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  editorClassName?: string;
  onChange: (next: { prompt: string; promptParts?: PromptPart[] }) => void;
};

export function PromptPartsEditor({
  value,
  promptParts,
  placeholder,
  disabled,
  className,
  editorClassName,
  onChange,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isFocusedRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const imagesRef = useRef<Map<string, PromptImagePart>>(new Map());

  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateId, setAnnotateId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState('');
  const [isReadingFiles, setIsReadingFiles] = useState(false);

  const hasImagesInValue = useMemo(() => hasPromptImages(promptParts), [promptParts]);

  const getImageById = useCallback((id: string) => imagesRef.current.get(id) || null, []);

  const saveSelection = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    savedRangeRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    root.focus();

    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();

    const range = savedRangeRef.current;
    if (range) {
      try {
        sel.addRange(range);
        return;
      } catch {
        // fallthrough
      }
    }

    const end = document.createRange();
    end.selectNodeContents(root);
    end.collapse(false);
    sel.addRange(end);
  }, []);

  const createImageToken = useCallback((img: PromptImagePart) => {
    const token = document.createElement('span');
    token.setAttribute('data-pp-type', 'image');
    token.setAttribute('data-pp-id', img.id);
    token.setAttribute('contenteditable', 'false');
    token.className = cn(
      'inline-flex items-center gap-1.5 align-middle',
      'mx-1 my-0.5 px-1.5 py-1 rounded-lg border shadow-sm',
      'bg-background/80 backdrop-blur-sm border-border/50 select-none',
      img.annotation ? 'ring-1 ring-primary/40' : ''
    );
    if (img.annotation) token.title = img.annotation;

    const thumb = document.createElement('img');
    thumb.src = toImageSrc({ mimeType: img.mimeType, data: img.data });
    thumb.alt = img.annotation ? `参考图：${img.annotation}` : '参考图';
    thumb.className = 'w-8 h-8 rounded-md object-cover border border-border/20';
    token.appendChild(thumb);

    const badge = document.createElement('span');
    badge.setAttribute('data-pp-badge', '1');
    badge.className = cn(
      'text-[10px] leading-none px-1 py-0.5 rounded',
      img.annotation ? 'bg-primary/15 text-primary' : 'hidden'
    );
    badge.textContent = '注';
    token.appendChild(badge);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('data-pp-action', 'remove');
    remove.className = 'ml-0.5 inline-flex items-center justify-center rounded hover:bg-destructive/10';
    remove.title = '移除图片';
    remove.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    token.appendChild(remove);

    return token;
  }, []);

  const emitChangeFromDom = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;

    const parts: PromptPart[] = [];
    const pushText = (text: string) => {
      if (!text) return;
      const last = parts[parts.length - 1];
      if (last && last.type === 'text') {
        last.text += text;
        return;
      }
      parts.push({ type: 'text', text });
    };

    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        pushText(String(node.textContent ?? ''));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      if (el.dataset.ppType === 'image') {
        const id = String(el.dataset.ppId || '');
        const img = imagesRef.current.get(id);
        if (img) parts.push(img);
        return;
      }
      if (el.tagName === 'BR') {
        pushText('\n');
        return;
      }
      // 兜底：把未知元素当作文本
      pushText(String(el.textContent ?? ''));
    });

    const normalized = normalizePromptParts(parts);
    const nextPrompt = extractPromptPlainText(normalized);
    const nextParts = hasPromptImages(normalized) ? normalized : undefined;
    onChange({ prompt: nextPrompt, promptParts: nextParts });
  }, [onChange]);

  const renderFromValue = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    root.innerHTML = '';
    imagesRef.current.clear();

    const usableParts =
      Array.isArray(promptParts) && promptParts.some(isImagePart)
        ? promptParts
        : value
          ? ([{ type: 'text', text: value }] as PromptPart[])
          : [];

    for (const part of usableParts) {
      if (part.type === 'text') {
        root.appendChild(document.createTextNode(String(part.text ?? '')));
      } else if (part.type === 'image') {
        imagesRef.current.set(part.id, part);
        root.appendChild(createImageToken(part));
      }
    }
  }, [createImageToken, promptParts, value]);

  useEffect(() => {
    if (isFocusedRef.current) return;
    renderFromValue();
  }, [renderFromValue, value, promptParts]);

  const removeImage = useCallback(
    (id: string) => {
      const root = editorRef.current;
      if (!root) return;
      const token = root.querySelector(`[data-pp-type="image"][data-pp-id="${CSS.escape(id)}"]`);
      token?.remove();
      imagesRef.current.delete(id);
      emitChangeFromDom();
    },
    [emitChangeFromDom]
  );

  const openAnnotate = useCallback(
    (id: string) => {
      const img = getImageById(id);
      if (!img) return;
      setAnnotateId(id);
      setAnnotationDraft(String(img.annotation ?? ''));
      setAnnotateOpen(true);
    },
    [getImageById]
  );

  const applyAnnotation = useCallback(() => {
    const id = annotateId;
    if (!id) return;
    const current = getImageById(id);
    if (!current) return;

    const nextAnnotation = String(annotationDraft || '').trim();
    const next: PromptImagePart = { ...current, annotation: nextAnnotation || undefined };
    imagesRef.current.set(id, next);

    const root = editorRef.current;
    const token = root?.querySelector(`[data-pp-type="image"][data-pp-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (token) {
      token.title = nextAnnotation || '';
      token.className = cn(
        'inline-flex items-center gap-1 align-middle',
        'mx-0.5 my-0.5 px-1 py-1 rounded-md border',
        'bg-secondary/40 border-border',
        nextAnnotation ? 'ring-1 ring-primary/40' : ''
      );
      const badge = token.querySelector('[data-pp-badge="1"]') as HTMLElement | null;
      if (badge) {
        badge.className = cn(
          'text-[10px] leading-none px-1 py-0.5 rounded',
          nextAnnotation ? 'bg-primary/15 text-primary' : 'hidden'
        );
      }
      const imgEl = token.querySelector('img') as HTMLImageElement | null;
      if (imgEl) imgEl.alt = nextAnnotation ? `参考图：${nextAnnotation}` : '参考图';
    }

    emitChangeFromDom();
    setAnnotateOpen(false);
  }, [annotateId, annotationDraft, emitChangeFromDom, getImageById]);

  const insertImageAtCaret = useCallback(
    (img: PromptImagePart) => {
      const root = editorRef.current;
      if (!root) return;

      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer)) {
        range.selectNodeContents(root);
        range.collapse(false);
      }

      const token = createImageToken(img);
      range.deleteContents();
      range.insertNode(token);
      range.setStartAfter(token);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      savedRangeRef.current = range.cloneRange();
    },
    [createImageToken, restoreSelection]
  );

  const handleChooseFiles = useCallback(() => {
    if (disabled) return;
    saveSelection();
    fileRef.current?.click();
  }, [disabled, saveSelection]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (disabled) return;
      if (!files.length) return;

      const existing = imagesRef.current.size;
      const remaining = Math.max(0, DEFAULT_IMAGE_POLICY.maxImages - existing);
      if (remaining <= 0) {
        toast.error(`参考图最多支持 ${DEFAULT_IMAGE_POLICY.maxImages} 张`);
        return;
      }

      const slice = files.slice(0, remaining);
      if (slice.length < files.length) {
        toast.info(`已自动截断，仅插入前 ${slice.length} 张图片`);
      }

      setIsReadingFiles(true);
      try {
        const maxImageBytes = Math.max(0, Number(DEFAULT_IMAGE_POLICY.maxImageMB || 0)) * 1024 * 1024;
        const maxTotalBytes = Math.max(0, Number(DEFAULT_IMAGE_POLICY.maxTotalMB || 0)) * 1024 * 1024;

        let totalBytes = 0;
        for (const it of imagesRef.current.values()) {
          totalBytes += estimateBase64Bytes(String(it?.data || ''));
        }

        for (const file of slice) {
          const base64 = await fileToBase64Image(file, DEFAULT_IMAGE_POLICY);
          const bytes = estimateBase64Bytes(base64.data);

          if (maxImageBytes > 0 && bytes > maxImageBytes) {
            toast.error(
              `单张图片过大：${file.name}（${formatBytes(bytes)}），上限 ${DEFAULT_IMAGE_POLICY.maxImageMB} MB`
            );
            continue;
          }

          if (maxTotalBytes > 0 && totalBytes + bytes > maxTotalBytes) {
            toast.error(
              `参考图总大小超限：当前 ${formatBytes(totalBytes)}，新增 ${formatBytes(bytes)}，上限 ${DEFAULT_IMAGE_POLICY.maxTotalMB} MB`
            );
            break;
          }

          const img: PromptImagePart = {
            type: 'image',
            id: makeId('ppimg'),
            data: base64.data,
            mimeType: base64.mimeType,
            annotation: undefined,
          };
          imagesRef.current.set(img.id, img);
          insertImageAtCaret(img);
          totalBytes += bytes;
        }
        emitChangeFromDom();
      } catch (error: any) {
        toast.error(error?.message || '读取图片失败');
      } finally {
        setIsReadingFiles(false);
      }
    },
    [disabled, emitChangeFromDom, insertImageAtCaret]
  );

  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const removeBtn = target.closest('[data-pp-action="remove"]') as HTMLElement | null;
      if (removeBtn) {
        const token = removeBtn.closest('[data-pp-type="image"]') as HTMLElement | null;
        const id = String(token?.dataset?.ppId || '');
        if (id) removeImage(id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const token = target.closest('[data-pp-type="image"]') as HTMLElement | null;
      if (token) {
        const id = String(token.dataset.ppId || '');
        if (id) openAnnotate(id);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [openAnnotate, removeImage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSelection();
        document.execCommand?.('insertText', false, '\n');
        emitChangeFromDom();
        return;
      }

      if (e.key !== 'Backspace' && e.key !== 'Delete') return;

      const root = editorRef.current;
      if (!root) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      const container = range.startContainer;
      const offset = range.startOffset;

      const tryRemoveToken = (node: ChildNode | null) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        const el = node as HTMLElement;
        if (el.dataset.ppType !== 'image') return false;
        const id = String(el.dataset.ppId || '');
        if (!id) return false;
        removeImage(id);
        return true;
      };

      // Backspace: remove previous image token
      if (e.key === 'Backspace') {
        if (container.nodeType === Node.TEXT_NODE) {
          if (offset > 0) return;
          if (tryRemoveToken((container as ChildNode).previousSibling)) {
            e.preventDefault();
            return;
          }
        } else if (container === root) {
          const prev = root.childNodes[offset - 1] as ChildNode | undefined;
          if (tryRemoveToken(prev || null)) {
            e.preventDefault();
            return;
          }
        }
      }

      // Delete: remove next image token
      if (e.key === 'Delete') {
        if (container.nodeType === Node.TEXT_NODE) {
          const text = String(container.textContent ?? '');
          if (offset < text.length) return;
          if (tryRemoveToken((container as ChildNode).nextSibling)) {
            e.preventDefault();
            return;
          }
        } else if (container === root) {
          const next = root.childNodes[offset] as ChildNode | undefined;
          if (tryRemoveToken(next || null)) {
            e.preventDefault();
            return;
          }
        }
      }
    },
    [disabled, emitChangeFromDom, removeImage, saveSelection]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      // 强制纯文本粘贴，避免产生 div/p 等导致解析异常
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand?.('insertText', false, text);
      emitChangeFromDom();
    },
    [disabled, emitChangeFromDom]
  );

  const annotateImage = annotateId ? getImageById(annotateId) : null;

  return (
    <div className={cn('relative w-full', className)}>
      <div
        ref={editorRef}
        className={cn(
          'prompt-editor w-full min-h-[110px] rounded-xl border border-input/50 bg-secondary/20 px-3 py-2 text-sm',
          'whitespace-pre-wrap break-words',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-background',
          'transition-all duration-300 ease-spring-smooth hover:bg-secondary/30',
          'pr-12',
          disabled && 'opacity-60 pointer-events-none',
          hasImagesInValue && 'bg-gradient-to-b from-primary/5 to-transparent',
          editorClassName
        )}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        spellCheck={false}
        data-placeholder={placeholder || ''}
        onFocus={() => {
          isFocusedRef.current = true;
          saveSelection();
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          saveSelection();
          emitChangeFromDom();
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onInput={() => emitChangeFromDom()}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleEditorClick}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          await handleFilesSelected(files);
        }}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={handleChooseFiles}
        disabled={disabled || isReadingFiles}
        title="插入参考图片"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog
        open={annotateOpen}
        onOpenChange={(open) => {
          setAnnotateOpen(open);
          if (!open) setAnnotateId(null);
        }}
      >
        <DialogContent className="max-w-lg" onClose={() => setAnnotateOpen(false)}>
          <DialogHeader>
            <DialogTitle>图片标注</DialogTitle>
            <DialogDescription>标注文本会随请求一起发给 API，帮助模型理解参考图。</DialogDescription>
          </DialogHeader>

          {annotateImage ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-2">
                <img
                  src={toImageSrc({ mimeType: annotateImage.mimeType, data: annotateImage.data })}
                  alt="参考图预览"
                  className="w-full max-h-64 object-contain rounded"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">标注文本（可选）</label>
                <Input
                  value={annotationDraft}
                  onChange={(e) => setAnnotationDraft(e.target.value)}
                  placeholder="例如：参考构图/人物服装/色调/风格…"
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">未找到该图片</div>
          )}

          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!annotateId) return;
                removeImage(annotateId);
                setAnnotateOpen(false);
              }}
              disabled={!annotateId}
            >
              移除图片
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setAnnotateOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={applyAnnotation} disabled={!annotateImage}>
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
