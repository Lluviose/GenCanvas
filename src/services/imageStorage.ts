/**
 * IndexedDB 图片存储服务
 * 解决 localStorage 容量限制问题，将图片 base64 数据存储到 IndexedDB
 */

const DB_NAME = 'gencanvas-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn('IndexedDB open failed', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

  return dbPromise;
};

export interface StoredImage {
  id: string;
  data: string; // base64 data (without prefix)
  mimeType: string;
  createdAt: string;
}

/**
 * 保存图片到 IndexedDB
 */
export const saveImage = async (image: StoredImage): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(image);

      request.onerror = () => {
        console.warn('IndexedDB saveImage failed', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.warn('saveImage failed', error);
  }
};

/**
 * 批量保存图片
 */
export const saveImages = async (images: StoredImage[]): Promise<void> => {
  if (!images.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      let hasError = false;

      for (const img of images) {
        const request = store.put(img);
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.warn('IndexedDB saveImages failed', request.error);
            reject(request.error);
          }
        };
        request.onsuccess = () => {
          completed++;
          if (completed === images.length && !hasError) {
            resolve();
          }
        };
      }
    });
  } catch (error) {
    console.warn('saveImages failed', error);
  }
};

/**
 * 从 IndexedDB 获取图片
 */
export const getImage = async (id: string): Promise<StoredImage | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => {
        console.warn('IndexedDB getImage failed', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  } catch (error) {
    console.warn('getImage failed', error);
    return null;
  }
};

/**
 * 批量获取图片
 */
export const getImages = async (ids: string[]): Promise<Map<string, StoredImage>> => {
  const result = new Map<string, StoredImage>();
  if (!ids.length) return result;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      let hasError = false;

      for (const id of ids) {
        const request = store.get(id);
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.warn('IndexedDB getImages failed', request.error);
            reject(request.error);
          }
        };
        request.onsuccess = () => {
          if (request.result) {
            result.set(id, request.result);
          }
          completed++;
          if (completed === ids.length && !hasError) {
            resolve(result);
          }
        };
      }
    });
  } catch (error) {
    console.warn('getImages failed', error);
    return result;
  }
};

/**
 * 获取所有图片
 */
export const getAllImages = async (): Promise<StoredImage[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => {
        console.warn('IndexedDB getAllImages failed', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  } catch (error) {
    console.warn('getAllImages failed', error);
    return [];
  }
};

/**
 * 删除图片
 */
export const deleteImage = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => {
        console.warn('IndexedDB deleteImage failed', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.warn('deleteImage failed', error);
  }
};

/**
 * 批量删除图片
 */
export const deleteImages = async (ids: string[]): Promise<void> => {
  if (!ids.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      let completed = 0;
      let hasError = false;

      for (const id of ids) {
        const request = store.delete(id);
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.warn('IndexedDB deleteImages failed', request.error);
            reject(request.error);
          }
        };
        request.onsuccess = () => {
          completed++;
          if (completed === ids.length && !hasError) {
            resolve();
          }
        };
      }
    });
  } catch (error) {
    console.warn('deleteImages failed', error);
  }
};

/**
 * 清空所有图片
 */
export const clearAllImages = async (): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        console.warn('IndexedDB clearAllImages failed', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.warn('clearAllImages failed', error);
  }
};

/**
 * 将 data URL 解析为 StoredImage 格式
 */
export const parseDataUrl = (id: string, dataUrl: string): StoredImage | null => {
  if (!dataUrl) return null;

  // 如果不是 data URL，返回 null
  if (!dataUrl.startsWith('data:')) return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  return {
    id,
    mimeType: match[1],
    data: match[2],
    createdAt: new Date().toISOString(),
  };
};

/**
 * 将 StoredImage 转换为 data URL
 */
export const toDataUrl = (image: StoredImage): string => {
  if (!image?.data) return '';
  return `data:${image.mimeType || 'image/png'};base64,${image.data}`;
};

/**
 * 检查 URL 是否为 IndexedDB 引用格式
 */
export const isIndexedDBRef = (url: string): boolean => {
  return url?.startsWith('idb://') || false;
};

/**
 * 创建 IndexedDB 引用 URL
 */
export const createIndexedDBRef = (id: string): string => {
  return `idb://${id}`;
};

/**
 * 从 IndexedDB 引用 URL 提取 ID
 */
export const parseIndexedDBRef = (url: string): string | null => {
  if (!isIndexedDBRef(url)) return null;
  return url.slice(6); // 去掉 'idb://'
};

/**
 * 解析 URL 获取实际可用的图片 src
 * - 如果是 data URL，直接返回
 * - 如果是 idb:// 引用，从 IndexedDB 加载并返回 data URL
 * - 如果是普通 URL，直接返回
 */
export const resolveImageUrl = async (url: string): Promise<string> => {
  if (!url) return '';

  // data URL 直接返回
  if (url.startsWith('data:')) return url;

  // http(s) URL 直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // IndexedDB 引用
  if (isIndexedDBRef(url)) {
    const id = parseIndexedDBRef(url);
    if (!id) return '';
    const stored = await getImage(id);
    if (!stored) return '';
    return toDataUrl(stored);
  }

  return url;
};

/**
 * 批量解析 URL
 */
export const resolveImageUrls = async (urls: string[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  if (!urls.length) return result;

  // 分离需要从 IndexedDB 加载的和不需要的
  const idbRefs: string[] = [];
  const idbIds: string[] = [];

  for (const url of urls) {
    if (isIndexedDBRef(url)) {
      const id = parseIndexedDBRef(url);
      if (id) {
        idbRefs.push(url);
        idbIds.push(id);
      }
    } else {
      result.set(url, url);
    }
  }

  // 批量加载 IndexedDB 图片
  if (idbIds.length > 0) {
    const stored = await getImages(idbIds);
    for (let i = 0; i < idbRefs.length; i++) {
      const url = idbRefs[i];
      const id = idbIds[i];
      const img = stored.get(id);
      result.set(url, img ? toDataUrl(img) : '');
    }
  }

  return result;
};
