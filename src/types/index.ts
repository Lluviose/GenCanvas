// 提示词内容部分 - 支持文本和图片交错
export interface PromptTextPart {
  type: 'text';
  text: string;
}

export interface PromptImagePart {
  type: 'image';
  id: string; // 唯一标识
  data: string; // base64 数据
  mimeType: string;
  annotation?: string; // 图片标注/说明文字
  thumbnailUrl?: string; // 用于显示的缩略图URL
}

export type PromptPart = PromptTextPart | PromptImagePart;

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  thoughtSignature?: string; // Gemini thought_signature，用于多轮上下文
  presetId?: string;
}

export interface AiChatSession {
  imageId: string;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
}

export interface NodeRevision {
  id: string;
  createdAt: string;
  source?: 'manual' | 'asset' | 'suggestion' | 'rollback';
  prompt: string;
  promptParts?: PromptPart[];
  /** @deprecated 产品决策：不再支持负面提示词。请勿在新功能中使用。 */
  negativePrompt?: string;
  count: number;
  imageSize: '1K' | '2K' | '4K';
  aspectRatio: 'auto' | string;
  notes?: string;
  tags?: string[];
}

export interface NodeData {
  id: string;
  canvasId: string;
  type: 'txt2img';
  prompt: string;
  promptParts?: PromptPart[]; // 结构化提示词，支持图片交错
  /** @deprecated 产品决策：不再支持负面提示词。请勿在新功能中使用。 */
  negativePrompt?: string;
  referenceImageId?: string;
  generationBaseMode?: 'image' | 'prompt';
  archived?: boolean;
  collapsed?: boolean;
  batchId?: string;
  batchKind?: 'generate' | 'regenerate';
  batchAttempt?: number;

  // Gemini image config
  count: number;
  imageSize: '1K' | '2K' | '4K';
  aspectRatio: 'auto' | string;
  modelName: string;

  status: "idle" | "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunDurationMs?: number;
  errorMessage?: string;

  // Display
  images: ImageMeta[];
  tags?: string[];
  favorite?: boolean;
  notes?: string;
  revisions?: NodeRevision[];
  promptAnalysis?: AnalysisRecord;
  imageAnalyses?: Record<string, AnalysisRecord>;
  aiChats?: Record<string, AiChatSession>; // 按 imageId 保存的 AI 对话记录
}

export interface AnalysisRecord {
  raw: string;
  parsed?: any;
  createdAt: string;
}

// React Flow Node wrapper
// We'll extend this from React Flow's Node type if needed, 
// but for our internal logic, this is the shape.
import { Node as ReactFlowNode } from 'reactflow';

export interface FlowNode extends ReactFlowNode<NodeData> {
  type: "generationNode";
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

export interface ImageMeta {
  id: string;
  nodeId: string;
  jobId: string;
  url: string;
  createdAt: string;
  isFavorite: boolean;
  rating?: number; // 1-5
  tags?: string[];
  aiCaption?: string;
  aiOverallScore?: number; // 0-100
  aiAestheticScore?: number; // 0-100
  aiPromptAlignmentScore?: number; // 0-100
  meta?: Record<string, any>;
}

export interface PromptAsset {
  id: string;
  title?: string;
  prompt: string;
  /** @deprecated 产品决策：不再支持负面提示词。请勿在新功能中使用。 */
  negativePrompt?: string;
  tags?: string[];
  notes?: string;
  isFavorite?: boolean;
  usageCount?: number;
  lastUsedAt?: string;
  aiQualityScore?: number; // 0-100
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
  sourceNodeId?: string;
  sourceProjectId?: string;
  sourceCanvasId?: string;
}

export interface ApiSettings {
  provider: 'openai' | 'gemini';
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultWidth: number;
  defaultHeight: number;
  imageCount: number;
  /**
   * When true, UI will gracefully fall back到占位图而不是直接报错，
   * 方便在还没有配置密钥时体验流程。
   */
  allowMockWhenNoKey: boolean;
}

export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;
  cfgScale?: number;
  seed?: number | null;
  model?: string;
  count?: number;
  nodeId?: string;
}

export interface Job {
  id: string;
  nodeId: string;
  status: "queued" | "running" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Canvas {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
