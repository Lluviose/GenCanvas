import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import type { Base64Image } from '@/types/media';
import type { WorkbenchHealth } from '@/types/workbench';
import type { GeminiContent } from '@/types/workbench';
import { ImageMeta, NodeData, NodeRevision, PromptAsset } from '@/types';
import { blobToBase64Image, toImageSrc } from '@/lib/imageProcessing';
import { hasEffectivePromptContent, hasPromptImages, normalizePromptParts } from '@/lib/promptParts';
import {
  saveImages as saveImagesToIndexedDB,
  parseDataUrl,
  createIndexedDBRef,
  isIndexedDBRef,
  resolveImageUrl,
  type StoredImage,
} from '@/services/imageStorage';
import {
  analyzeImage as analyzeImageApi,
  analyzePrompt as analyzePromptApi,
  chatAnalyze,
  generateWorkbench,
  getWorkbenchHealth,
} from '@/services/workbenchApi';
import { toast } from '@/components/ui/toast';
import { getPreferences } from './preferencesStore';

// Extend Node with our NodeData
export type AppNode = Node<NodeData>;

const CANVAS_STORAGE_PREFIX = 'photopro:canvas-state:';
const GALLERY_STORAGE_KEY = 'photopro:gallery-images';
const PROMPT_LIBRARY_KEY = 'photopro:prompt-library';
const MAX_NODE_REVISIONS = 30;

const buildCanvasStorageKey = (projectId: string, canvasId: string) =>
  `${CANVAS_STORAGE_PREFIX}${projectId || 'default'}:${canvasId || 'default'}`;

const loadCanvasSnapshot = (canvasStorageKey: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(canvasStorageKey);
    if (!raw) return null;
    return JSON.parse(raw) as Pick<CanvasState, 'nodes' | 'edges'>;
  } catch (error) {
    console.warn('读取画布缓存失败', error);
    return null;
  }
};

const persistCanvasSnapshot = (canvasStorageKey: string, snapshot: Pick<CanvasState, 'nodes' | 'edges'>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(canvasStorageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('保存画布缓存失败', error);
  }
};

const loadGalleryImages = (): ImageMeta[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImageMeta[]) : [];
  } catch (error) {
    console.warn('读取图库缓存失败', error);
    return [];
  }
};

const persistGalleryImages = (images: ImageMeta[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(images));
  } catch (error) {
    console.warn('保存图库缓存失败', error);
  }
};

const loadPromptLibrary = (): PromptAsset[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROMPT_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PromptAsset[]) : [];
  } catch (error) {
    console.warn('读取提示词库缓存失败', error);
    return [];
  }
};

const persistPromptLibrary = (items: PromptAsset[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('保存提示词库缓存失败', error);
  }
};

const toBase64ImageFromUrl = async (url: string): Promise<Base64Image> => {
  if (url.startsWith('data:')) {
    const [meta, data] = url.split(',');
    const mimeMatch = meta.match(/^data:(.*?);base64$/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    return { mimeType, data: data || '' };
  }
  // Handle IndexedDB references
  if (isIndexedDBRef(url)) {
    const resolvedUrl = await resolveImageUrl(url);
    if (resolvedUrl && resolvedUrl.startsWith('data:')) {
      const [meta, data] = resolvedUrl.split(',');
      const mimeMatch = meta.match(/^data:(.*?);base64$/);
      const mimeType = mimeMatch?.[1] || 'image/png';
      return { mimeType, data: data || '' };
    }
    throw new Error('无法从 IndexedDB 读取图片');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('无法读取图片内容');
  const blob = await res.blob();
  return blobToBase64Image(blob);
};

const normalizeTags = (input: any): string[] => {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,\uFF0C]/g)
      : [];
  return raw
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 30);
};

const arePromptPartsEqual = (a?: NodeData['promptParts'], b?: NodeData['promptParts']) => {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const pa = aa[i] as any;
    const pb = bb[i] as any;
    if (pa?.type !== pb?.type) return false;
    if (pa?.type === 'text') {
      if (String(pa?.text ?? '') !== String(pb?.text ?? '')) return false;
      continue;
    }
    if (pa?.type === 'image') {
      if (String(pa?.id ?? '') !== String(pb?.id ?? '')) return false;
      if (String(pa?.mimeType ?? '') !== String(pb?.mimeType ?? '')) return false;
      if (String(pa?.data ?? '') !== String(pb?.data ?? '')) return false;
      if (String(pa?.annotation ?? '') !== String(pb?.annotation ?? '')) return false;
      continue;
    }
    return false;
  }
  return true;
};

const mergeTags = (base?: string[], extra?: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...(base || []), ...(extra || [])]) {
    const v = String(t || '').trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

const toScore = (value: any): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined;
};

interface CanvasState {
  activeCanvasKey: string | null;
  workbenchHealth: WorkbenchHealth | null;

  nodes: AppNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  galleryImages: ImageMeta[];
  promptLibrary: PromptAsset[];
  
  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  refreshWorkbenchHealth: () => Promise<void>;
  addNode: (node: AppNode) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  commitNodeEdit: (id: string, patch: Partial<NodeData>, options?: { source?: NodeRevision['source'] }) => void;
  restoreNodeRevision: (id: string, revisionId: string, options?: { autoGenerate?: boolean }) => void;
  setSelectedNodeId: (id: string | null) => void;
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  clearSelection: () => void;
  selectOnlyNode: (id: string) => void;
  removeNode: (id: string) => void;
  clearFailedNodes: () => void;
  duplicateNode: (id: string) => void;
  branchNode: (id: string, overrides?: Partial<NodeData>) => string | null;
  continueFromNode: (id: string, overrides?: Partial<NodeData>) => Promise<string | null>;
  continueFromImage: (
    nodeId: string,
    imageId: string,
    overrides?: Partial<NodeData>,
    options?: { mode?: 'image_only' | 'multi_turn'; historyNodes?: number }
  ) => Promise<string | null>;
  generateFromNode: (
    nodeId: string,
    options?: { mode?: 'append' | 'regenerate'; overrides?: Partial<NodeData>; silent?: boolean; select?: boolean }
  ) => Promise<string[] | null>;
  generateNodes: (ids: string[], options?: { concurrency?: number }) => Promise<void>;
  addImagesToGallery: (images: ImageMeta[]) => void;
  toggleFavoriteImage: (id: string) => void;
  toggleFavoriteNode: (id: string) => void;
  savePromptToLibrary: (nodeId: string) => void;
  createPromptAsset: (
    input: Pick<PromptAsset, 'prompt'> & Partial<Omit<PromptAsset, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
  updatePromptAsset: (assetId: string, patch: Partial<Omit<PromptAsset, 'id' | 'createdAt'>>) => void;
  deletePromptAsset: (assetId: string) => void;
  toggleFavoritePromptAsset: (assetId: string) => void;
  autoTagPromptAsset: (assetId: string, options?: { silent?: boolean }) => Promise<void>;
  autoTagGalleryImage: (imageId: string, options?: { silent?: boolean }) => Promise<void>;
  applyPromptAssetToNode: (assetId: string, nodeId: string) => void;
  hydrate: (projectId: string, canvasId: string) => void;
  generateNode: (
    id: string,
    overrides?: Partial<NodeData>,
    options?: { silent?: boolean; inputImage?: Base64Image; autoAnalyze?: boolean; contents?: GeminiContent[] }
  ) => Promise<void>;
  clearAiChat: (nodeId: string, imageId: string) => void;
  sendAiChatMessage: (
    nodeId: string,
    imageId: string,
    text: string,
    options?: { includeHistory?: boolean; presetId?: string }
  ) => Promise<void>;
  analyzeNodePrompt: (id: string, options?: { silent?: boolean }) => Promise<void>;
  analyzeNodeImage: (nodeId: string, imageId: string, options?: { silent?: boolean }) => Promise<void>;
}

const DEFAULT_MODEL_NAME = 'gemini-3-pro-image-preview';

const createStarterNode = (canvasId: string, modelName?: string): AppNode => {
  const prefs = getPreferences();
  const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  return {
    id: nodeId,
    type: 'generationNode',
    position: { x: 120, y: 120 },
    data: {
      id: nodeId,
      canvasId,
      type: 'txt2img',
      prompt: '',
      count: prefs.defaultCount,
      imageSize: prefs.defaultImageSize,
      aspectRatio: prefs.defaultAspectRatio,
      modelName: modelName || DEFAULT_MODEL_NAME,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      images: [],
    },
  };
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  activeCanvasKey: null,
  workbenchHealth: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  galleryImages: loadGalleryImages(),
  promptLibrary: loadPromptLibrary(),

  onNodesChange: (changes: NodeChange[]) => {
    const nextNodes = applyNodeChanges(changes, get().nodes) as AppNode[];
    const selected = nextNodes.filter((n) => n.selected);
    const currentSelectedId = get().selectedNodeId;

    let nextSelectedId: string | null = currentSelectedId;
    if (selected.length === 0) {
      nextSelectedId = null;
    } else if (selected.length === 1) {
      nextSelectedId = selected[0]?.id || null;
    } else if (!nextSelectedId || !selected.some((n) => n.id === nextSelectedId)) {
      nextSelectedId = selected[0]?.id || null;
    }

    set({
      nodes: nextNodes,
      selectedNodeId: nextSelectedId,
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },

  refreshWorkbenchHealth: async () => {
    try {
      const health = await getWorkbenchHealth();
      set((state) => ({
        workbenchHealth: health,
        nodes: state.nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            modelName: health?.generation?.model || n.data.modelName,
          },
        })),
      }));
    } catch (error: any) {
      console.warn('Workbench health failed', error);
    }
  },

  addNode: (node: AppNode) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },

  updateNodeData: (id: string, data: Partial<NodeData>) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
            },
          };
        }
        return node;
      }),
    }));
  },

  commitNodeEdit: (id: string, patch: Partial<NodeData>, options?: { source?: NodeRevision['source'] }) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;

    const current = node.data;
    const now = new Date().toISOString();

    const nextPrompt = patch.prompt !== undefined ? String(patch.prompt ?? '') : current.prompt;
    const hasPromptPartsField = Object.prototype.hasOwnProperty.call(patch, 'promptParts');
    const nextPromptPartsRaw = hasPromptPartsField ? patch.promptParts : current.promptParts;
    const normalizedParts = Array.isArray(nextPromptPartsRaw) ? normalizePromptParts(nextPromptPartsRaw) : undefined;
    const nextPromptParts = hasPromptImages(normalizedParts) ? normalizedParts : undefined;
    const nextCount =
      patch.count !== undefined
        ? Math.max(1, Math.min(8, Number(patch.count) || 1))
        : Math.max(1, Math.min(8, Number(current.count) || 1));
    const nextImageSize = (patch.imageSize || current.imageSize || '2K') as NodeData['imageSize'];
    const nextAspectRatio = (patch.aspectRatio || current.aspectRatio || 'auto') as NodeData['aspectRatio'];

    const shouldRecordRevision =
      nextPrompt !== current.prompt ||
      !arePromptPartsEqual(nextPromptParts, current.promptParts) ||
      nextCount !== current.count ||
      nextImageSize !== current.imageSize ||
      nextAspectRatio !== current.aspectRatio;

    const revision: NodeRevision | null = shouldRecordRevision
      ? {
          id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          source: options?.source || 'manual',
          prompt: current.prompt,
          promptParts: current.promptParts,
          count: current.count,
          imageSize: current.imageSize,
          aspectRatio: current.aspectRatio,
        }
      : null;

    const normalizedPatch: Partial<NodeData> = {};
    if (patch.prompt !== undefined && nextPrompt !== current.prompt) normalizedPatch.prompt = nextPrompt;
    if (hasPromptPartsField && !arePromptPartsEqual(nextPromptParts, current.promptParts)) {
      normalizedPatch.promptParts = nextPromptParts;
    }
    if (patch.count !== undefined && nextCount !== current.count) normalizedPatch.count = nextCount;
    if (patch.imageSize !== undefined && nextImageSize !== current.imageSize) normalizedPatch.imageSize = nextImageSize;
    if (patch.aspectRatio !== undefined && nextAspectRatio !== current.aspectRatio) {
      normalizedPatch.aspectRatio = nextAspectRatio;
    }
    if (patch.notes !== undefined) {
      const nextNotes = String(patch.notes ?? '');
      const currentNotes = String(current.notes ?? '');
      if (nextNotes !== currentNotes) normalizedPatch.notes = nextNotes;
    }
    if (patch.tags !== undefined) {
      const nextTags = normalizeTags(patch.tags);
      const currentTags = normalizeTags(current.tags);
      const same =
        nextTags.length === currentTags.length && nextTags.every((t, i) => t === currentTags[i]);
      if (!same) normalizedPatch.tags = nextTags;
    }

    const hasAnyPatchField = Object.keys(normalizedPatch).length > 0;
    if (!revision && !hasAnyPatchField) return;

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== id) return n;
        const existing = Array.isArray(n.data.revisions) ? n.data.revisions : [];
        const nextRevisions = revision ? [revision, ...existing].slice(0, MAX_NODE_REVISIONS) : existing;
        return {
          ...n,
          data: {
            ...n.data,
            ...normalizedPatch,
            revisions: nextRevisions.length ? nextRevisions : undefined,
            updatedAt: now,
          },
        };
      }),
    }));
  },

  restoreNodeRevision: (id: string, revisionId: string, options?: { autoGenerate?: boolean }) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    const revisions = node.data.revisions || [];
    const target = revisions.find((r) => r.id === revisionId) || null;
    if (!target) {
      toast.error('未找到该历史版本');
      return;
    }

    get().commitNodeEdit(
      id,
      {
        prompt: target.prompt,
        promptParts: target.promptParts,
        count: target.count,
        imageSize: target.imageSize,
        aspectRatio: target.aspectRatio,
      },
      { source: 'rollback' }
    );

    if (options?.autoGenerate) {
      void get().continueFromNode(id);
    }
  },

  removeNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  clearFailedNodes: () => {
    const failedIds = get()
      .nodes.filter((n) => n.data.status === 'failed')
      .map((n) => n.id);
    if (failedIds.length === 0) {
      toast.info('没有失败节点');
      return;
    }

    const failedSet = new Set(failedIds);
    set((state) => {
      const remainingNodes = state.nodes.filter((n) => !failedSet.has(n.id));
      const remainingEdges = state.edges.filter((e) => !failedSet.has(e.source) && !failedSet.has(e.target));

      let nextSelectedId = state.selectedNodeId;
      if (nextSelectedId && failedSet.has(nextSelectedId)) {
        nextSelectedId = remainingNodes[0]?.id || null;
      }

      return {
        nodes: remainingNodes.map((n) => ({ ...n, selected: nextSelectedId ? n.id === nextSelectedId : false })),
        edges: remainingEdges,
        selectedNodeId: nextSelectedId,
      };
    });

    toast.success(`已清除失败节点 ${failedIds.length} 个`);
  },

  duplicateNode: (id: string) => {
    const source = get().nodes.find((n) => n.id === id);
    if (!source) return;
    const newId = `${id}_copy_${Date.now()}`;
    const offsetPosition = {
      x: source.position.x + 60,
      y: source.position.y + 60,
    };

    const newNode: AppNode = {
      ...source,
      id: newId,
      position: offsetPosition,
      data: {
        ...source.data,
        id: newId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'idle',
        images: [],
        revisions: undefined,
        promptAnalysis: undefined,
        imageAnalyses: undefined,
        errorMessage: undefined,
        lastRunAt: undefined,
        lastRunDurationMs: undefined,
      },
      selected: false,
    };

    set((state) => ({
      nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }],
      selectedNodeId: newId,
    }));
  },

  branchNode: (id: string, overrides?: Partial<NodeData>) => {
    const snapshot = get();
    const source = snapshot.nodes.find((n) => n.id === id);
    if (!source) return null;

    if (source.data.collapsed) {
      set((prev) => ({
        nodes: prev.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  collapsed: false,
                },
              }
            : n
        ),
      }));
    }

    const prefs = getPreferences();
    const direction = prefs.canvasGenerateDirection || 'down';

    const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n] as const));
    const siblingCount = snapshot.edges
      .filter((e) => e.source === id)
      .map((e) => nodesById.get(e.target))
      .filter(Boolean)
      .filter((n) => !n!.data.archived).length;
    const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const gap = 360;
    const offsetPosition =
      direction === 'right'
        ? { x: source.position.x + gap, y: source.position.y + siblingCount * gap }
        : { x: source.position.x + siblingCount * gap, y: source.position.y + gap };

    const newNode: AppNode = {
      ...source,
      id: newId,
      position: offsetPosition,
      data: {
        ...source.data,
        ...(overrides || {}),
        id: newId,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
        images: [],
        favorite: false,
        tags: overrides?.tags !== undefined ? normalizeTags(overrides.tags) : undefined,
        notes:
          overrides?.notes !== undefined && String(overrides.notes || '').trim()
            ? String(overrides.notes || '').trim()
            : undefined,
        revisions: undefined,
        promptAnalysis: undefined,
        imageAnalyses: undefined,
        errorMessage: undefined,
        lastRunAt: undefined,
        lastRunDurationMs: undefined,
      },
      selected: false,
    };

    const edgeId = `e_${id}_${newId}_${Date.now()}`;

    set((state) => ({
      nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }],
      edges: [
        ...state.edges,
        {
          id: edgeId,
          source: id,
          target: newId,
          type: 'smoothstep',
          animated: true,
        },
      ],
      selectedNodeId: newId,
    }));

    return newId;
  },

  continueFromNode: async (id: string, overrides?: Partial<NodeData>) => {
    const newIds = await get().generateFromNode(id, { mode: 'append', overrides });
    return newIds?.[0] || null;
  },

  continueFromImage: async (
    nodeId: string,
    imageId: string,
    overrides?: Partial<NodeData>,
    options?: { mode?: 'image_only' | 'multi_turn'; historyNodes?: number }
  ) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const target =
      node.data.images?.find((img) => img.id === imageId) ||
      state.galleryImages.find((img) => img.id === imageId) ||
      null;
    if (!target?.url) {
      toast.error('未找到参考图片');
      return null;
    }

    const mode = options?.mode || 'image_only';
    const historyNodesRaw = Number(options?.historyNodes ?? 6) || 6;
    const historyNodes = Math.max(1, Math.min(12, historyNodesRaw));

    let inputImage: Base64Image | undefined = undefined;
    if (mode === 'image_only') {
      try {
        inputImage = await toBase64ImageFromUrl(target.url);
      } catch (error: any) {
        toast.error(error?.message || '无法读取图片内容');
        return null;
      }
    }

    const newId = state.branchNode(nodeId, { ...(overrides || {}), referenceImageId: imageId } as Partial<NodeData>);
    if (!newId) return null;

    if (mode === 'multi_turn') {
      const snapshot = get();
      const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n] as const));
      const parentByTarget = new Map(snapshot.edges.map((e) => [e.target, e.source] as const));

      const buildPromptPartsToGeminiParts = (prompt: string, promptParts?: NodeData['promptParts']) => {
        const parts: any[] = [];
        const structured = Array.isArray(promptParts) ? promptParts : [];
        if (structured.length > 0) {
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
        } else {
          const text = String(prompt ?? '');
          if (text) parts.push({ text });
        }
        return parts;
      };

      const getThoughtSignature = (img: ImageMeta) => {
        const meta = img?.meta as any;
        const sig =
          typeof meta?.thoughtSignature === 'string'
            ? meta.thoughtSignature
            : typeof meta?.thought_signature === 'string'
              ? meta.thought_signature
              : undefined;
        return sig ? String(sig) : undefined;
      };

      const getThoughtTextSignature = (img: ImageMeta) => {
        const meta = img?.meta as any;
        const sig =
          typeof meta?.thoughtTextSignature === 'string'
            ? meta.thoughtTextSignature
            : typeof meta?.thought_text_signature === 'string'
              ? meta.thought_text_signature
              : undefined;
        return sig ? String(sig) : undefined;
      };

      const getThoughtText = (img: ImageMeta) => {
        const meta = img?.meta as any;
        const text =
          typeof meta?.thoughtText === 'string'
            ? meta.thoughtText
            : typeof meta?.thought_text === 'string'
              ? meta.thought_text
              : undefined;
        const cleaned = typeof text === 'string' ? text.trim() : '';
        return cleaned ? cleaned : undefined;
      };

      const findImageById = (owner: AppNode, id: string) =>
        owner.data.images?.find((img) => img.id === id) || snapshot.galleryImages.find((img) => img.id === id) || null;

      const base64Cache = new Map<string, Promise<Base64Image>>();
      const getBase64 = (url: string) => {
        const key = String(url || '');
        if (!base64Cache.has(key)) base64Cache.set(key, toBase64ImageFromUrl(key));
        return base64Cache.get(key)!;
      };

      const chain: AppNode[] = [];
      let cursor: string | null = nodeId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const n = nodesById.get(cursor);
        if (!n) break;
        chain.unshift(n);
        cursor = parentByTarget.get(cursor) || null;
      }

      const trimmedChain = chain.length > historyNodes ? chain.slice(chain.length - historyNodes) : chain;
      const contents: GeminiContent[] = [];

      for (let idx = 0; idx < trimmedChain.length; idx++) {
        const n = trimmedChain[idx];
        const userParts = buildPromptPartsToGeminiParts(String(n.data.prompt || ''), n.data.promptParts);
        if (userParts.length > 0) contents.push({ role: 'user', parts: userParts } as any);

        const selectedOutputImageId =
          idx === trimmedChain.length - 1 ? imageId : String(trimmedChain[idx + 1]?.data?.referenceImageId || '').trim();
        if (!selectedOutputImageId) continue;

        const imageMeta = findImageById(n, selectedOutputImageId);
        if (!imageMeta?.url) continue;

        try {
          const b64 = await getBase64(imageMeta.url);
          const inline = { inline_data: { mime_type: b64.mimeType, data: b64.data } };
          const sig = getThoughtSignature(imageMeta);
          if (sig) {
            const parts: any[] = [];
            const textSig = getThoughtTextSignature(imageMeta);
            const text = getThoughtText(imageMeta);
            if (textSig && text) parts.push({ text, thought_signature: textSig });
            parts.push({ ...inline, thought_signature: sig });
            contents.push({ role: 'model', parts } as any);
          } else {
            contents.push({
              role: 'user',
              parts: [{ text: '参考上一轮生成结果如下：' }, inline] as any,
            } as any);
          }
        } catch (error) {
          console.warn('build multi-turn contents: read image failed', error);
        }
      }

      const newNode = get().nodes.find((n) => n.id === newId) || null;
      const finalPrompt = String(newNode?.data?.prompt || '');
      const finalParts = buildPromptPartsToGeminiParts(finalPrompt, newNode?.data?.promptParts);
      if (finalParts.length > 0) {
        contents.push({ role: 'user', parts: finalParts } as any);
      } else {
        contents.push({ role: 'user', parts: [{ text: '请基于以上内容生成图片。' }] } as any);
      }

      void get().generateNode(newId, undefined, { contents });
      return newId;
    }

    void get().generateNode(newId, undefined, { inputImage });
    return newId;
  },

  generateFromNode: async (
    nodeId: string,
    options?: { mode?: 'append' | 'regenerate'; overrides?: Partial<NodeData>; silent?: boolean; select?: boolean }
  ) => {
    const state = get();
    const base = state.nodes.find((n) => n.id === nodeId);
    if (!base) return null;

    if (base.data.collapsed) {
      set((prev) => ({
        nodes: prev.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  collapsed: false,
                },
              }
            : n
        ),
      }));
    }

    const prefs = getPreferences();
    const direction = prefs.canvasGenerateDirection || 'down';

    const mergedData: NodeData = {
      ...base.data,
      ...(options?.overrides || {}),
      count: Math.max(1, Math.min(8, Number(options?.overrides?.count ?? base.data.count) || 1)),
      imageSize: (options?.overrides?.imageSize || base.data.imageSize || '2K') as NodeData['imageSize'],
      aspectRatio: (options?.overrides?.aspectRatio || base.data.aspectRatio || 'auto') as NodeData['aspectRatio'],
      modelName: state.workbenchHealth?.generation?.model || base.data.modelName || DEFAULT_MODEL_NAME,
    };

    if (!hasEffectivePromptContent(String(mergedData.prompt || ''), mergedData.promptParts)) {
      if (!options?.silent) toast.error('请先填写提示词');
      return null;
    }

    const baseMode = mergedData.generationBaseMode || prefs.defaultGenerationBaseMode;

    const refCandidates = [
      String(options?.overrides?.referenceImageId || '').trim(),
      String(base.data.images?.[0]?.id || '').trim(),
      String(base.data.referenceImageId || '').trim(),
    ].filter(Boolean);

    const uniqueRefCandidates = Array.from(new Set(refCandidates));

    let resolvedReferenceImageId: string | undefined = undefined;
    let inputImage: Base64Image | undefined = undefined;
    if (baseMode === 'image' && uniqueRefCandidates.length > 0) {
      for (const refId of uniqueRefCandidates) {
        const refUrl =
          state.galleryImages.find((img) => img.id === refId)?.url ||
          state.nodes.flatMap((n) => n.data.images || []).find((img) => img.id === refId)?.url ||
          '';
        if (!refUrl) continue;
        try {
          inputImage = await toBase64ImageFromUrl(refUrl);
          resolvedReferenceImageId = refId;
          break;
        } catch {
          // try next
        }
      }
      if (!inputImage && !options?.silent) {
        toast.info('参考图片读取失败，已使用纯文本生成');
      }
    }

    const mode = options?.mode || 'append';
    if (mode === 'regenerate') {
      const snapshot = get();
      const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n] as const));
      const children = snapshot.edges.filter((e) => e.source === nodeId).map((e) => e.target);
      const regenRoots = children
        .map((id) => nodesById.get(id))
        .filter(Boolean)
        .filter((n) => n!.data.batchKind === 'regenerate' && !n!.data.archived)
        .map((n) => n!.id);

      if (regenRoots.length > 0) {
        const nextArchived = new Set<string>();
        const queue = [...regenRoots];
        const edgesBySource = new Map<string, string[]>();
        for (const e of snapshot.edges) {
          if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, []);
          edgesBySource.get(e.source)!.push(e.target);
        }

        while (queue.length) {
          const cur = queue.shift()!;
          if (nextArchived.has(cur)) continue;
          nextArchived.add(cur);
          const kids = edgesBySource.get(cur) || [];
          for (const k of kids) queue.push(k);
        }

        const now = new Date().toISOString();
        set((prev) => ({
          nodes: prev.nodes.map((n) =>
            nextArchived.has(n.id)
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    archived: true,
                    updatedAt: now,
                  },
                }
              : n
          ),
        }));
      }
    }

    const requestedCount = Math.max(1, Math.min(8, Number(mergedData.count) || 1));
    const now = new Date().toISOString();
    const startedAt = now;

    const effectiveReferenceImageId = baseMode === 'image' && inputImage ? resolvedReferenceImageId : undefined;

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const batchKind = mode === 'regenerate' ? 'regenerate' : 'generate';

    const snapshot = get();
    const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n] as const));
    const existingVisibleChildren = snapshot.edges
      .filter((e) => e.source === nodeId)
      .map((e) => nodesById.get(e.target))
      .filter(Boolean)
      .filter((n) => !n!.data.archived).length;

    const overrideTags = options?.overrides?.tags;
    const overrideNotes = options?.overrides?.notes;
    const nextTags = overrideTags !== undefined ? normalizeTags(overrideTags) : undefined;
    const nextNotes =
      overrideNotes !== undefined && String(overrideNotes || '').trim()
        ? String(overrideNotes || '').trim()
        : undefined;

    const gap = 360;

    const makeNodeId = () => `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newIds: string[] = [];
    const newNodes: AppNode[] = [];
    const newEdges: Edge[] = [];

    for (let i = 0; i < requestedCount; i++) {
      const newId = makeNodeId();
      newIds.push(newId);

      const position =
        direction === 'right'
          ? { x: base.position.x + gap, y: base.position.y + (existingVisibleChildren + i) * gap }
          : { x: base.position.x + (existingVisibleChildren + i) * gap, y: base.position.y + gap };

      const nodeNow: AppNode = {
        ...base,
        id: newId,
        position,
        data: {
          ...base.data,
          ...mergedData,
          id: newId,
          status: 'running',
          createdAt: now,
          updatedAt: now,
          images: [],
          favorite: false,
          tags: nextTags,
          notes: nextNotes,
          revisions: undefined,
          promptAnalysis: undefined,
          imageAnalyses: undefined,
          aiChats: undefined,
          errorMessage: undefined,
          lastRunAt: startedAt,
          lastRunDurationMs: undefined,
          referenceImageId: effectiveReferenceImageId,
          batchId,
          batchKind,
          batchAttempt: i + 1,
          archived: false,
        },
        selected: false,
      };

      const edgeId = `e_${nodeId}_${newId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      newEdges.push({ id: edgeId, source: nodeId, target: newId, type: 'smoothstep', animated: true });
      newNodes.push(nodeNow);
    }

    const shouldSelectNew = options?.select !== false;
    set((prev) => ({
      nodes: shouldSelectNew
        ? [...prev.nodes.map((n) => ({ ...n, selected: false })), ...newNodes.map((n, idx) => ({ ...n, selected: idx === 0 }))]
        : [...prev.nodes, ...newNodes.map((n) => ({ ...n, selected: false }))],
      edges: [...prev.edges, ...newEdges],
      selectedNodeId: shouldSelectNew ? newIds[0] || prev.selectedNodeId : prev.selectedNodeId,
    }));

    const startAt = performance.now();

    try {
      const resp = await generateWorkbench({
        prompt: mergedData.prompt,
        promptParts: mergedData.promptParts,
        count: requestedCount,
        imageSize: mergedData.imageSize,
        aspectRatio: mergedData.aspectRatio,
        inputImage,
      });

      const duration = performance.now() - startAt;
      const finishedAt = new Date().toISOString();

      const requested = Number(resp.requestedCount ?? requestedCount) || requestedCount;
      const partialErrors = resp.partialErrors || [];
      const failedSet = new Set<number>(
        partialErrors.map((e) => Number(e.attempt)).filter((n) => Number.isFinite(n) && n >= 1)
      );

      const images = resp.images || [];
      const thoughtSigs = resp.imageThoughtSignatures || [];
      const thoughtTexts = resp.imageTextParts || [];
      const thoughtTextSigs = resp.imageTextThoughtSignatures || [];
      let successCursor = 0;

      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const normalized: ImageMeta[] = [];
      const nodePatches = new Map<string, Partial<NodeData>>();

      for (let attempt = 1; attempt <= requested; attempt++) {
        const idx = attempt - 1;
        const targetNodeId = newIds[idx];
        if (!targetNodeId) continue;

        if (failedSet.has(attempt)) {
          const msg =
            partialErrors.find((e) => Number(e.attempt) === attempt)?.message ||
            resp.error ||
            resp.message ||
            '生成失败';
          nodePatches.set(targetNodeId, {
            status: 'failed',
            errorMessage: String(msg || '').trim() || '生成失败',
            lastRunDurationMs: duration,
            updatedAt: finishedAt,
          });
          continue;
        }

        const img = images[successCursor];
        if (!img) {
          nodePatches.set(targetNodeId, {
            status: 'failed',
            errorMessage: resp.error || 'No image generated',
            lastRunDurationMs: duration,
            updatedAt: finishedAt,
          });
          continue;
        }

        const imageId = `img_${targetNodeId}_${Date.now()}_0`;
        const meta: ImageMeta = {
          id: imageId,
          nodeId: targetNodeId,
          jobId,
          url: toImageSrc(img),
          createdAt: finishedAt,
          isFavorite: false,
          meta: {
            prompt: mergedData.prompt,
            model: mergedData.modelName,
            imageSize: mergedData.imageSize,
            aspectRatio: mergedData.aspectRatio,
            referenceImageId: effectiveReferenceImageId,
            batchId,
            batchKind,
            batchAttempt: attempt,
            thoughtSignature: thoughtSigs?.[successCursor],
            thoughtText: thoughtTexts?.[successCursor],
            thoughtTextSignature: thoughtTextSigs?.[successCursor],
          },
        };

        normalized.push(meta);
        nodePatches.set(targetNodeId, {
          status: 'completed',
          images: [meta],
          lastRunDurationMs: duration,
          errorMessage: undefined,
          updatedAt: finishedAt,
        });

        successCursor += 1;
      }

      set((prev) => ({
        nodes: prev.nodes.map((n) => {
          const patch = nodePatches.get(n.id);
          if (!patch) return n;
          return {
            ...n,
            data: {
              ...n.data,
              ...patch,
            },
          };
        }),
        galleryImages: normalized.length > 0 ? [...normalized, ...prev.galleryImages] : prev.galleryImages,
      }));

      if (!options?.silent) {
        const failed = Array.from(nodePatches.values()).filter((p) => p.status === 'failed').length;
        if (failed > 0) {
          toast.success(`图片生成完成（部分失败 ${failed}/${requested}），耗时 ${(duration / 1000).toFixed(1)} s`);
        } else {
          toast.success(`图片生成完成，耗时 ${(duration / 1000).toFixed(1)} s`);
        }
      }

      const canAutoAnalyze = Boolean(get().workbenchHealth?.analysis?.hasApiKey);
      const autoAnalyzeDefault = prefs.aiAutoAnalyzeAfterGenerate !== false;
      const shouldAutoAnalyze = autoAnalyzeDefault && !options?.silent && canAutoAnalyze;

      if (shouldAutoAnalyze && normalized.length > 0) {
        void (async () => {
          try {
            for (const img of normalized) {
              await get().analyzeNodePrompt(img.nodeId, { silent: true });
              await get().analyzeNodeImage(img.nodeId, img.id, { silent: true });
            }
          } catch (error) {
            console.warn('auto analyze after generate failed', error);
          }
        })();
      }

      return newIds;
    } catch (error: any) {
      console.error(error);
      const duration = performance.now() - startAt;
      const message = error?.message || '生成失败';
      const finishedAt = new Date().toISOString();

      set((prev) => ({
        nodes: prev.nodes.map((n) =>
          newIds.includes(n.id)
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: 'failed',
                  lastRunDurationMs: duration,
                  errorMessage: message,
                  updatedAt: finishedAt,
                },
              }
            : n
        ),
      }));

      if (!options?.silent) toast.error(message);
      return null;
    }
  },

  addImagesToGallery: (images: ImageMeta[]) => {
    if (!images || images.length === 0) return;
    set((state) => ({
      galleryImages: [...images, ...state.galleryImages],
    }));
  },

  toggleFavoriteImage: (id: string) => {
    set((state) => ({
      galleryImages: state.galleryImages.map((img) =>
        img.id === id ? { ...img, isFavorite: !img.isFavorite } : img
      ),
      nodes: state.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          images: node.data.images?.map((img) =>
            img.id === id ? { ...img, isFavorite: !img.isFavorite } : img
          ) || [],
        },
      })),
    }));
  },

  toggleFavoriteNode: (id: string) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;

    const now = new Date().toISOString();
    const nextFavorite = !node.data.favorite;

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                favorite: nextFavorite,
                updatedAt: now,
              },
            }
          : n
      ),
    }));

    const prompt = String(node.data.prompt || '').trim();
    if (!prompt) return;

    const title = prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt;

    const activeKey = get().activeCanvasKey;
    let sourceProjectId: string | undefined;
    let sourceCanvasId: string | undefined;
    if (activeKey && activeKey.startsWith(CANVAS_STORAGE_PREFIX)) {
      const rest = activeKey.slice(CANVAS_STORAGE_PREFIX.length);
      const parts = rest.split(':');
      sourceProjectId = parts[0] || undefined;
      sourceCanvasId = parts[1] || undefined;
    }

    const parsed = node.data.promptAnalysis?.parsed as any;
    const tagsFromAnalysis = normalizeTags(parsed?.tags);
    const tags = mergeTags(node.data.tags || [], tagsFromAnalysis).slice(0, 30);
    const aiQualityScore = toScore(parsed?.qualityScore);
    const aiSummary = typeof parsed?.summary === 'string' ? String(parsed.summary).trim() : undefined;

    set((state) => {
      const existing = state.promptLibrary.find((p) => p.sourceNodeId === id);
      if (existing) {
        return {
          promptLibrary: state.promptLibrary.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  title,
                  prompt,
                  negativePrompt: String(node.data.negativePrompt || '').trim() || undefined,
                  tags,
                  notes: node.data.notes || undefined,
                  isFavorite: nextFavorite,
                  aiQualityScore,
                  aiSummary,
                  updatedAt: now,
                }
              : p
          ),
        };
      }

      if (!nextFavorite) return {};

      const asset: PromptAsset = {
        id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        prompt,
        tags,
        notes: node.data.notes || undefined,
        isFavorite: true,
        usageCount: 0,
        aiQualityScore,
        aiSummary,
        createdAt: now,
        updatedAt: now,
        sourceNodeId: id,
        sourceProjectId,
        sourceCanvasId: sourceCanvasId || node.data.canvasId,
      };

      return {
        promptLibrary: [asset, ...state.promptLibrary].slice(0, 500),
      };
    });
  },

  savePromptToLibrary: (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const prompt = String(node.data.prompt || '').trim();
    if (!prompt) {
      toast.error('请先填写提示词');
      return;
    }

    const now = new Date().toISOString();
    const title = prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt;
    const activeKey = get().activeCanvasKey;
    let sourceProjectId: string | undefined;
    let sourceCanvasId: string | undefined;
    if (activeKey && activeKey.startsWith(CANVAS_STORAGE_PREFIX)) {
      const rest = activeKey.slice(CANVAS_STORAGE_PREFIX.length);
      const parts = rest.split(':');
      sourceProjectId = parts[0] || undefined;
      sourceCanvasId = parts[1] || undefined;
    }
    const parsed = node.data.promptAnalysis?.parsed as any;
    const tagsFromAnalysis = normalizeTags(parsed?.tags);
    const tags = mergeTags(node.data.tags || [], tagsFromAnalysis).slice(0, 30);
    const aiQualityScore = toScore(parsed?.qualityScore);
    const aiSummary = typeof parsed?.summary === 'string' ? String(parsed.summary).trim() : undefined;
    const existing = get().promptLibrary.find((p) => p.sourceNodeId === nodeId) || null;

    if (existing) {
      set((state) => ({
        promptLibrary: state.promptLibrary.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                title,
                prompt,
                tags,
                notes: node.data.notes || undefined,
                isFavorite: Boolean(p.isFavorite) || Boolean(node.data.favorite),
                aiQualityScore,
                aiSummary,
                updatedAt: now,
                sourceProjectId: sourceProjectId || p.sourceProjectId,
                sourceCanvasId: sourceCanvasId || p.sourceCanvasId || node.data.canvasId,
              }
            : p
        ),
      }));
      toast.success('已更新提示词库');

      const prefs = getPreferences();
      if (
        prefs.aiAutoTagPromptAssets !== false &&
        get().workbenchHealth?.analysis?.hasApiKey &&
        (!existing.aiQualityScore || !existing.tags?.length)
      ) {
        void get().autoTagPromptAsset(existing.id, { silent: true });
      }
      return;
    }

    const asset: PromptAsset = {
      id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      prompt,
      tags,
      notes: node.data.notes || undefined,
      isFavorite: Boolean(node.data.favorite),
      usageCount: 0,
      aiQualityScore,
      aiSummary,
      createdAt: now,
      updatedAt: now,
      sourceNodeId: nodeId,
      sourceProjectId,
      sourceCanvasId: sourceCanvasId || node.data.canvasId,
    };

    set((state) => ({
      promptLibrary: [asset, ...state.promptLibrary].slice(0, 200),
    }));
    toast.success('已保存到提示词库');

    const prefs = getPreferences();
    if (
      prefs.aiAutoTagPromptAssets !== false &&
      get().workbenchHealth?.analysis?.hasApiKey &&
      (!asset.aiQualityScore || !asset.tags?.length)
    ) {
      void get().autoTagPromptAsset(asset.id, { silent: true });
    }
  },

  createPromptAsset: (input) => {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) {
      toast.error('提示词不能为空');
      return;
    }

    const now = new Date().toISOString();
    const title = String(input?.title || '').trim() || (prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt);
    const tags = Array.isArray(input?.tags) ? input.tags.filter(Boolean).map((t) => String(t).trim()).filter(Boolean) : [];

    const asset: PromptAsset = {
      id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      prompt,
      tags,
      notes: String(input?.notes || '').trim() || undefined,
      isFavorite: Boolean(input?.isFavorite),
      usageCount: Number(input?.usageCount || 0) || 0,
      lastUsedAt: input?.lastUsedAt,
      aiQualityScore: toScore((input as any)?.aiQualityScore),
      aiSummary: typeof (input as any)?.aiSummary === 'string' ? String((input as any).aiSummary).trim() || undefined : undefined,
      createdAt: now,
      updatedAt: now,
      sourceNodeId: input?.sourceNodeId,
      sourceProjectId: input?.sourceProjectId,
      sourceCanvasId: input?.sourceCanvasId,
    };

    set((state) => ({
      promptLibrary: [asset, ...state.promptLibrary].slice(0, 500),
    }));
    toast.success('提示词已创建');

    const prefs = getPreferences();
    if (
      prefs.aiAutoTagPromptAssets !== false &&
      get().workbenchHealth?.analysis?.hasApiKey &&
      (!asset.aiQualityScore || !asset.tags?.length)
    ) {
      void get().autoTagPromptAsset(asset.id, { silent: true });
    }
  },

  updatePromptAsset: (assetId: string, patch) => {
    const before = get().promptLibrary.find((p) => p.id === assetId) || null;
    const beforePrompt = String(before?.prompt || '').trim();
    const nextPrompt = typeof patch?.prompt === 'string' ? String(patch.prompt || '').trim() : null;
    const promptChanged = nextPrompt !== null && nextPrompt !== beforePrompt;

    const now = new Date().toISOString();
    set((state) => ({
      promptLibrary: state.promptLibrary.map((p) => {
        if (p.id !== assetId) return p;
        const nextTags = Array.isArray(patch?.tags)
          ? patch.tags
              .filter(Boolean)
              .map((t) => String(t).trim())
              .filter(Boolean)
          : p.tags;
        return {
          ...p,
          ...patch,
          title: typeof patch?.title === 'string' ? patch.title : p.title,
          prompt: typeof patch?.prompt === 'string' ? patch.prompt : p.prompt,
          negativePrompt: typeof patch?.negativePrompt === 'string' ? patch.negativePrompt : p.negativePrompt,
          tags: nextTags,
          notes: typeof patch?.notes === 'string' ? patch.notes : p.notes,
          updatedAt: now,
        };
      }),
    }));
    toast.success('提示词已更新');

    const prefs = getPreferences();
    if (promptChanged && prefs.aiAutoTagPromptAssets !== false && get().workbenchHealth?.analysis?.hasApiKey) {
      void get().autoTagPromptAsset(assetId, { silent: true });
    }
  },

  deletePromptAsset: (assetId: string) => {
    set((state) => ({
      promptLibrary: state.promptLibrary.filter((p) => p.id !== assetId),
    }));
    toast.success('提示词已删除');
  },

  toggleFavoritePromptAsset: (assetId: string) => {
    set((state) => ({
      promptLibrary: state.promptLibrary.map((p) =>
        p.id === assetId ? { ...p, isFavorite: !p.isFavorite, updatedAt: new Date().toISOString() } : p
      ),
    }));
  },

  autoTagPromptAsset: async (assetId: string, options?: { silent?: boolean }) => {
    const asset = get().promptLibrary.find((p) => p.id === assetId);
    if (!asset) return;

    const prompt = String(asset.prompt || '').trim();
    if (!prompt) {
      if (!options?.silent) toast.error('提示词不能为空');
      return;
    }

    try {
      const resp = await analyzePromptApi({ prompt });
      const parsed = resp.parsed || {};
      const tags = normalizeTags((parsed as any)?.tags);
      const aiQualityScore = toScore((parsed as any)?.qualityScore);
      const aiSummary = typeof (parsed as any)?.summary === 'string' ? String((parsed as any).summary).trim() : undefined;
      const now = new Date().toISOString();

      set((state) => ({
        promptLibrary: state.promptLibrary.map((p) =>
          p.id === assetId
            ? {
                ...p,
                tags: mergeTags(p.tags, tags).slice(0, 30),
                aiQualityScore,
                aiSummary: aiSummary || p.aiSummary,
                updatedAt: now,
              }
            : p
        ),
      }));

      if (!options?.silent) toast.success('AI 标签已更新');
    } catch (error: any) {
      if (!options?.silent) toast.error(error?.message || 'AI 分析失败');
      else console.warn('autoTagPromptAsset failed', error);
    }
  },

  autoTagGalleryImage: async (imageId: string, options?: { silent?: boolean }) => {
    const state = get();
    const galleryImage = state.galleryImages.find((img) => img.id === imageId);
    const nodeImage = state.nodes.flatMap((n) => n.data.images || []).find((img) => img.id === imageId);
    const target = galleryImage || nodeImage;
    if (!target?.url) return;

    let image: Base64Image;
    try {
      image = await toBase64ImageFromUrl(target.url);
    } catch (error: any) {
      if (!options?.silent) toast.error(error?.message || '无法读取图片内容');
      else console.warn('autoTagGalleryImage: read image failed', error);
      return;
    }

    try {
      const resp = await analyzeImageApi({
        image,
        prompt: String(target.meta?.prompt || '').trim() || undefined,
      });
      const parsed = resp.parsed || {};

      const tags = normalizeTags((parsed as any)?.tags);
      const aiCaption = typeof (parsed as any)?.caption === 'string' ? String((parsed as any).caption).trim() : undefined;
      const aiOverallScore = toScore((parsed as any)?.overallScore);
      const aiAestheticScore = toScore((parsed as any)?.aestheticScore);
      const aiPromptAlignmentScore = toScore((parsed as any)?.promptAlignment?.score);

      set((prev) => ({
        galleryImages: prev.galleryImages.map((img) =>
          img.id === imageId
            ? {
                ...img,
                tags: mergeTags(img.tags, tags).slice(0, 30),
                aiCaption: aiCaption || img.aiCaption,
                aiOverallScore: aiOverallScore ?? img.aiOverallScore,
                aiAestheticScore: aiAestheticScore ?? img.aiAestheticScore,
                aiPromptAlignmentScore: aiPromptAlignmentScore ?? img.aiPromptAlignmentScore,
              }
            : img
        ),
        nodes: prev.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            images:
              node.data.images?.map((img) =>
                img.id === imageId
                  ? {
                      ...img,
                      tags: mergeTags(img.tags, tags).slice(0, 30),
                      aiCaption: aiCaption || img.aiCaption,
                      aiOverallScore: aiOverallScore ?? img.aiOverallScore,
                      aiAestheticScore: aiAestheticScore ?? img.aiAestheticScore,
                      aiPromptAlignmentScore: aiPromptAlignmentScore ?? img.aiPromptAlignmentScore,
                    }
                  : img
              ) || [],
          },
        })),
      }));

      if (!options?.silent) toast.success('AI 图片标签已更新');
    } catch (error: any) {
      if (!options?.silent) toast.error(error?.message || 'AI 分析失败');
      else console.warn('autoTagGalleryImage failed', error);
    }
  },

  applyPromptAssetToNode: (assetId: string, nodeId: string) => {
    const asset = get().promptLibrary.find((p) => p.id === assetId);
    if (!asset) return;
    get().commitNodeEdit(
      nodeId,
      { prompt: asset.prompt, promptParts: undefined },
      { source: 'asset' }
    );
    const usedAt = new Date().toISOString();
    set((state) => ({
      promptLibrary: state.promptLibrary.map((p) =>
        p.id === assetId
          ? { ...p, lastUsedAt: usedAt, usageCount: Number(p.usageCount || 0) + 1, updatedAt: usedAt }
          : p
      ),
    }));
    toast.success('已应用提示词');
  },

  setSelectedNodeId: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  setNodes: (nodes: AppNode[]) => {
    set({ nodes });
  },

  setEdges: (edges: Edge[]) => {
    set({ edges });
  },

  clearSelection: () => {
    set((state) => ({
      selectedNodeId: null,
      nodes: state.nodes.map((n) => ({ ...n, selected: false })),
    }));
  },

  selectOnlyNode: (id: string) => {
    set((state) => ({
      selectedNodeId: id,
      nodes: state.nodes.map((n) => ({ ...n, selected: n.id === id })),
    }));
  },

  hydrate: (projectId: string, canvasId: string) => {
    const canvasStorageKey = buildCanvasStorageKey(projectId, canvasId);
    const snapshot = loadCanvasSnapshot(canvasStorageKey);
    const galleryImages = loadGalleryImages();
    const promptLibrary = loadPromptLibrary();

    if (snapshot && snapshot.nodes.length > 0) {
      set({
        activeCanvasKey: canvasStorageKey,
        nodes: snapshot.nodes,
        edges: snapshot.edges || [],
        selectedNodeId: snapshot.nodes[0]?.id || null,
        galleryImages,
        promptLibrary,
      });
      return;
    }

    const modelName = get().workbenchHealth?.generation?.model || DEFAULT_MODEL_NAME;
    const starter = createStarterNode(canvasId, modelName);
    set({
      activeCanvasKey: canvasStorageKey,
      nodes: [starter],
      edges: [],
      selectedNodeId: starter.id,
      galleryImages,
      promptLibrary,
    });
  },
  generateNode: async (
    id: string,
    overrides?: Partial<NodeData>,
    options?: { silent?: boolean; inputImage?: Base64Image; autoAnalyze?: boolean; contents?: GeminiContent[] }
  ) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return;

    if (node.data.status === 'running') {
      return;
    }

    const mergedData: NodeData = {
      ...node.data,
      ...overrides,
      count: Math.max(1, Math.min(8, Number(overrides?.count ?? node.data.count) || 1)),
      imageSize: (overrides?.imageSize || node.data.imageSize || '2K') as NodeData['imageSize'],
      aspectRatio: (overrides?.aspectRatio || node.data.aspectRatio || 'auto') as NodeData['aspectRatio'],
      modelName: state.workbenchHealth?.generation?.model || node.data.modelName || DEFAULT_MODEL_NAME,
    };

    const hasCustomContents = Array.isArray(options?.contents) && options.contents.length > 0;
    if (!hasCustomContents && !hasEffectivePromptContent(String(mergedData.prompt || ''), mergedData.promptParts)) {
      if (!options?.silent) toast.error('请先填写提示词');
      return;
    }

    const startAt = performance.now();
    const startedAt = new Date().toISOString();

    set((prev) => ({
      nodes: prev.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...mergedData,
                status: 'running',
                errorMessage: undefined,
                lastRunAt: startedAt,
                updatedAt: startedAt,
              },
            }
          : n
      ),
    }));

    try {
      let inputImage: Base64Image | undefined = options?.inputImage;
      if (!hasCustomContents) {
        const refId = mergedData.referenceImageId;
        if (!inputImage && refId) {
          const refUrl =
            state.galleryImages.find((img) => img.id === refId)?.url ||
            node.data.images?.find((img) => img.id === refId)?.url ||
            '';
          if (refUrl) {
            try {
              inputImage = await toBase64ImageFromUrl(refUrl);
            } catch {
              if (!options?.silent) toast.info('参考图片读取失败，已使用纯文本生成');
            }
          } else if (!options?.silent) {
            toast.info('参考图片丢失，已使用纯文本生成');
          }
        }
      }

      const resp = await (async () => {
        try {
          return await generateWorkbench({
            prompt: mergedData.prompt,
            promptParts: mergedData.promptParts,
            contents: options?.contents,
            count: mergedData.count,
            imageSize: mergedData.imageSize,
            aspectRatio: mergedData.aspectRatio,
            inputImage,
          });
        } catch (error: any) {
          const message = String(error?.message || '');
          const shouldFallback =
            hasCustomContents && /thought_signature|MISSING_THOUGHT_SIGNATURE/i.test(message);
          if (!shouldFallback) throw error;

          let fallbackInput: Base64Image | undefined = inputImage;
          if (!fallbackInput) {
            const refId = String(mergedData.referenceImageId || '').trim();
            if (refId) {
              const refUrl =
                state.galleryImages.find((img) => img.id === refId)?.url ||
                node.data.images?.find((img) => img.id === refId)?.url ||
                '';
              if (refUrl) {
                try {
                  fallbackInput = await toBase64ImageFromUrl(refUrl);
                } catch {
                  // ignore
                }
              }
            }
          }

          if (!options?.silent) {
            toast.info('多轮对话继续失败，已降级为仅发送该图继续生成');
          }

          return await generateWorkbench({
            prompt: mergedData.prompt,
            promptParts: mergedData.promptParts,
            count: mergedData.count,
            imageSize: mergedData.imageSize,
            aspectRatio: mergedData.aspectRatio,
            inputImage: fallbackInput,
          });
        }
      })();

      const images = resp.images || [];
      if (!images.length) {
        throw new Error(resp.error || 'No images generated');
      }

      const now = new Date().toISOString();
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Prepare images for IndexedDB storage
      const storedImages: StoredImage[] = [];
      const normalized: ImageMeta[] = images.map((img, idx) => {
        const imageId = `img_${id}_${Date.now()}_${idx}`;
        const dataUrl = toImageSrc(img);
        const parsed = parseDataUrl(imageId, dataUrl);
        if (parsed) {
          storedImages.push(parsed);
        }
        return {
          id: imageId,
          nodeId: id,
          jobId,
          // Use IndexedDB reference if parsed successfully, otherwise fallback to data URL
          url: parsed ? createIndexedDBRef(imageId) : dataUrl,
          createdAt: now,
          isFavorite: false,
          meta: {
            prompt: mergedData.prompt,
            model: mergedData.modelName,
            imageSize: mergedData.imageSize,
            aspectRatio: mergedData.aspectRatio,
            referenceImageId: mergedData.referenceImageId,
            thoughtSignature: resp.imageThoughtSignatures?.[idx],
            thoughtText: resp.imageTextParts?.[idx],
            thoughtTextSignature: resp.imageTextThoughtSignatures?.[idx],
          },
        };
      });

      // Save images to IndexedDB (async, non-blocking)
      if (storedImages.length > 0) {
        saveImagesToIndexedDB(storedImages).catch((err) => {
          console.warn('Failed to save images to IndexedDB', err);
        });
      }

      const partialErrors = resp.partialErrors || [];
      const requestedCount = Number(resp.requestedCount ?? mergedData.count) || mergedData.count;
      const failedCount = Number(resp.failedCount ?? partialErrors.length) || partialErrors.length;
      let runErrorMessage: string | undefined = undefined;
      if (partialErrors.length > 0) {
        const details = partialErrors
          .slice(0, 3)
          .map((e) => `#${e.attempt} ${String(e.message || '').trim()}`)
          .filter(Boolean)
          .join('；');
        const more = partialErrors.length > 3 ? `…(+${partialErrors.length - 3})` : '';
        const summary = `部分失败：${failedCount}/${requestedCount}`;
        runErrorMessage = details ? `${summary}。${details}${more}` : summary;
        if (runErrorMessage.length > 240) runErrorMessage = `${runErrorMessage.slice(0, 240)}…`;
      }

      const duration = performance.now() - startAt;

      set((prev) => ({
        nodes: prev.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...mergedData,
                  status: 'completed',
                  images: normalized,
                  lastRunDurationMs: duration,
                  errorMessage: runErrorMessage,
                  updatedAt: new Date().toISOString(),
                },
              }
            : n
        ),
        galleryImages: [...normalized, ...prev.galleryImages],
      }));

      if (!options?.silent) {
        if (runErrorMessage) {
          toast.success(`图片生成完成（部分失败 ${failedCount}/${requestedCount}），耗时 ${(duration / 1000).toFixed(1)} s`);
        } else {
          toast.success(`图片生成完成，耗时 ${(duration / 1000).toFixed(1)} s`);
        }
      }

      const canAutoAnalyze = Boolean(get().workbenchHealth?.analysis?.hasApiKey);
      const prefs = getPreferences();
      const autoAnalyzeDefault = prefs.aiAutoAnalyzeAfterGenerate !== false;
      const shouldAutoAnalyze =
        options?.autoAnalyze === true
          ? canAutoAnalyze
          : options?.autoAnalyze === false
            ? false
            : autoAnalyzeDefault && !options?.silent && canAutoAnalyze;
      if (shouldAutoAnalyze) {
        void (async () => {
          try {
            await get().analyzeNodePrompt(id, { silent: true });
            for (const img of normalized) {
              await get().analyzeNodeImage(id, img.id, { silent: true });
            }
          } catch (error) {
            console.warn('auto analyze after generate failed', error);
          }
        })();
      }
    } catch (error: any) {
      console.error(error);
      const duration = performance.now() - startAt;
      const message = error?.message || '生成失败';

      set((prev) => ({
        nodes: prev.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: 'failed',
                  lastRunDurationMs: duration,
                  errorMessage: message,
                  updatedAt: new Date().toISOString(),
                },
              }
            : n
        ),
      }));

      if (!options?.silent) toast.error(message);
    }
  },

  clearAiChat: (nodeId: string, imageId: string) => {
    if (!nodeId || !imageId) return;
    const now = new Date().toISOString();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const existing = n.data.aiChats || {};
        const next = { ...existing };
        delete next[imageId];
        return {
          ...n,
          data: {
            ...n.data,
            aiChats: Object.keys(next).length ? next : undefined,
            updatedAt: now,
          },
        };
      }),
    }));
  },

  sendAiChatMessage: async (nodeId: string, imageId: string, text: string, options?: { includeHistory?: boolean; presetId?: string }) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId) || null;
    if (!node) return;
    const img =
      node.data.images?.find((it) => it.id === imageId) ||
      state.galleryImages.find((it) => it.id === imageId) ||
      null;
    if (!img?.url) {
      toast.error('未找到要分析的图片');
      return;
    }

    const messageText = String(text || '').trim();
    if (!messageText) {
      toast.error('请输入内容');
      return;
    }

    if (!state.workbenchHealth?.analysis?.hasApiKey) {
      toast.error('分析 API Key 未配置，请到「API配置」填写');
      return;
    }

    const prefs = getPreferences();
    const includeHistory = options?.includeHistory ?? prefs.aiChatIncludeHistory;
    const maxMessages = Math.max(6, Math.min(80, Number(prefs.aiChatMaxMessages || 24) || 24));
    const systemPrompt = String(prefs.aiChatSystemPrompt || '').trim();

    let imageB64: Base64Image;
    try {
      imageB64 = await toBase64ImageFromUrl(img.url);
    } catch (error: any) {
      toast.error(error?.message || '无法读取图片内容');
      return;
    }

    const now = new Date().toISOString();
    const makeMsgId = () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const session = node.data.aiChats?.[imageId] || {
      imageId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const history = includeHistory ? (session.messages || []).slice(-maxMessages) : [];

    const contents: GeminiContent[] = [];
    const contextParts: any[] = [];
    if (systemPrompt) contextParts.push({ text: systemPrompt });
    const nodePrompt = String(node.data.prompt || '').trim();
    if (nodePrompt) contextParts.push({ text: `\n\n[NODE_PROMPT]\n${nodePrompt}` });
    contextParts.push({ text: '\n\n[IMAGE]\n' });
    contextParts.push({ inline_data: { mime_type: imageB64.mimeType, data: imageB64.data } });
    contents.push({ role: 'user', parts: contextParts } as any);

    for (const m of history) {
      const role = m.role === 'model' ? 'model' : 'user';
      const part: any = { text: String(m.text || '') };
      if (role === 'model' && m.thoughtSignature) part.thought_signature = m.thoughtSignature;
      contents.push({ role, parts: [part] } as any);
    }

    contents.push({ role: 'user', parts: [{ text: messageText }] } as any);

    let resp;
    try {
      resp = await chatAnalyze({ contents, temperature: 0.4 });
    } catch (error: any) {
      toast.error(error?.message || 'AI 对话请求失败');
      return;
    }
    const replyText = String(resp.text || '').trim() || '(空回复)';

    const nextMessages = [...(session.messages || [])];
    nextMessages.push({
      id: makeMsgId(),
      role: 'user',
      text: messageText,
      createdAt: now,
      presetId: options?.presetId,
    });
    nextMessages.push({
      id: makeMsgId(),
      role: 'model',
      text: replyText,
      createdAt: now,
      thoughtSignature: resp.thoughtSignature,
    });

    const trimmed = nextMessages.slice(-maxMessages);
    set((prev) => ({
      nodes: prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            aiChats: {
              ...(n.data.aiChats || {}),
              [imageId]: {
                imageId,
                createdAt: session.createdAt || now,
                updatedAt: now,
                messages: trimmed,
              },
            },
            updatedAt: now,
          },
        };
      }),
    }));
  },

  generateNodes: async (ids: string[], options?: { concurrency?: number }) => {
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if (unique.length === 0) {
      toast.info('未选择节点');
      return;
    }

    const snapshot = get();
    const nodesById = new Map(snapshot.nodes.map((n) => [n.id, n] as const));

    const runnableBases: string[] = [];
    let skippedEmptyPrompt = 0;
    let skippedMissing = 0;

    for (const id of unique) {
      const node = nodesById.get(id);
      if (!node) {
        skippedMissing += 1;
        continue;
      }
      if (!hasEffectivePromptContent(String(node.data.prompt || ''), node.data.promptParts)) {
        skippedEmptyPrompt += 1;
        continue;
      }
      runnableBases.push(id);
    }

    if (runnableBases.length === 0) {
      if (skippedEmptyPrompt > 0) toast.error(`有 ${skippedEmptyPrompt} 个节点提示词为空`);
      else toast.info('没有可生成的节点');
      return;
    }

    const concurrency = Math.max(1, Math.min(6, Number(options?.concurrency ?? 3) || 3));
    const startAt = performance.now();
    const workerCount = Math.min(concurrency, runnableBases.length);

    // 预先分配任务到各个 worker，避免并发竞态条件
    const taskQueues: string[][] = Array.from({ length: workerCount }, () => []);
    runnableBases.forEach((id, idx) => {
      taskQueues[idx % workerCount].push(id);
    });

    const results = await Promise.all(
      taskQueues.map(async (queue) => {
        const picked: string[] = [];
        for (const baseId of queue) {
          const newIds = await get().generateFromNode(baseId, { mode: 'append', silent: true, select: false });
          if (newIds?.[0]) picked.push(newIds[0]);
        }
        return picked;
      })
    );

    const elapsed = performance.now() - startAt;
    const finalById = new Map(get().nodes.map((n) => [n.id, n] as const));

    const pickedIds = results.flat().filter(Boolean);
    if (pickedIds.length > 0) {
      const pickedSet = new Set(pickedIds);
      set((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, selected: pickedSet.has(n.id) })),
        selectedNodeId: pickedIds[0] || state.selectedNodeId,
      }));
    }

    const succeeded = pickedIds.filter((id) => finalById.get(id)?.data.status === 'completed').length;
    const failed = pickedIds.filter((id) => finalById.get(id)?.data.status === 'failed').length;
    const unknown = Math.max(0, pickedIds.length - succeeded - failed);

    const parts: string[] = [`成功 ${succeeded}`, `失败 ${failed}`];
    if (unknown > 0) parts.push(`未完成 ${unknown}`);
    if (skippedEmptyPrompt > 0) parts.push(`跳过(空提示词) ${skippedEmptyPrompt}`);
    if (skippedMissing > 0) parts.push(`跳过(缺失) ${skippedMissing}`);

    toast.success(`批量生成完成：${parts.join('，')}（${(elapsed / 1000).toFixed(1)}s，并发 ${workerCount}）`);
  },

  analyzeNodePrompt: async (id: string, options?: { silent?: boolean }) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;

    const prompt = String(node.data.prompt || '').trim();
    if (!prompt) {
      if (!options?.silent) toast.error('请先填写提示词');
      return;
    }

    const resp = await analyzePromptApi({ prompt });
    const now = new Date().toISOString();
    const parsed = resp.parsed as any;
    const tags = normalizeTags(parsed?.tags);

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                tags: mergeTags(n.data.tags, tags).slice(0, 30),
                promptAnalysis: {
                  raw: resp.raw || '',
                  parsed: resp.parsed,
                  createdAt: now,
                },
                updatedAt: now,
              },
            }
          : n
      ),
    }));

    if (!options?.silent) toast.success('提示词分析完成');
  },

  analyzeNodeImage: async (nodeId: string, imageId: string, options?: { silent?: boolean }) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const target = node.data.images?.find((img) => img.id === imageId);
    if (!target?.url) return;

    let image: Base64Image;
    try {
      image = await toBase64ImageFromUrl(target.url);
    } catch (error: any) {
      if (!options?.silent) toast.error(error?.message || '无法读取图片内容');
      else console.warn('analyzeNodeImage: read image failed', error);
      return;
    }

    const resp = await analyzeImageApi({ image, prompt: String(node.data.prompt || '').trim() || undefined });
    const now = new Date().toISOString();
    const parsed = resp.parsed as any;
    const tags = normalizeTags(parsed?.tags);
    const aiCaption = typeof parsed?.caption === 'string' ? String(parsed.caption).trim() : undefined;
    const aiOverallScore = toScore(parsed?.overallScore);
    const aiAestheticScore = toScore(parsed?.aestheticScore);
    const aiPromptAlignmentScore = toScore(parsed?.promptAlignment?.score);

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                images:
                  n.data.images?.map((img) =>
                    img.id === imageId
                      ? {
                          ...img,
                          tags: mergeTags(img.tags, tags).slice(0, 30),
                          aiCaption: aiCaption || img.aiCaption,
                          aiOverallScore: aiOverallScore ?? img.aiOverallScore,
                          aiAestheticScore: aiAestheticScore ?? img.aiAestheticScore,
                          aiPromptAlignmentScore: aiPromptAlignmentScore ?? img.aiPromptAlignmentScore,
                        }
                      : img
                  ) || [],
                imageAnalyses: {
                  ...(n.data.imageAnalyses || {}),
                  [imageId]: { raw: resp.raw || '', parsed: resp.parsed, createdAt: now },
                },
                updatedAt: now,
              },
            }
          : n
      ),
      galleryImages: state.galleryImages.map((img) =>
        img.id === imageId
          ? {
              ...img,
              tags: mergeTags(img.tags, tags).slice(0, 30),
              aiCaption: aiCaption || img.aiCaption,
              aiOverallScore: aiOverallScore ?? img.aiOverallScore,
              aiAestheticScore: aiAestheticScore ?? img.aiAestheticScore,
              aiPromptAlignmentScore: aiPromptAlignmentScore ?? img.aiPromptAlignmentScore,
            }
          : img
      ),
    }));

    if (!options?.silent) toast.success('图片分析完成');
  },
}));

if (typeof window !== 'undefined') {
  useCanvasStore.subscribe((state, prev) => {
    if (
      state.activeCanvasKey &&
      (state.nodes !== prev.nodes || state.edges !== prev.edges || state.activeCanvasKey !== prev.activeCanvasKey)
    ) {
      persistCanvasSnapshot(state.activeCanvasKey, { nodes: state.nodes, edges: state.edges });
    }
    if (state.galleryImages !== prev.galleryImages) {
      persistGalleryImages(state.galleryImages);
    }
    if (state.promptLibrary !== prev.promptLibrary) {
      persistPromptLibrary(state.promptLibrary);
    }
  });
}
