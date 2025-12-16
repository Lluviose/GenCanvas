import { create } from 'zustand';

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = 'auto' | string;
export type ContinueFromImageMode = 'image_only' | 'multi_turn';
export type CanvasGenerateDirection = 'down' | 'right';
export type GenerationBaseMode = 'image' | 'prompt';

export type QuickBranchPreset = {
  label: string;
  value: string;
};

export type AiChatPreset = {
  id: string;
  title: string;
  prompt: string;
};

export interface WorkbenchPreferences {
  defaultCount: number;
  defaultImageSize: ImageSize;
  defaultAspectRatio: AspectRatio;
  quickBranchPresets: QuickBranchPreset[];
  continueFromImageMode: ContinueFromImageMode;
  continueHistoryNodes: number;

  // Canvas
  canvasGenerateDirection: CanvasGenerateDirection;
  defaultGenerationBaseMode: GenerationBaseMode;
  canvasCollapsedPreviewImages: boolean;
  canvasCollapsedPreviewDepth: number;
  canvasVisibleLatestLevels: number;

  // AI features
  aiAutoAnalyzeAfterGenerate: boolean;
  aiAutoTagPromptAssets: boolean;
  aiPromptHighQualityThreshold: number;
  aiImageHighQualityThreshold: number;
  aiChatIncludeHistory: boolean;
  aiChatMaxMessages: number;
  aiChatSystemPrompt: string;
  aiChatPresets: AiChatPreset[];
  aiImageAnalysisPrompt: string;
}

const STORAGE_KEY = 'photopro:workbench-preferences';

const DEFAULT_QUICK_BRANCH_PRESETS: QuickBranchPreset[] = [
  { label: '插画风', value: 'illustration style, anime aesthetic' },
  { label: '写实风', value: 'photorealistic, hyperrealistic' },
  { label: '特写', value: 'close-up shot, detailed face' },
  { label: '远景', value: 'wide shot, landscape view' },
  { label: '雨夜', value: 'rainy night, neon lights, wet streets' },
  { label: '金色阳光', value: 'golden hour, warm sunlight' },
  { label: '赛博朋克', value: 'cyberpunk style, neon, futuristic' },
  { label: '水彩', value: 'watercolor painting style' },
];

const DEFAULT_PREFS: WorkbenchPreferences = {
  defaultCount: 4,
  defaultImageSize: '2K',
  defaultAspectRatio: 'auto',
  quickBranchPresets: DEFAULT_QUICK_BRANCH_PRESETS,
  continueFromImageMode: 'image_only',
  continueHistoryNodes: 6,

  canvasGenerateDirection: 'down',
  defaultGenerationBaseMode: 'image',
  canvasCollapsedPreviewImages: true,
  canvasCollapsedPreviewDepth: 3,
  canvasVisibleLatestLevels: 0,

  aiAutoAnalyzeAfterGenerate: true,
  aiAutoTagPromptAssets: true,
  aiPromptHighQualityThreshold: 80,
  aiImageHighQualityThreshold: 80,
  aiChatIncludeHistory: true,
  aiChatMaxMessages: 24,
  aiChatSystemPrompt:
    '你是一个面向“文生图创作”的 AI 助手。请用中文回答，重点给出可执行的改进建议与可直接用于继续生成的提示词。',
  aiChatPresets: [
    {
      id: 'img_fix',
      title: '找问题 + 改进提示词',
      prompt:
        '请结合当前图片与（可选）节点提示词，指出 3-5 个最主要的问题（构图/主体/风格/光线/质感/细节/一致性/背景/文字等），并给出可操作的改进建议。最后给出一份可直接用于继续生成/编辑的「改进后提示词」（中文为主，可夹英文关键词），不要输出负面提示词。\n\n输出格式：\n1) 问题\n2) 建议\n3) 改进后提示词：<一段完整提示词>',
    },
    {
      id: 'img_reverse_prompt',
      title: '反推提示词（重建 Prompt）',
      prompt:
        '请根据当前图片，反推一份可复现该风格与构图的提示词（尽量具体：主体/风格/镜头/光线/材质/色调/背景/构图），输出一段完整 prompt。',
    },
    {
      id: 'img_variations',
      title: '给 5 个可控变体',
      prompt:
        '请基于当前图片，给出 5 条不同方向的可控变体（每条包含：变化目标 + 可直接追加的短 prompt），例如：特写/远景/写实/插画/雨夜等。',
    },
  ],
  aiImageAnalysisPrompt: '',
};

const loadFromStorage = (): WorkbenchPreferences | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchPreferences>;
    const rawPresets = (parsed as any)?.quickBranchPresets;
    const quickBranchPresets = Array.isArray(rawPresets)
      ? rawPresets
          .map((it: any) => ({ label: String(it?.label || '').trim(), value: String(it?.value || '').trim() }))
          .filter((it: QuickBranchPreset) => it.label && it.value)
          .slice(0, 24)
      : DEFAULT_PREFS.quickBranchPresets;

    const continueFromImageMode: ContinueFromImageMode =
      (parsed as any)?.continueFromImageMode === 'multi_turn' ? 'multi_turn' : 'image_only';
    const continueHistoryNodesRaw = Number((parsed as any)?.continueHistoryNodes);
    const continueHistoryNodes = Number.isFinite(continueHistoryNodesRaw)
      ? Math.max(1, Math.min(12, continueHistoryNodesRaw))
      : DEFAULT_PREFS.continueHistoryNodes;

    const canvasGenerateDirection: CanvasGenerateDirection =
      (parsed as any)?.canvasGenerateDirection === 'right' ? 'right' : 'down';
    const defaultGenerationBaseMode: GenerationBaseMode =
      (parsed as any)?.defaultGenerationBaseMode === 'prompt' ? 'prompt' : 'image';
    const canvasCollapsedPreviewImages = (parsed as any)?.canvasCollapsedPreviewImages !== false;
    const canvasCollapsedPreviewDepthRaw = Number((parsed as any)?.canvasCollapsedPreviewDepth);
    const canvasCollapsedPreviewDepth = Number.isFinite(canvasCollapsedPreviewDepthRaw)
      ? Math.max(1, Math.min(6, canvasCollapsedPreviewDepthRaw))
      : DEFAULT_PREFS.canvasCollapsedPreviewDepth;
    const canvasVisibleLatestLevelsRaw = Number((parsed as any)?.canvasVisibleLatestLevels);
    const canvasVisibleLatestLevels = Number.isFinite(canvasVisibleLatestLevelsRaw)
      ? Math.max(0, Math.min(50, canvasVisibleLatestLevelsRaw))
      : DEFAULT_PREFS.canvasVisibleLatestLevels;

    const aiAutoAnalyzeAfterGenerate = (parsed as any)?.aiAutoAnalyzeAfterGenerate !== false;
    const aiAutoTagPromptAssets = (parsed as any)?.aiAutoTagPromptAssets !== false;
    const aiPromptHighQualityThresholdRaw = Number((parsed as any)?.aiPromptHighQualityThreshold);
    const aiPromptHighQualityThreshold = Number.isFinite(aiPromptHighQualityThresholdRaw)
      ? Math.max(0, Math.min(100, aiPromptHighQualityThresholdRaw))
      : DEFAULT_PREFS.aiPromptHighQualityThreshold;
    const aiImageHighQualityThresholdRaw = Number((parsed as any)?.aiImageHighQualityThreshold);
    const aiImageHighQualityThreshold = Number.isFinite(aiImageHighQualityThresholdRaw)
      ? Math.max(0, Math.min(100, aiImageHighQualityThresholdRaw))
      : DEFAULT_PREFS.aiImageHighQualityThreshold;

    const aiChatIncludeHistory = (parsed as any)?.aiChatIncludeHistory !== false;
    const aiChatMaxMessagesRaw = Number((parsed as any)?.aiChatMaxMessages);
    const aiChatMaxMessages = Number.isFinite(aiChatMaxMessagesRaw)
      ? Math.max(6, Math.min(80, aiChatMaxMessagesRaw))
      : DEFAULT_PREFS.aiChatMaxMessages;
    const aiChatSystemPromptRaw = (parsed as any)?.aiChatSystemPrompt;
    const aiChatSystemPrompt =
      typeof aiChatSystemPromptRaw === 'string' && aiChatSystemPromptRaw.trim()
        ? aiChatSystemPromptRaw.trim().slice(0, 2000)
        : DEFAULT_PREFS.aiChatSystemPrompt;

    const rawChatPresets = (parsed as any)?.aiChatPresets;
    const aiChatPresets = Array.isArray(rawChatPresets)
      ? rawChatPresets
          .map((it: any) => ({
            id: String(it?.id || '').trim(),
            title: String(it?.title || '').trim(),
            prompt: String(it?.prompt || '').trim(),
          }))
          .filter((it: AiChatPreset) => it.id && it.title && it.prompt)
          .slice(0, 24)
      : DEFAULT_PREFS.aiChatPresets;

    const aiImageAnalysisPromptRaw = (parsed as any)?.aiImageAnalysisPrompt;
    const aiImageAnalysisPrompt =
      typeof aiImageAnalysisPromptRaw === 'string'
        ? aiImageAnalysisPromptRaw.trim().slice(0, 4000)
        : DEFAULT_PREFS.aiImageAnalysisPrompt;

    return {
      ...DEFAULT_PREFS,
      ...parsed,
      quickBranchPresets,
      continueFromImageMode,
      continueHistoryNodes,
      canvasGenerateDirection,
      defaultGenerationBaseMode,
      canvasCollapsedPreviewImages,
      canvasCollapsedPreviewDepth,
      canvasVisibleLatestLevels,
      aiAutoAnalyzeAfterGenerate,
      aiAutoTagPromptAssets,
      aiPromptHighQualityThreshold,
      aiImageHighQualityThreshold,
      aiChatIncludeHistory,
      aiChatMaxMessages,
      aiChatSystemPrompt,
      aiChatPresets,
      aiImageAnalysisPrompt,
    };
  } catch {
    return null;
  }
};

const persistToStorage = (prefs: WorkbenchPreferences) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

type PreferencesState = {
  prefs: WorkbenchPreferences;
  updatePrefs: (partial: Partial<WorkbenchPreferences>) => void;
  resetPrefs: () => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  prefs: loadFromStorage() || DEFAULT_PREFS,
  updatePrefs: (partial) =>
    set((state) => {
      const next = { ...state.prefs, ...partial };
      persistToStorage(next);
      return { prefs: next };
    }),
  resetPrefs: () => {
    persistToStorage(DEFAULT_PREFS);
    set({ prefs: DEFAULT_PREFS });
  },
}));

export const getPreferences = () => usePreferencesStore.getState().prefs;
