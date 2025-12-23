import type {
  WorkbenchAnalyzeImageRequest,
  WorkbenchAnalyzePromptRequest,
  WorkbenchAnalyzeResponse,
  WorkbenchChatRequest,
  WorkbenchChatResponse,
  WorkbenchGenerateRequest,
  WorkbenchGenerateResponse,
  WorkbenchPartialError,
  WorkbenchHealth,
} from '@/types/workbench';
import type { Base64Image } from '@/types/media';
import { getWorkbenchSettings } from '@/store/workbenchSettingsStore';
import { getPreferences } from '@/store/preferencesStore';

export type WorkbenchGenerateAttemptEvent =
  | {
      attempt: number;
      images: Base64Image[];
      imageThoughtSignatures: Array<string | undefined>;
      imageTextPart?: string;
      imageTextThoughtSignature?: string;
    }
  | { attempt: number; error: string };

const API_TIMEOUT_MS = 300_000;
const GENERATION_MIN_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let generationStartLock: Promise<void> = Promise.resolve();
let nextGenerationStartAt = 0;

const scheduleGenerationStart = async (minIntervalMs = GENERATION_MIN_INTERVAL_MS) => {
  let release!: () => void;
  const lock = new Promise<void>((resolve) => (release = resolve));
  const prev = generationStartLock;
  generationStartLock = lock;
  await prev;

  let waitMs = 0;
  try {
    const now = Date.now();
    waitMs = Math.max(0, nextGenerationStartAt - now);
    nextGenerationStartAt = Math.max(nextGenerationStartAt, now) + minIntervalMs;
  } finally {
    release();
  }

  if (waitMs > 0) await sleep(waitMs);
};

const isOfficialGoogleEndpoint = (baseUrl: string) => {
  const host = String(baseUrl || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .toLowerCase();
  return host === 'generativelanguage.googleapis.com';
};

const getInlineDataFromPart = (part: any) => part?.inline_data || part?.inlineData || part?.inLineData || part?.inline_data;

const extractImagesFromResponse = (data: any) => {
  const images: Base64Image[] = [];
  const imageThoughtSignatures: Array<string | undefined> = [];
  const texts: string[] = [];
  let signedTextPart: { text: string; thoughtSignature: string } | null = null;
  if (!data) return { images, imageThoughtSignatures, texts, signedTextPart };
  const chunks = Array.isArray(data) ? data : [data];
  for (const chunk of chunks) {
    const candidate = Array.isArray(chunk?.candidates) ? chunk.candidates[0] : chunk?.candidates?.[0] || null;
    const content = candidate?.content || candidate?.contents;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      const inlineData = getInlineDataFromPart(part);
      if (inlineData?.data) {
        images.push({
          mimeType: inlineData.mime_type || inlineData.mimeType || 'image/png',
          data: inlineData.data,
        });
        imageThoughtSignatures.push(
          typeof part?.thought_signature === 'string'
            ? part.thought_signature
            : typeof part?.thoughtSignature === 'string'
              ? part.thoughtSignature
              : undefined
        );
      } else if (part?.file_data || part?.fileData) {
        const fileData = part.file_data || part.fileData;
        images.push({
          mimeType: fileData.mime_type || fileData.mimeType || 'image/png',
          data: fileData.file_uri || fileData.fileUri || '',
        });
        imageThoughtSignatures.push(
          typeof part?.thought_signature === 'string'
            ? part.thought_signature
            : typeof part?.thoughtSignature === 'string'
              ? part.thoughtSignature
              : undefined
        );
      } else if (part?.text) {
        const text = String(part.text);
        texts.push(text);
        if (!signedTextPart) {
          const sig =
            typeof part?.thought_signature === 'string'
              ? part.thought_signature
              : typeof part?.thoughtSignature === 'string'
                ? part.thoughtSignature
                : undefined;
          if (sig) signedTextPart = { text, thoughtSignature: String(sig) };
        }
      }
    }
  }
  return { images, imageThoughtSignatures, texts, signedTextPart };
};

const extractTextAndSignatureFromResponse = (data: any) => {
  const texts: string[] = [];
  let thoughtSignature: string | undefined = undefined;
  if (!data) return { text: '', thoughtSignature };
  const chunks = Array.isArray(data) ? data : [data];
  for (const chunk of chunks) {
    const candidate = Array.isArray(chunk?.candidates) ? chunk.candidates[0] : chunk?.candidates?.[0] || null;
    const content = candidate?.content || candidate?.contents;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === 'string') {
        texts.push(part.text);
        if (!thoughtSignature) {
          thoughtSignature =
            typeof part?.thought_signature === 'string'
              ? part.thought_signature
              : typeof part?.thoughtSignature === 'string'
                ? part.thoughtSignature
                : undefined;
        }
      }
    }
  }
  return { text: texts.join(''), thoughtSignature };
};

const convertToOpenAIPayload = (geminiRequest: any = {}, config: any = {}) => {
  const messages: any[] = [];
  const contents = Array.isArray(geminiRequest.contents) ? geminiRequest.contents : [];
  contents.forEach((content: any) => {
    const role = content?.role === 'model' ? 'assistant' : 'user';
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const oaContent: any[] = [];
    parts.forEach((part: any) => {
      if (part?.text) oaContent.push({ type: 'text', text: part.text });
      const inlineData = getInlineDataFromPart(part);
      if (inlineData?.data) {
        const mime = inlineData.mime_type || inlineData.mimeType || 'image/png';
        oaContent.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${inlineData.data}` } });
      }
    });
    if (oaContent.length) messages.push({ role, content: oaContent });
  });
  return {
    model: config.openaiModel || 'gpt-4o-mini',
    messages,
    temperature: geminiRequest?.generationConfig?.temperature,
  };
};

const convertOpenAIResponseToGemini = (data: any) => {
  const choice = data?.choices?.[0];
  if (!choice?.message) return null;
  const parts: any[] = [];
  const content = choice.message.content;

  const pushImageUrl = (url: string) => {
    if (!url) return;
    if (url.startsWith('data:')) {
      const [meta, base64Data] = url.split(';base64,');
      const mimeMatch = meta && meta.match(/^data:(.*)$/);
      const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
      parts.push({ inline_data: { mime_type: mime, data: base64Data || '' } });
    } else {
      parts.push({ file_data: { mime_type: 'image/png', file_uri: url } });
    }
  };

  if (Array.isArray(content)) {
    content.forEach((p: any) => {
      if (p?.type === 'text' && p.text) parts.push({ text: p.text });
      else if (p?.type === 'image_url' && p.image_url?.url) pushImageUrl(p.image_url.url);
    });
  } else if (typeof content === 'string') {
    parts.push({ text: content });
  }

  return parts.length ? { candidates: [{ content: { parts } }] } : null;
};

const buildApiUrlAndHeaders = (currentConfig: any, apiKey: string) => {
  const baseUrl = currentConfig?.baseUrl;
  const apiVersion = currentConfig?.apiVersion;
  const model = currentConfig?.model;
  const base = String(baseUrl).replace(/\/$/, '');
  const modelPath = String(model).startsWith('models/') ? model : `models/${model}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isOfficialGoogleEndpoint(baseUrl)) {
    return {
      url: `${base}/${apiVersion}/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers,
    };
  }
  headers.Authorization = `Bearer ${apiKey}`;
  return {
    url: `${base}/${apiVersion}/${modelPath}:generateContent`,
    headers,
  };
};

const callJsonApi = async (url: string, init: RequestInit, timeoutMs = API_TIMEOUT_MS) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const rawText = await res.text().catch(() => '');
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText;
    }
    if (!res.ok) {
      const msg =
        (data as any)?.error?.message ||
        (data as any)?.message ||
        (data as any)?.error ||
        (typeof data === 'string' ? data : '') ||
        `HTTP ${res.status}`;
      throw new Error(String(msg).slice(0, 300));
    }
    return data;
  } finally {
    clearTimeout(t);
  }
};

const isOpenAIFormat = (cfg: any) => (cfg?.apiFormat || 'gemini') === 'openai';

const normalizeImageSize = (value: any) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (['1K', '2K', '4K'].includes(normalized)) return normalized;
  return null;
};

const normalizeAspectRatio = (value: any) => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase() === 'auto') return 'auto';
  const match = v.match(/^(\d{1,3})\s*[:/]\s*(\d{1,3})$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return `${w}:${h}`;
};

const normalizeSafetySettings = (settings: any) => {
  const allowed = new Set(['BLOCK_NONE', 'BLOCK_ONLY_HIGH', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_LOW_AND_ABOVE', 'OFF']);
  const next: Record<string, string> = {};
  if (!settings || typeof settings !== 'object') return next;
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'string') continue;
    const up = value.trim().toUpperCase();
    next[key] = allowed.has(up) ? up : 'BLOCK_NONE';
  }
  return next;
};

const buildTxt2ImgRequest = (
  currentConfig: any,
  {
    prompt,
    promptParts,
    contents,
    negativePrompt,
    imageSize,
    aspectRatio,
    inputImage,
  }: {
    prompt: string;
    promptParts?: WorkbenchGenerateRequest['promptParts'];
    contents?: WorkbenchGenerateRequest['contents'];
    negativePrompt?: string;
    imageSize?: string;
    aspectRatio?: string;
    inputImage?: Base64Image;
  }
) => {
  const cleaned = String(prompt || '').trim();
  const structured = Array.isArray(promptParts) ? promptParts : [];
  const hasStructured = structured.length > 0;
  const customContents = Array.isArray(contents) ? contents : [];
  const hasCustomContents = customContents.length > 0;
  if (!cleaned && !hasStructured && !hasCustomContents) throw new Error('Prompt is required');

  const parts: any[] = [];

  if (inputImage?.data && String(inputImage?.mimeType || '').toLowerCase().startsWith('image/')) {
    parts.push({ text: '参考图片如下，请基于参考图片继续生成，并遵循后续提示词：' });
    parts.push({ inline_data: { mime_type: inputImage.mimeType, data: inputImage.data } });
  }

  if (hasStructured) {
    for (const part of structured) {
      if (part?.type === 'text') {
        const text = String((part as any)?.text ?? '');
        if (text) parts.push({ text });
        continue;
      }
      if (part?.type === 'image') {
        const data = String((part as any)?.data ?? '');
        const mimeType = String((part as any)?.mimeType ?? 'image/png');
        if (data && mimeType.toLowerCase().startsWith('image/')) {
          parts.push({ inline_data: { mime_type: mimeType, data } });
          const ann = String((part as any)?.annotation ?? '').trim();
          if (ann) parts.push({ text: `（参考图标注：${ann}）` });
        }
        continue;
      }
    }
  } else if (cleaned) {
    parts.push({ text: cleaned });
  }

  if (parts.length === 0) {
    // 极端兜底：避免发送空 parts
    parts.push({ text: '请基于以上参考图生成图片。' });
  }
  if (negativePrompt && String(negativePrompt).trim()) {
    parts.push({ text: `Negative prompt: ${String(negativePrompt).trim()}` });
  }

  const generationConfig: any = {
    temperature: 1,
  };
  generationConfig.responseModalities = ['TEXT', 'IMAGE'];

  const imageConfig: any = {};
  const overrideSize = normalizeImageSize(imageSize);
  const overrideRatio = normalizeAspectRatio(aspectRatio);
  const defaultSize = normalizeImageSize(currentConfig?.imageConfig?.imageSize);
  const defaultRatio = normalizeAspectRatio(currentConfig?.imageConfig?.aspectRatio);

  if (overrideSize) imageConfig.imageSize = overrideSize;
  else if (defaultSize) imageConfig.imageSize = defaultSize;

  const ratioToUse = overrideRatio || defaultRatio;
  if (ratioToUse && ratioToUse !== 'auto') imageConfig.aspectRatio = ratioToUse;

  if (Object.keys(imageConfig).length > 0) generationConfig.imageConfig = imageConfig;

  const requestBody: any = {
    contents: hasCustomContents ? customContents : [{ role: 'user', parts }],
    generationConfig,
  };

  if (currentConfig?.enableSafetySettings !== false && currentConfig?.safetySettings) {
    const normalized = normalizeSafetySettings(currentConfig.safetySettings);
    const arr = Object.entries(normalized)
      .filter(([, v]) => v && v !== 'OFF')
      .map(([category, threshold]) => ({ category, threshold }));
    if (arr.length) requestBody.safetySettings = arr;
  }

  if (currentConfig?.enableGoogleSearch) requestBody.tools = [{ google_search: {} }];
  return requestBody;
};

const callGeminiLike = async (config: any, requestBody: any) => {
  const useOpenAI = isOpenAIFormat(config);
  const apiKeyToUse = useOpenAI
    ? String(config?.openaiApiKey || config?.apiKey || '').trim()
    : String(config?.apiKey || '').trim();

  if (!apiKeyToUse) throw new Error('API Key 未配置');

  if (useOpenAI) {
    const base = String(config?.openaiBaseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const url = `${base}/v1/chat/completions`;
    const actualPayload = convertToOpenAIPayload(requestBody, config);
    const data = await callJsonApi(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKeyToUse}`,
        },
        body: JSON.stringify(actualPayload),
      },
      API_TIMEOUT_MS
    );
    return convertOpenAIResponseToGemini(data) || data;
  }

  const built = buildApiUrlAndHeaders(config, apiKeyToUse);
  return callJsonApi(
    built.url,
    {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(requestBody),
    },
    API_TIMEOUT_MS
  );
};

export const getWorkbenchHealth = async (): Promise<WorkbenchHealth> => {
  const s = getWorkbenchSettings();
  const openai = isOpenAIFormat(s);
  const hasGenerationKey = Boolean(String((openai ? s.openaiApiKey || s.apiKey : s.apiKey) || '').trim());
  const hasAnalysisKey = Boolean(String(s.analysis?.apiKey || (openai ? s.openaiApiKey || s.apiKey : s.apiKey) || '').trim());
  return {
    status: 'ok',
    generation: {
      apiFormat: (s.apiFormat || 'gemini') as any,
      model: openai ? s.openaiModel || 'gpt-4o-mini' : s.model,
      hasApiKey: hasGenerationKey,
      enableStream: false,
      imageConfig: s.imageConfig || { aspectRatio: 'auto', imageSize: '2K' },
    },
    analysis: {
      baseUrl: s.analysis?.baseUrl || s.baseUrl,
      apiVersion: s.analysis?.apiVersion || s.apiVersion,
      model: s.analysis?.model || 'gemini-2.0-flash',
      hasApiKey: hasAnalysisKey,
    },
  } as WorkbenchHealth;
};

export const generateWorkbench = async (
  payload: WorkbenchGenerateRequest,
  options?: { onAttempt?: (event: WorkbenchGenerateAttemptEvent) => void }
): Promise<WorkbenchGenerateResponse> => {
  const s = getWorkbenchSettings();
  if (isOpenAIFormat(s)) {
    throw new Error('OpenAI 模式当前不支持图片生成，请切换到 Gemini 模式');
  }
  const cleanedPrompt = String(payload?.prompt || '').trim();
  const hasStructured = Array.isArray(payload?.promptParts) && payload.promptParts.length > 0;
  const hasCustomContents = Array.isArray(payload?.contents) && payload.contents.length > 0;
  if (!cleanedPrompt && !hasStructured && !hasCustomContents) throw new Error('Prompt is required');

  const count = Math.max(1, Math.min(8, Number(payload?.count ?? 1) || 1));
  const requestBody = buildTxt2ImgRequest(s, {
    prompt: cleanedPrompt,
    promptParts: payload?.promptParts,
    contents: payload?.contents,
    negativePrompt: payload?.negativePrompt,
    imageSize: payload?.imageSize,
    aspectRatio: payload?.aspectRatio,
    inputImage: payload?.inputImage,
  });

  const startAt = Date.now();
  const images: Base64Image[] = [];
  const imageThoughtSignatures: Array<string | undefined> = [];
  const imageTextParts: Array<string | undefined> = [];
  const imageTextThoughtSignatures: Array<string | undefined> = [];
  const texts: string[] = [];
  const partialErrors: WorkbenchPartialError[] = [];
  for (let i = 0; i < count; i++) {
    try {
      await scheduleGenerationStart();
      const resp = await callGeminiLike(s, requestBody);
      const extracted = extractImagesFromResponse(resp);
      texts.push(...extracted.texts);

      if (!extracted.images.length) {
        const message = '本次请求未返回图片';
        partialErrors.push({ attempt: i + 1, message });
        // no images, report progress as error
        options?.onAttempt?.({ attempt: i + 1, error: message });
        continue;
      }

      const imageThoughtSigs = extracted.imageThoughtSignatures || [];
      const textPart = extracted.signedTextPart?.text;
      const textSig = extracted.signedTextPart?.thoughtSignature;

      images.push(...extracted.images);
      imageThoughtSignatures.push(...imageThoughtSigs);
      for (let j = 0; j < extracted.images.length; j++) {
        imageTextParts.push(textPart);
        imageTextThoughtSignatures.push(textSig);
      }

      options?.onAttempt?.({
        attempt: i + 1,
        images: extracted.images,
        imageThoughtSignatures: imageThoughtSigs,
        imageTextPart: textPart,
        imageTextThoughtSignature: textSig,
      });
    } catch (error: any) {
      const message = String(error?.message || error || '未知错误');
      partialErrors.push({ attempt: i + 1, message });
      options?.onAttempt?.({ attempt: i + 1, error: message });
    }
  }

  if (!images.length) {
    const first = partialErrors[0]?.message;
    throw new Error(first || '未能生成图片，请调整描述后重试');
  }

  const durationMs = Date.now() - startAt;
  return {
    success: true,
    durationMs,
    durationSeconds: Math.round(durationMs / 1000),
    requestedCount: count,
    succeededCount: Math.max(0, count - partialErrors.length),
    failedCount: partialErrors.length,
    partialErrors: partialErrors.length ? partialErrors : undefined,
    images,
    imageThoughtSignatures,
    imageTextParts,
    imageTextThoughtSignatures,
    message: texts.join(' '),
  } as WorkbenchGenerateResponse;
};

export const chatAnalyze = async (payload: WorkbenchChatRequest): Promise<WorkbenchChatResponse> => {
  const s = getWorkbenchSettings();
  const analysisConfig: any = {
    ...s,
    baseUrl: s.analysis?.baseUrl || s.baseUrl,
    apiVersion: s.analysis?.apiVersion || s.apiVersion,
    model: s.analysis?.model || s.model,
  };
  if (s.analysis?.apiKey) {
    analysisConfig.apiKey = s.analysis.apiKey;
    analysisConfig.openaiApiKey = s.analysis.apiKey;
  }
  if (isOpenAIFormat(analysisConfig)) {
    analysisConfig.openaiModel = analysisConfig.model;
  }

  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  if (contents.length === 0) throw new Error('contents is required');

  const temperatureRaw = Number(payload?.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 0.4;

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature,
      responseModalities: ['TEXT'],
    },
  };

  if (analysisConfig?.enableSafetySettings !== false && analysisConfig?.safetySettings) {
    const normalized = normalizeSafetySettings(analysisConfig.safetySettings);
    const arr = Object.entries(normalized)
      .filter(([, v]) => v && v !== 'OFF')
      .map(([category, threshold]) => ({ category, threshold }));
    if (arr.length) requestBody.safetySettings = arr;
  }
  if (analysisConfig?.enableGoogleSearch) requestBody.tools = [{ google_search: {} }];

  const startAt = Date.now();
  const resp = await callGeminiLike(analysisConfig, requestBody);
  const extracted = extractTextAndSignatureFromResponse(resp);
  return {
    success: true,
    durationMs: Date.now() - startAt,
    text: extracted.text || '',
    thoughtSignature: extracted.thoughtSignature,
  };
};

export const analyzePrompt = async (payload: WorkbenchAnalyzePromptRequest): Promise<WorkbenchAnalyzeResponse> => {
  const s = getWorkbenchSettings();
  const cleanedPrompt = String(payload?.prompt || '').trim();
  if (!cleanedPrompt) throw new Error('Prompt is required');

  const analysisConfig: any = {
    ...s,
    baseUrl: s.analysis?.baseUrl || s.baseUrl,
    apiVersion: s.analysis?.apiVersion || s.apiVersion,
    model: s.analysis?.model || s.model,
  };
  if (s.analysis?.apiKey) {
    analysisConfig.apiKey = s.analysis.apiKey;
    analysisConfig.openaiApiKey = s.analysis.apiKey;
  }
  if (isOpenAIFormat(analysisConfig)) {
    analysisConfig.openaiModel = analysisConfig.model;
  }

  const instruction =
    '你是一个面向“文生图创作”的提示词分析器。请分析用户的提示词，并输出严格的 JSON（不要 Markdown、不要代码块），结构如下：\n{\n  "summary": string,\n  "qualityScore": number,\n  "strengths": string[],\n  "risks": string[],\n  "missingDetails": string[],\n  "suggestedPrompt": string,\n  "suggestedNegativePrompt": string,\n  "tags": string[]\n}\n要求：用中文；qualityScore 取 0-100（综合衡量提示词的清晰度、可控性与复用价值）；suggestedPrompt 要可直接用于文生图；若无 negativePrompt 建议则输出空字符串。';

  const requestBody: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: instruction }, { text: `\n\n[USER_PROMPT]\n${cleanedPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseModalities: ['TEXT'],
    },
  };

  if (analysisConfig?.enableSafetySettings !== false && analysisConfig?.safetySettings) {
    const normalized = normalizeSafetySettings(analysisConfig.safetySettings);
    const arr = Object.entries(normalized)
      .filter(([, v]) => v && v !== 'OFF')
      .map(([category, threshold]) => ({ category, threshold }));
    if (arr.length) requestBody.safetySettings = arr;
  }
  if (analysisConfig?.enableGoogleSearch) requestBody.tools = [{ google_search: {} }];

  const startAt = Date.now();
  const responseData = await callGeminiLike(analysisConfig, requestBody);
  const { texts } = extractImagesFromResponse(responseData);
  const raw = String(texts.join('') || '').trim();

  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }
  }

  return {
    success: true,
    durationMs: Date.now() - startAt,
    raw,
    parsed,
  } as WorkbenchAnalyzeResponse;
};

export const analyzeImage = async (payload: WorkbenchAnalyzeImageRequest): Promise<WorkbenchAnalyzeResponse> => {
  const s = getWorkbenchSettings();
  const image = payload?.image;
  const prompt = String(payload?.prompt || '').trim();
  if (!image?.data || !String(image?.mimeType || '').toLowerCase().startsWith('image/')) {
    throw new Error('Image is required');
  }

  const analysisConfig: any = {
    ...s,
    baseUrl: s.analysis?.baseUrl || s.baseUrl,
    apiVersion: s.analysis?.apiVersion || s.apiVersion,
    model: s.analysis?.model || s.model,
  };
  if (s.analysis?.apiKey) {
    analysisConfig.apiKey = s.analysis.apiKey;
    analysisConfig.openaiApiKey = s.analysis.apiKey;
  }
  if (isOpenAIFormat(analysisConfig)) {
    analysisConfig.openaiModel = analysisConfig.model;
  }

  const defaultInstruction = `你是一个专业且严格的文生图结果分析器。请结合（可选的）提示词与图片内容，进行严格评估。

【评分标准 - 请严格执行】
- 90-100：商业级作品，可直接用于出版/广告，几乎无瑕疵
- 80-89：高质量作品，仅有微小可忽略的问题
- 70-79：良好作品，有一些小问题但整体不错
- 60-69：及格作品，存在明显问题但基本可用
- 40-59：较差作品，有较多问题需要修改
- 20-39：差作品，问题严重，需要重新生成
- 0-19：失败作品，完全不可用

【常见扣分项】
- 人物：手指畸形(-15)、面部扭曲(-20)、肢体比例失调(-10)、多余肢体(-25)
- 文字：乱码/错字(-10)、文字扭曲(-5)
- 构图：主体不清晰(-10)、画面杂乱(-8)、裁切不当(-5)
- 细节：模糊失焦(-8)、伪影噪点(-5)、边缘锯齿(-3)
- 风格：与提示词风格不符(-15)、风格不统一(-10)
- 光影：光源矛盾(-8)、阴影错误(-5)

请输出严格的 JSON（不要 Markdown、不要代码块），结构如下：
{
  "caption": string,
  "overallScore": number,
  "aestheticScore": number,
  "promptAlignment": { "score": number, "notes": string },
  "strengths": string[],
  "issues": string[],
  "suggestedPrompt": string,
  "suggestedNegativePrompt": string,
  "tags": string[]
}

要求：用中文；请严格按上述标准评分，不要轻易给高分；suggestedPrompt 要可直接用于文生图；若无 negativePrompt 建议则输出空字符串。`;
  const userInstruction = getPreferences().aiImageAnalysisPrompt?.trim();
  const instruction = userInstruction || defaultInstruction;

  const parts: any[] = [{ text: instruction }];
  if (prompt) parts.push({ text: `\n\n[USER_PROMPT]\n${prompt}` });
  parts.push({ text: '\n\n[IMAGE]\n' });
  parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });

  const requestBody: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseModalities: ['TEXT'],
    },
  };

  if (analysisConfig?.enableSafetySettings !== false && analysisConfig?.safetySettings) {
    const normalized = normalizeSafetySettings(analysisConfig.safetySettings);
    const arr = Object.entries(normalized)
      .filter(([, v]) => v && v !== 'OFF')
      .map(([category, threshold]) => ({ category, threshold }));
    if (arr.length) requestBody.safetySettings = arr;
  }
  if (analysisConfig?.enableGoogleSearch) requestBody.tools = [{ google_search: {} }];

  const startAt = Date.now();
  const responseData = await callGeminiLike(analysisConfig, requestBody);
  const { texts } = extractImagesFromResponse(responseData);
  const raw = String(texts.join('') || '').trim();

  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }
  }

  return {
    success: true,
    durationMs: Date.now() - startAt,
    raw,
    parsed,
  } as WorkbenchAnalyzeResponse;
};
