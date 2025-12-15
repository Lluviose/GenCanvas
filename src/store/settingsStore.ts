import { create } from 'zustand';
import { ApiSettings } from '@/types';

const STORAGE_KEY = 'photopro:api-settings';

const DEFAULT_SETTINGS: ApiSettings = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'dall-e-3',
  defaultWidth: 1024,
  defaultHeight: 1024,
  imageCount: 4,
  allowMockWhenNoKey: true,
};

type SettingsState = {
  settings: ApiSettings;
  updateSettings: (partial: Partial<ApiSettings>) => void;
  resetSettings: () => void;
};

const loadFromStorage = (): ApiSettings | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiSettings;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // 兼容旧版本缺少 provider 的情况
      provider: (parsed as any).provider || DEFAULT_SETTINGS.provider,
    };
  } catch (error) {
    console.warn('读取本地接口配置失败，使用默认配置。', error);
    return null;
  }
};

const persistToStorage = (settings: ApiSettings) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('保存接口配置失败', error);
  }
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadFromStorage() || DEFAULT_SETTINGS,
  updateSettings: (partial) =>
    set((state) => {
      const next = { ...state.settings, ...partial };
      persistToStorage(next);
      return { settings: next };
    }),
  resetSettings: () => {
    persistToStorage(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS });
  },
}));

// 便于非 React 环境（例如服务层）直接获取当前配置
export const getSettings = () => useSettingsStore.getState().settings;

