import type { PromptImagePart, PromptPart, PromptTextPart } from '@/types';

export const isPromptTextPart = (part: PromptPart): part is PromptTextPart => part.type === 'text';
export const isPromptImagePart = (part: PromptPart): part is PromptImagePart => part.type === 'image';

export const normalizePromptParts = (parts: PromptPart[]): PromptPart[] => {
  const normalized: PromptPart[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    const last = normalized[normalized.length - 1];
    if (last && isPromptTextPart(last)) {
      last.text += text;
      return;
    }
    normalized.push({ type: 'text', text });
  };

  for (const part of Array.isArray(parts) ? parts : []) {
    if (!part) continue;
    if (isPromptTextPart(part)) pushText(String(part.text ?? ''));
    else if (isPromptImagePart(part) && part.id && part.data) normalized.push(part);
  }

  // 移除空文本 part
  return normalized.filter((p) => (isPromptTextPart(p) ? p.text !== '' : true));
};

export const extractPromptPlainText = (parts?: PromptPart[]) => {
  const list = Array.isArray(parts) ? parts : [];
  if (list.length === 0) return '';
  return list
    .filter(isPromptTextPart)
    .map((p) => String(p.text ?? ''))
    .join('');
};

export const extractPromptAnnotationsText = (parts?: PromptPart[]) => {
  const list = Array.isArray(parts) ? parts : [];
  if (list.length === 0) return '';
  return list
    .filter(isPromptImagePart)
    .map((p) => String(p.annotation ?? '').trim())
    .filter(Boolean)
    .join('\n');
};

export const hasPromptImages = (parts?: PromptPart[]) => {
  const list = Array.isArray(parts) ? parts : [];
  return list.some(isPromptImagePart);
};

export const hasEffectivePromptContent = (prompt: string, parts?: PromptPart[]) => {
  const text = String(prompt ?? '').trim();
  if (text) return true;
  if (hasPromptImages(parts)) return true;
  const annotations = extractPromptAnnotationsText(parts);
  return Boolean(String(annotations || '').trim());
};

