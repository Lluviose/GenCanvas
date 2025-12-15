import axios from 'axios';
import { ApiSettings, GenerationRequest, ImageMeta } from '@/types';
import { getSettings } from '@/store/settingsStore';

const DEFAULT_TIMEOUT = 60_000;

const buildEndpoint = (baseUrl: string) => {
  const normalized = baseUrl.replace(/\/$/, '');
  return `${normalized}/images/generations`;
};

const toDataUrl = (base64: string, mime = 'image/png') => `data:${mime};base64,${base64}`;

const createMockImages = (count: number, width: number, height: number): ImageMeta[] => {
  return Array.from({ length: count }).map((_, idx) => {
    const seed = `${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`;
    return {
      id: `mock_${seed}`,
      nodeId: 'mock',
      jobId: `mock_job_${seed}`,
      url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      createdAt: new Date().toISOString(),
      isFavorite: false,
    };
  });
};

const parseGeminiImages = (data: any, nodeId: string, model: string): ImageMeta[] => {
  const chunks = Array.isArray(data) ? data : [data];
  const images: ImageMeta[] = [];

  chunks.forEach((chunk, chunkIndex) => {
    const candidate = chunk?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    parts.forEach((part: any, partIndex: number) => {
      const inline = part.inlineData || part.inline_data;
      const fileData = part.fileData || part.file_data;
      if (inline?.data) {
        const mime = inline.mimeType || inline.mime_type || 'image/png';
        images.push({
          id: `gemini_inline_${chunkIndex}_${partIndex}_${Date.now()}`,
          nodeId,
          jobId: `gemini_job_${Date.now()}`,
          url: toDataUrl(inline.data, mime),
          createdAt: new Date().toISOString(),
          isFavorite: false,
          meta: { model, mime },
        });
      } else if (fileData?.fileUri || fileData?.file_uri) {
        const url = fileData.fileUri || fileData.file_uri;
        images.push({
          id: `gemini_file_${chunkIndex}_${partIndex}_${Date.now()}`,
          nodeId,
          jobId: `gemini_job_${Date.now()}`,
          url,
          createdAt: new Date().toISOString(),
          isFavorite: false,
          meta: { model },
        });
      }
    });
  });

  return images;
};

export const generateImages = async (
  request: GenerationRequest,
  settings?: ApiSettings
): Promise<ImageMeta[]> => {
  const runtimeSettings = settings || getSettings();

  if (!runtimeSettings.apiKey && !runtimeSettings.allowMockWhenNoKey) {
    throw new Error('请先在设置中配置远程模型的 API Key');
  }

  const {
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    cfgScale,
    seed,
    model,
    count,
  } = request;

  const imageCount = count || runtimeSettings.imageCount || 1;
  const targetModel = model || runtimeSettings.model;

  if (!prompt?.trim()) {
    throw new Error('提示词不能为空');
  }

  // 允许在未配置密钥时体验流程
  if (!runtimeSettings.apiKey && runtimeSettings.allowMockWhenNoKey) {
    return createMockImages(imageCount, width, height);
  }

  // Gemini 兼容分支
  if (runtimeSettings.provider === 'gemini') {
    const base = runtimeSettings.baseUrl.replace(/\/$/, '');
    const modelPath = runtimeSettings.model.startsWith('models/')
      ? runtimeSettings.model
      : `models/${runtimeSettings.model}`;
    const isGoogleOfficial = base.includes('generativelanguage.googleapis.com');
    const url = isGoogleOfficial
      ? `${base}/v1beta/${modelPath}:generateContent?key=${runtimeSettings.apiKey}`
      : `${base}/v1beta/${modelPath}:generateContent`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (!isGoogleOfficial && runtimeSettings.apiKey) {
      headers.Authorization = `Bearer ${runtimeSettings.apiKey}`;
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...(negativePrompt ? [{ text: `Negative prompt: ${negativePrompt}` }] : []),
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'image/png',
        // 宽高目前 Gemini 仅部分模型支持，暂不强制指定，避免报错
      },
    };

    const response = await axios.post(url, payload, {
      headers,
      timeout: DEFAULT_TIMEOUT,
    });

    const images = parseGeminiImages(response.data, request.nodeId || 'unknown', targetModel);
    if (!images.length) {
      throw new Error('Gemini 返回为空，请检查模型或参数是否支持图片生成');
    }
    return images;
  }

  // OpenAI 兼容分支
  const endpoint = buildEndpoint(runtimeSettings.baseUrl);

  try {
    const response = await axios.post(
      endpoint,
      {
        prompt,
        model: targetModel,
        n: imageCount,
        size: `${width}x${height}`,
        response_format: 'url',
        negative_prompt: negativePrompt,
        steps,
        cfg_scale: cfgScale,
        seed: typeof seed === 'number' ? seed : undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${runtimeSettings.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: DEFAULT_TIMEOUT,
      }
    );

    const data = response.data;
    const list: ImageMeta[] = (data?.data || [])
      .map((item: any, idx: number) => {
        const url = item.url || (item.b64_json ? toDataUrl(item.b64_json) : null);
        if (!url) return null;
        return {
          id: item.id || `img_${Date.now()}_${idx}`,
          nodeId: request.nodeId || 'unknown',
          jobId: `job_${Date.now()}`,
          url,
          createdAt: new Date().toISOString(),
          isFavorite: false,
          meta: {
            model: targetModel,
            size: `${width}x${height}`,
          },
        } as ImageMeta;
      })
      .filter(Boolean);

    if (!list.length) {
      throw new Error('接口返回为空，请检查模型或参数');
    }

    return list;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        '生成失败';
      throw new Error(message);
    }

    throw new Error(error?.message || '生成失败');
  }
};

export const testGenerationEndpoint = async (settings?: ApiSettings) => {
  const runtimeSettings = settings || getSettings();
  if (!runtimeSettings.baseUrl) {
    throw new Error('请填写 Base URL');
  }

  if (runtimeSettings.provider === 'gemini') {
    const base = runtimeSettings.baseUrl.replace(/\/$/, '');
    const url = `${base}/v1beta/models?key=${runtimeSettings.apiKey}`;
    const res = await axios.get(url, {
      timeout: 8000,
      validateStatus: (status) => status < 500,
    });
    return res.status;
  }

  const url = `${runtimeSettings.baseUrl.replace(/\/$/, '')}/models`;

  const res = await axios.get(url, {
    headers: runtimeSettings.apiKey
      ? { Authorization: `Bearer ${runtimeSettings.apiKey}` }
      : undefined,
    timeout: 8000,
    validateStatus: (status) => status < 500, // 4xx 也视为连通
  });

  return res.status;
};

