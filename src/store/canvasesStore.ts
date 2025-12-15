import { create } from 'zustand';
import type { Canvas } from '@/types';

const buildCanvasesStorageKey = (projectId: string) => `photopro:canvases:${projectId}`;
const buildCanvasSnapshotKey = (projectId: string, canvasId: string) => `photopro:canvas-state:${projectId}:${canvasId}`;

const safeParseJson = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeCanvasList = (input: unknown, projectId: string): Canvas[] => {
  if (!Array.isArray(input)) return [];
  const now = new Date().toISOString();
  const list: Canvas[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const anyItem = item as any;
    const id = String(anyItem.id || '').trim();
    if (!id) continue;
    const name = String(anyItem.name || '').trim() || id;
    const createdAt = String(anyItem.createdAt || '').trim() || now;
    const updatedAt = String(anyItem.updatedAt || '').trim() || createdAt;
    list.push({
      id,
      projectId,
      name,
      description: typeof anyItem.description === 'string' ? anyItem.description : undefined,
      createdAt,
      updatedAt,
    });
  }
  return list;
};

const ensureDefaultCanvas = (projectId: string, canvases: Canvas[]): Canvas[] => {
  if (canvases.some((c) => c.id === 'default')) return canvases;
  const now = new Date().toISOString();
  return [
    {
      id: 'default',
      projectId,
      name: '默认画布',
      description: '项目的默认创作空间',
      createdAt: now,
      updatedAt: now,
    },
    ...canvases,
  ];
};

const loadProjectCanvases = (projectId: string): Canvas[] => {
  if (typeof window === 'undefined') return ensureDefaultCanvas(projectId, []);
  try {
    const raw = localStorage.getItem(buildCanvasesStorageKey(projectId));
    if (!raw) return ensureDefaultCanvas(projectId, []);
    const parsed = safeParseJson(raw);
    return ensureDefaultCanvas(projectId, normalizeCanvasList(parsed, projectId));
  } catch (error) {
    console.warn('读取画布列表失败，将使用默认画布', error);
    return ensureDefaultCanvas(projectId, []);
  }
};

const persistProjectCanvases = (projectId: string, canvases: Canvas[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(buildCanvasesStorageKey(projectId), JSON.stringify(canvases));
  } catch (error) {
    console.warn('保存画布列表失败', error);
  }
};

export type CanvasesState = {
  canvasesByProject: Record<string, Canvas[]>;
  hydrate: (projectId: string) => void;
  addCanvas: (projectId: string, payload: Pick<Canvas, 'name' | 'description'>) => Canvas;
  updateCanvas: (projectId: string, canvasId: string, payload: Partial<Canvas>) => void;
  deleteCanvas: (projectId: string, canvasId: string) => void;
  duplicateCanvas: (projectId: string, canvasId: string) => Canvas | null;
};

export const useCanvasesStore = create<CanvasesState>((set, get) => ({
  canvasesByProject: {},

  hydrate: (projectId) => {
    const list = loadProjectCanvases(projectId);
    set((state) => ({
      canvasesByProject: {
        ...state.canvasesByProject,
        [projectId]: list,
      },
    }));
  },

  addCanvas: (projectId, payload) => {
    const now = new Date().toISOString();
    const newCanvas: Canvas = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name: (payload.name || '').trim() || '未命名画布',
      description: (payload.description || '').trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const list = [...(get().canvasesByProject[projectId] || loadProjectCanvases(projectId)), newCanvas];
    persistProjectCanvases(projectId, list);

    set((state) => ({
      canvasesByProject: {
        ...state.canvasesByProject,
        [projectId]: list,
      },
    }));
    return newCanvas;
  },

  updateCanvas: (projectId, canvasId, payload) => {
    const current = get().canvasesByProject[projectId] || loadProjectCanvases(projectId);
    const now = new Date().toISOString();
    const next = current.map((c) =>
      c.id === canvasId
        ? {
            ...c,
            ...payload,
            name: typeof payload.name === 'string' ? payload.name.trim() : c.name,
            description: typeof payload.description === 'string' ? payload.description.trim() : c.description,
            updatedAt: now,
          }
        : c
    );
    persistProjectCanvases(projectId, next);
    set((state) => ({
      canvasesByProject: {
        ...state.canvasesByProject,
        [projectId]: next,
      },
    }));
  },

  deleteCanvas: (projectId, canvasId) => {
    const current = get().canvasesByProject[projectId] || loadProjectCanvases(projectId);
    if (current.length <= 1) return;
    if (canvasId === 'default') return;

    const next = ensureDefaultCanvas(
      projectId,
      current.filter((c) => c.id !== canvasId)
    );

    persistProjectCanvases(projectId, next);
    set((state) => ({
      canvasesByProject: {
        ...state.canvasesByProject,
        [projectId]: next,
      },
    }));

    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(buildCanvasSnapshotKey(projectId, canvasId));
    } catch {
      // ignore
    }

    try {
      const lastRaw = localStorage.getItem('photopro:last-canvas');
      const parsed = lastRaw ? safeParseJson(lastRaw) : null;
      if (parsed?.projectId === projectId && parsed?.canvasId === canvasId) {
        localStorage.removeItem('photopro:last-canvas');
      }
    } catch {
      // ignore
    }
  },

  duplicateCanvas: (projectId, canvasId) => {
    const current = get().canvasesByProject[projectId] || loadProjectCanvases(projectId);
    const source = current.find((c) => c.id === canvasId);
    if (!source) return null;

    const now = new Date().toISOString();
    const newCanvas: Canvas = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name: `${source.name} 副本`,
      description: source.description,
      createdAt: now,
      updatedAt: now,
    };

    const next = [...current, newCanvas];
    persistProjectCanvases(projectId, next);
    set((state) => ({
      canvasesByProject: {
        ...state.canvasesByProject,
        [projectId]: next,
      },
    }));

    if (typeof window === 'undefined') return newCanvas;

    try {
      const raw = localStorage.getItem(buildCanvasSnapshotKey(projectId, canvasId));
      if (raw) {
        const parsed = safeParseJson(raw) as any;
        if (parsed && Array.isArray(parsed.nodes)) {
          const cloned = {
            ...parsed,
            nodes: parsed.nodes.map((n: any) => ({
              ...n,
              data: {
                ...n?.data,
                canvasId: newCanvas.id,
              },
            })),
          };
          localStorage.setItem(buildCanvasSnapshotKey(projectId, newCanvas.id), JSON.stringify(cloned));
        }
      }
    } catch (error) {
      console.warn('复制画布快照失败', error);
    }

    return newCanvas;
  },
}));

