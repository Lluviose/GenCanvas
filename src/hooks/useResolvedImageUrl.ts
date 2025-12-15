import { useState, useEffect } from 'react';
import { resolveImageUrl, isIndexedDBRef } from '@/services/imageStorage';

/**
 * React hook to resolve image URL (handles idb:// references)
 * Returns the resolved data URL for display
 */
export const useResolvedImageUrl = (url: string | undefined): string => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    // If not an IndexedDB reference, return as-is immediately
    if (!url || !isIndexedDBRef(url)) return url || '';
    return ''; // Will be resolved async
  });

  useEffect(() => {
    if (!url) {
      setResolvedUrl('');
      return;
    }

    // If not an IndexedDB reference, use directly
    if (!isIndexedDBRef(url)) {
      setResolvedUrl(url);
      return;
    }

    // Resolve IndexedDB reference
    let cancelled = false;
    resolveImageUrl(url).then((resolved) => {
      if (!cancelled) {
        setResolvedUrl(resolved);
      }
    }).catch((err) => {
      console.warn('Failed to resolve image URL', err);
      if (!cancelled) {
        setResolvedUrl('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolvedUrl;
};

/**
 * React hook to resolve multiple image URLs
 */
export const useResolvedImageUrls = (urls: string[]): Map<string, string> => {
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const url of urls) {
      if (url && !isIndexedDBRef(url)) {
        map.set(url, url);
      }
    }
    return map;
  });

  useEffect(() => {
    if (!urls.length) {
      setResolvedUrls(new Map());
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      const map = new Map<string, string>();
      const promises: Promise<void>[] = [];

      for (const url of urls) {
        if (!url) continue;
        if (!isIndexedDBRef(url)) {
          map.set(url, url);
        } else {
          promises.push(
            resolveImageUrl(url).then((resolved) => {
              map.set(url, resolved);
            }).catch(() => {
              map.set(url, '');
            })
          );
        }
      }

      await Promise.all(promises);

      if (!cancelled) {
        setResolvedUrls(map);
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [urls.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return resolvedUrls;
};

export default useResolvedImageUrl;
