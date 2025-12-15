/**
 * 备份服务：本地导出/导入 + WebDAV 云备份
 */

import type { ImageMeta, PromptAsset, Project, Canvas } from '@/types';

// ============ 数据结构 ============

export interface BackupData {
  version: string;
  exportedAt: string;
  galleryImages: ImageMeta[];
  promptLibrary: PromptAsset[];
  projects?: Project[];
  canvases?: Record<string, Canvas[]>; // projectId -> canvases
  canvasSnapshots?: Record<string, any>; // "projectId:canvasId" -> snapshot
}

export interface WebDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string; // e.g. "/GenCanvas/"
}

// ============ Storage Keys ============

const STORAGE_KEYS = {
  galleryImages: 'photopro:gallery-images',
  promptLibrary: 'photopro:prompt-library',
  projects: 'photopro:projects',
  canvasesPrefix: 'photopro:canvases:',
  canvasStatePrefix: 'photopro:canvas-state:',
  webdavConfig: 'photopro:webdav-config',
};

const BACKUP_VERSION = '1.0.0';

// ============ 本地存储读写 ============

const safeParseJSON = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const loadGalleryImages = (): ImageMeta[] => {
  return safeParseJSON(localStorage.getItem(STORAGE_KEYS.galleryImages), []);
};

export const loadPromptLibrary = (): PromptAsset[] => {
  return safeParseJSON(localStorage.getItem(STORAGE_KEYS.promptLibrary), []);
};

export const loadProjects = (): Project[] => {
  return safeParseJSON(localStorage.getItem(STORAGE_KEYS.projects), []);
};

export const loadAllCanvases = (): Record<string, Canvas[]> => {
  const result: Record<string, Canvas[]> = {};
  const projects = loadProjects();
  for (const p of projects) {
    const key = `${STORAGE_KEYS.canvasesPrefix}${p.id}`;
    result[p.id] = safeParseJSON(localStorage.getItem(key), []);
  }
  return result;
};

export const loadAllCanvasSnapshots = (): Record<string, any> => {
  const result: Record<string, any> = {};
  const prefix = STORAGE_KEYS.canvasStatePrefix;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const suffix = key.slice(prefix.length);
      result[suffix] = safeParseJSON(localStorage.getItem(key), null);
    }
  }
  return result;
};

// ============ 本地导出 ============

export const exportBackupData = (options?: { includeCanvases?: boolean }): BackupData => {
  const data: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    galleryImages: loadGalleryImages(),
    promptLibrary: loadPromptLibrary(),
  };

  if (options?.includeCanvases) {
    data.projects = loadProjects();
    data.canvases = loadAllCanvases();
    data.canvasSnapshots = loadAllCanvasSnapshots();
  }

  return data;
};

export const downloadBackupAsJSON = (options?: { includeCanvases?: boolean }) => {
  const data = exportBackupData(options);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gencanvas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ============ 本地导入 ============

export interface ImportResult {
  success: boolean;
  message: string;
  stats?: {
    galleryImages: number;
    promptLibrary: number;
    projects?: number;
    canvases?: number;
    canvasSnapshots?: number;
  };
}

export const importBackupData = async (
  file: File,
  options?: { mergeMode?: 'replace' | 'merge' }
): Promise<ImportResult> => {
  const mode = options?.mergeMode || 'merge';

  try {
    const text = await file.text();
    const data = JSON.parse(text) as BackupData;

    if (!data.version || !data.exportedAt) {
      return { success: false, message: '无效的备份文件格式' };
    }

    const stats: ImportResult['stats'] = {
      galleryImages: 0,
      promptLibrary: 0,
    };

    // 导入图片库
    if (Array.isArray(data.galleryImages)) {
      if (mode === 'replace') {
        localStorage.setItem(STORAGE_KEYS.galleryImages, JSON.stringify(data.galleryImages));
        stats.galleryImages = data.galleryImages.length;
      } else {
        const existing = loadGalleryImages();
        const existingIds = new Set(existing.map((i) => i.id));
        const newItems = data.galleryImages.filter((i) => !existingIds.has(i.id));
        const merged = [...existing, ...newItems];
        localStorage.setItem(STORAGE_KEYS.galleryImages, JSON.stringify(merged));
        stats.galleryImages = newItems.length;
      }
    }

    // 导入提示词库
    if (Array.isArray(data.promptLibrary)) {
      if (mode === 'replace') {
        localStorage.setItem(STORAGE_KEYS.promptLibrary, JSON.stringify(data.promptLibrary));
        stats.promptLibrary = data.promptLibrary.length;
      } else {
        const existing = loadPromptLibrary();
        const existingIds = new Set(existing.map((i) => i.id));
        const newItems = data.promptLibrary.filter((i) => !existingIds.has(i.id));
        const merged = [...existing, ...newItems];
        localStorage.setItem(STORAGE_KEYS.promptLibrary, JSON.stringify(merged));
        stats.promptLibrary = newItems.length;
      }
    }

    // 导入项目与画布（可选）
    if (Array.isArray(data.projects)) {
      if (mode === 'replace') {
        localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(data.projects));
        stats.projects = data.projects.length;
      } else {
        const existing = loadProjects();
        const existingIds = new Set(existing.map((p) => p.id));
        const newItems = data.projects.filter((p) => !existingIds.has(p.id));
        const merged = [...existing, ...newItems];
        localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(merged));
        stats.projects = newItems.length;
      }
    }

    if (data.canvases && typeof data.canvases === 'object') {
      let canvasCount = 0;
      for (const [projectId, canvases] of Object.entries(data.canvases)) {
        if (!Array.isArray(canvases)) continue;
        const key = `${STORAGE_KEYS.canvasesPrefix}${projectId}`;
        if (mode === 'replace') {
          localStorage.setItem(key, JSON.stringify(canvases));
          canvasCount += canvases.length;
        } else {
          const existing = safeParseJSON<Canvas[]>(localStorage.getItem(key), []);
          const existingIds = new Set(existing.map((c) => c.id));
          const newItems = canvases.filter((c) => !existingIds.has(c.id));
          const merged = [...existing, ...newItems];
          localStorage.setItem(key, JSON.stringify(merged));
          canvasCount += newItems.length;
        }
      }
      stats.canvases = canvasCount;
    }

    if (data.canvasSnapshots && typeof data.canvasSnapshots === 'object') {
      let snapshotCount = 0;
      for (const [suffix, snapshot] of Object.entries(data.canvasSnapshots)) {
        if (!snapshot) continue;
        const key = `${STORAGE_KEYS.canvasStatePrefix}${suffix}`;
        if (mode === 'replace' || !localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(snapshot));
          snapshotCount++;
        }
      }
      stats.canvasSnapshots = snapshotCount;
    }

    return {
      success: true,
      message: mode === 'replace' ? '已替换本地数据' : '已合并导入',
      stats,
    };
  } catch (error: any) {
    return { success: false, message: error?.message || '导入失败' };
  }
};

// ============ WebDAV 配置 ============

export const loadWebDAVConfig = (): WebDAVConfig | null => {
  return safeParseJSON(localStorage.getItem(STORAGE_KEYS.webdavConfig), null);
};

export const saveWebDAVConfig = (config: WebDAVConfig) => {
  localStorage.setItem(STORAGE_KEYS.webdavConfig, JSON.stringify(config));
};

export const clearWebDAVConfig = () => {
  localStorage.removeItem(STORAGE_KEYS.webdavConfig);
};

// ============ WebDAV 操作 ============

const buildAuthHeader = (config: WebDAVConfig) => {
  const credentials = btoa(`${config.username}:${config.password}`);
  return `Basic ${credentials}`;
};

const normalizeServerUrl = (url: string) => {
  return url.replace(/\/+$/, '');
};

const normalizeRemotePath = (path: string) => {
  let p = path.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
};

export const testWebDAVConnection = async (config: WebDAVConfig): Promise<{ success: boolean; message: string }> => {
  const baseUrl = normalizeServerUrl(config.serverUrl);
  const remotePath = normalizeRemotePath(config.remotePath);
  const url = `${baseUrl}${remotePath}`;

  try {
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config),
        Depth: '0',
      },
    });

    if (res.status === 207 || res.status === 200) {
      return { success: true, message: '连接成功' };
    } else if (res.status === 404) {
      // 目录不存在，尝试创建
      const mkcolRes = await fetch(url, {
        method: 'MKCOL',
        headers: { Authorization: buildAuthHeader(config) },
      });
      if (mkcolRes.ok || mkcolRes.status === 201) {
        return { success: true, message: '连接成功（已创建目录）' };
      }
      return { success: false, message: `无法创建目录 (${mkcolRes.status})` };
    } else if (res.status === 401) {
      return { success: false, message: '认证失败，请检查用户名和密码' };
    } else {
      return { success: false, message: `连接失败 (${res.status})` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || '网络错误（可能是 CORS 限制）' };
  }
};

export const uploadToWebDAV = async (
  config: WebDAVConfig,
  filename: string,
  content: string
): Promise<{ success: boolean; message: string }> => {
  const baseUrl = normalizeServerUrl(config.serverUrl);
  const remotePath = normalizeRemotePath(config.remotePath);
  const url = `${baseUrl}${remotePath}${filename}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(config),
        'Content-Type': 'application/json',
      },
      body: content,
    });

    if (res.ok || res.status === 201 || res.status === 204) {
      return { success: true, message: '上传成功' };
    } else if (res.status === 401) {
      return { success: false, message: '认证失败' };
    } else {
      return { success: false, message: `上传失败 (${res.status})` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || '网络错误' };
  }
};

export const downloadFromWebDAV = async (
  config: WebDAVConfig,
  filename: string
): Promise<{ success: boolean; message: string; data?: string }> => {
  const baseUrl = normalizeServerUrl(config.serverUrl);
  const remotePath = normalizeRemotePath(config.remotePath);
  const url = `${baseUrl}${remotePath}${filename}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config),
      },
    });

    if (res.ok) {
      const data = await res.text();
      return { success: true, message: '下载成功', data };
    } else if (res.status === 404) {
      return { success: false, message: '文件不存在' };
    } else if (res.status === 401) {
      return { success: false, message: '认证失败' };
    } else {
      return { success: false, message: `下载失败 (${res.status})` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || '网络错误' };
  }
};

export const listWebDAVFiles = async (
  config: WebDAVConfig
): Promise<{ success: boolean; message: string; files?: string[] }> => {
  const baseUrl = normalizeServerUrl(config.serverUrl);
  const remotePath = normalizeRemotePath(config.remotePath);
  const url = `${baseUrl}${remotePath}`;

  try {
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config),
        Depth: '1',
      },
    });

    if (res.status === 207 || res.ok) {
      const text = await res.text();
      // 简单解析 XML 获取文件名
      const files: string[] = [];
      const hrefRegex = /<d:href[^>]*>([^<]+)<\/d:href>/gi;
      let match;
      while ((match = hrefRegex.exec(text)) !== null) {
        const href = decodeURIComponent(match[1]);
        // 提取文件名
        const parts = href.split('/').filter(Boolean);
        const name = parts[parts.length - 1];
        if (
          name &&
          name.endsWith('.json') &&
          (name.startsWith('gencanvas-backup') || name.startsWith('photopro-backup'))
        ) {
          files.push(name);
        }
      }
      return { success: true, message: '获取成功', files: files.sort().reverse() };
    } else if (res.status === 401) {
      return { success: false, message: '认证失败' };
    } else {
      return { success: false, message: `获取失败 (${res.status})` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || '网络错误' };
  }
};

// ============ WebDAV 备份/恢复 ============

export const backupToWebDAV = async (
  config: WebDAVConfig,
  options?: { includeCanvases?: boolean }
): Promise<{ success: boolean; message: string; filename?: string }> => {
  const data = exportBackupData(options);
  const json = JSON.stringify(data, null, 2);
  const filename = `gencanvas-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

  const result = await uploadToWebDAV(config, filename, json);
  if (result.success) {
    return { success: true, message: `已备份到 ${filename}`, filename };
  }
  return result;
};

export const restoreFromWebDAV = async (
  config: WebDAVConfig,
  filename: string,
  options?: { mergeMode?: 'replace' | 'merge' }
): Promise<ImportResult> => {
  const downloadResult = await downloadFromWebDAV(config, filename);
  if (!downloadResult.success || !downloadResult.data) {
    return { success: false, message: downloadResult.message };
  }

  try {
    // 验证 JSON 格式
    JSON.parse(downloadResult.data);
    
    // 复用本地导入逻辑
    const blob = new Blob([downloadResult.data], { type: 'application/json' });
    const file = new File([blob], filename);
    return importBackupData(file, options);
  } catch (error: any) {
    return { success: false, message: '解析备份文件失败' };
  }
};
