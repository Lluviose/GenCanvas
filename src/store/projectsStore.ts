import { create } from 'zustand';
import type { Project } from '@/types';

const STORAGE_KEY = 'photopro:projects';

const DEFAULT_PROJECTS: Project[] = [];

type ProjectsState = {
  projects: Project[];
  addProject: (payload: Pick<Project, 'name' | 'description'>) => Project;
  updateProject: (id: string, payload: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  hydrate: () => void;
};

const loadFromStorage = (): Project[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : null;
  } catch (error) {
    console.warn('读取项目列表失败，将使用空列表', error);
    return null;
  }
};

const persistToStorage = (projects: Project[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.warn('保存项目列表失败', error);
  }
};

const cleanupProjectStorage = (projectId: string) => {
  if (typeof window === 'undefined') return;

  const prefix = `photopro:canvas-state:${projectId}:`;
  const canvasesKey = `photopro:canvases:${projectId}`;

  try {
    localStorage.removeItem(canvasesKey);
  } catch {
    // ignore
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem('photopro:last-canvas');
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      const lastProjectId = String(parsed?.projectId || '').trim();
      if (lastProjectId === projectId) localStorage.removeItem('photopro:last-canvas');
    }
  } catch {
    // ignore
  }
};

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: loadFromStorage() || DEFAULT_PROJECTS,

  addProject: ({ name, description }) => {
    const now = new Date().toISOString();
    const newProject: Project = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({ projects: [newProject, ...state.projects] }));
    return newProject;
  },

  updateProject: (id, payload) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              ...payload,
              updatedAt: new Date().toISOString(),
            }
          : p
      ),
    }));
  },

  deleteProject: (id) => {
    cleanupProjectStorage(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  hydrate: () => {
    const snapshot = loadFromStorage();
    if (snapshot) set({ projects: snapshot });
  },
}));

if (typeof window !== 'undefined') {
  useProjectsStore.subscribe((state) => {
    persistToStorage(state.projects);
  });
}
