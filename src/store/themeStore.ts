import { create } from 'zustand';

type Theme = 'light' | 'dark';

// 预设主题色
export const ACCENT_COLORS = [
  { id: 'violet', name: '紫罗兰', hsl: '262 83% 58%', color: '#8b5cf6' },
  { id: 'blue', name: '天空蓝', hsl: '217 91% 60%', color: '#3b82f6' },
  { id: 'cyan', name: '青碧', hsl: '192 91% 45%', color: '#06b6d4' },
  { id: 'emerald', name: '翡翠绿', hsl: '160 84% 39%', color: '#10b981' },
  { id: 'amber', name: '琥珀橙', hsl: '38 92% 50%', color: '#f59e0b' },
  { id: 'rose', name: '玫瑰红', hsl: '350 89% 60%', color: '#f43f5e' },
  { id: 'pink', name: '樱花粉', hsl: '330 81% 60%', color: '#ec4899' },
  { id: 'slate', name: '石板灰', hsl: '215 16% 47%', color: '#64748b' },
] as const;

export type AccentColorId = typeof ACCENT_COLORS[number]['id'] | 'custom';

interface ThemeState {
  theme: Theme;
  accentColor: AccentColorId;
  customAccentColor: string;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColorId) => void;
  setCustomAccentColor: (hex: string) => void;
}

const THEME_STORAGE_KEY = 'photopro:theme';
const ACCENT_STORAGE_KEY = 'photopro:accent-color';
const CUSTOM_ACCENT_STORAGE_KEY = 'photopro:custom-accent-color';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'light';
};

const getInitialAccentColor = (): AccentColorId => {
  if (typeof window === 'undefined') return 'violet';
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored === 'custom') return 'custom';
    if (stored && ACCENT_COLORS.some(c => c.id === stored)) {
      return stored as AccentColorId;
    }
  } catch {
    // ignore
  }
  return 'violet';
};

const normalizeHex = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
};

const hexToHsl = (hex: string) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const hRounded = Math.round(h);
  const sRounded = Math.round(s * 100);
  const lRounded = Math.round(l * 100);
  return `${hRounded} ${sRounded}% ${lRounded}%`;
};

const getInitialCustomAccentColor = () => {
  if (typeof window === 'undefined') return '#8b5cf6';
  try {
    const stored = localStorage.getItem(CUSTOM_ACCENT_STORAGE_KEY);
    const normalized = stored ? normalizeHex(stored) : null;
    if (normalized) return normalized;
  } catch {
    // ignore
  }
  return '#8b5cf6';
};

const applyTheme = (theme: Theme) => {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
};

const applyAccentColor = (colorId: AccentColorId, customHex?: string) => {
  if (typeof window === 'undefined') return;

  let hsl: string | null = null;
  if (colorId === 'custom') {
    hsl = customHex ? hexToHsl(customHex) : null;
  } else {
    const color = ACCENT_COLORS.find(c => c.id === colorId);
    hsl = color?.hsl || null;
  }
  if (!hsl) return;

  const root = document.documentElement;
  root.style.setProperty('--primary', hsl);
  root.style.setProperty('--accent', hsl);
  root.style.setProperty('--ring', hsl);
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  accentColor: getInitialAccentColor(),
  customAccentColor: getInitialCustomAccentColor(),
  setTheme: (theme: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    applyTheme(theme);
    set({ theme });
  },
  setAccentColor: (colorId: AccentColorId) => {
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, colorId);
    } catch {
      // ignore
    }
    applyAccentColor(colorId, get().customAccentColor);
    set({ accentColor: colorId });
  },
  setCustomAccentColor: (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    try {
      localStorage.setItem(CUSTOM_ACCENT_STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
    if (get().accentColor === 'custom') {
      applyAccentColor('custom', normalized);
    }
    set({ customAccentColor: normalized });
  },
}));

// 初始化主题和主题色
if (typeof window !== 'undefined') {
  const initialTheme = getInitialTheme();
  const initialAccent = getInitialAccentColor();
  const initialCustomAccent = getInitialCustomAccentColor();
  applyTheme(initialTheme);
  applyAccentColor(initialAccent, initialCustomAccent);
}
