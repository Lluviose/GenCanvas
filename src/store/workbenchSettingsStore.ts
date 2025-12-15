import { create } from 'zustand';

export type WorkbenchApiFormat = 'gemini' | 'openai';

type SafetySettingValue = 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE' | 'OFF';

export interface WorkbenchSettings {
  apiFormat: WorkbenchApiFormat;

  baseUrl: string;
  apiVersion: string;
  model: string;
  apiKey: string;

  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;

  analysis: {
    baseUrl: string;
    apiVersion: string;
    model: string;
    apiKey: string;
  };

  enableGoogleSearch: boolean;
  enableSafetySettings: boolean;
  safetySettings: Record<string, SafetySettingValue>;

  imageConfig: {
    aspectRatio: string;
    imageSize: string;
  };
}

const STORAGE_KEY = 'photopro:workbench-settings';

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  apiFormat: 'gemini',

  baseUrl: 'https://generativelanguage.googleapis.com',
  apiVersion: 'v1beta',
  model: 'gemini-3-pro-image-preview',
  apiKey: '',

  openaiBaseUrl: 'https://api.openai.com',
  openaiModel: 'gpt-4o-mini',
  openaiApiKey: '',

  analysis: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    model: 'gemini-2.0-flash',
    apiKey: '',
  },

  enableGoogleSearch: false,
  enableSafetySettings: true,
  safetySettings: {
    HARM_CATEGORY_HARASSMENT: 'BLOCK_NONE',
    HARM_CATEGORY_HATE_SPEECH: 'BLOCK_NONE',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'BLOCK_NONE',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'BLOCK_NONE',
    HARM_CATEGORY_CIVIC_INTEGRITY: 'BLOCK_NONE',
  },

  imageConfig: {
    aspectRatio: 'auto',
    imageSize: '2K',
  },
};

const safeParse = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const loadFromStorage = (): WorkbenchSettings | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      ...DEFAULT_WORKBENCH_SETTINGS,
      ...parsed,
      analysis: {
        ...DEFAULT_WORKBENCH_SETTINGS.analysis,
        ...(parsed.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : {}),
      },
      safetySettings: {
        ...DEFAULT_WORKBENCH_SETTINGS.safetySettings,
        ...(parsed.safetySettings && typeof parsed.safetySettings === 'object' ? parsed.safetySettings : {}),
      },
      imageConfig: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageConfig,
        ...(parsed.imageConfig && typeof parsed.imageConfig === 'object' ? parsed.imageConfig : {}),
      },
    } as WorkbenchSettings;
  } catch {
    return null;
  }
};

const persistToStorage = (settings: WorkbenchSettings) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
};

type WorkbenchSettingsState = {
  settings: WorkbenchSettings;
  updateSettings: (partial: Partial<WorkbenchSettings>) => void;
  resetSettings: () => void;
};

export const useWorkbenchSettingsStore = create<WorkbenchSettingsState>((set) => ({
  settings: loadFromStorage() || DEFAULT_WORKBENCH_SETTINGS,
  updateSettings: (partial) =>
    set((state) => {
      const next = {
        ...state.settings,
        ...partial,
        analysis: {
          ...state.settings.analysis,
          ...(partial.analysis || {}),
        },
        safetySettings: {
          ...state.settings.safetySettings,
          ...(partial.safetySettings || {}),
        },
        imageConfig: {
          ...state.settings.imageConfig,
          ...(partial.imageConfig || {}),
        },
      };
      persistToStorage(next);
      return { settings: next };
    }),
  resetSettings: () => {
    persistToStorage(DEFAULT_WORKBENCH_SETTINGS);
    set({ settings: DEFAULT_WORKBENCH_SETTINGS });
  },
}));

export const getWorkbenchSettings = () => useWorkbenchSettingsStore.getState().settings;
