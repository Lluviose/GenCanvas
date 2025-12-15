import type { Base64Image } from '@/types/media';
import type { PromptPart } from '@/types';

export type GeminiPart =
  | {
      text: string;
      thought_signature?: string;
      thoughtSignature?: string;
    }
  | {
      inline_data: { mime_type: string; data: string };
      thought_signature?: string;
      thoughtSignature?: string;
      thought?: boolean;
    }
  | {
      file_data: { mime_type: string; file_uri: string };
      thought_signature?: string;
      thoughtSignature?: string;
      thought?: boolean;
    };

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export interface WorkbenchHealth {
  status: 'ok' | 'error';
  generation: {
    apiFormat: 'gemini' | 'openai';
    model: string;
    hasApiKey: boolean;
    enableStream: boolean;
    imageConfig?: {
      imageSize?: string;
      aspectRatio?: string;
    };
  };
  analysis: {
    baseUrl: string;
    apiVersion: string;
    model: string;
    hasApiKey: boolean;
  };
}

export interface WorkbenchGenerateRequest {
  prompt: string;
  promptParts?: PromptPart[];
  contents?: GeminiContent[];
  negativePrompt?: string;
  count?: number;
  imageSize?: string;
  aspectRatio?: string;
  inputImage?: Base64Image;
}

export type WorkbenchPartialError = {
  attempt: number;
  message: string;
};

export interface WorkbenchGenerateResponse {
  success: boolean;
  durationMs?: number;
  durationSeconds?: number;
  requestedCount?: number;
  succeededCount?: number;
  failedCount?: number;
  partialErrors?: WorkbenchPartialError[];
  images?: Base64Image[];
  imageThoughtSignatures?: Array<string | undefined>;
  /**
   * 生成响应中“带 thought_signature 的首个文本 part”（若存在），按图片对齐复制一份。
   * 用于多轮对话时更完整地回传签名，避免 MISSING_THOUGHT_SIGNATURE。
   */
  imageTextParts?: Array<string | undefined>;
  imageTextThoughtSignatures?: Array<string | undefined>;
  message?: string;
  errorCode?: string;
  error?: string;
}

export interface WorkbenchAnalyzePromptRequest {
  prompt: string;
}

export interface WorkbenchAnalyzeResponse {
  success: boolean;
  durationMs?: number;
  raw?: string;
  parsed?: any;
  errorCode?: string;
  error?: string;
}

export interface WorkbenchAnalyzeImageRequest {
  image: Base64Image;
  prompt?: string;
}

export interface WorkbenchChatRequest {
  contents: GeminiContent[];
  temperature?: number;
}

export interface WorkbenchChatResponse {
  success: boolean;
  durationMs?: number;
  text: string;
  thoughtSignature?: string;
}
