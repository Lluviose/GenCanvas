import heic2any from 'heic2any';
import type { Base64Image, ImagePolicy } from '@/types/media';

export const estimateBase64Bytes = (base64 = '') => {
  if (!base64) return 0;
  return Math.ceil(base64.length * 0.75);
};

export const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const isLikelyHeic = (blob: Blob, fileName?: string) => {
  const type = (blob.type || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  if (name.endsWith('.heic') || name.endsWith('.heif')) return true;
  return false;
};

export const convertHeicIfNeeded = async (blob: Blob, fileName?: string): Promise<Blob> => {
  if (!isLikelyHeic(blob, fileName)) return blob;

  try {
    const converted = await heic2any({
      blob,
      toType: 'image/jpeg',
      quality: 0.95,
    });
    if (converted instanceof Blob) return converted;
    if (Array.isArray(converted) && converted[0] instanceof Blob) return converted[0];
    return blob;
  } catch {
    return blob;
  }
};

const loadImageFromBlob = async (blob: Blob): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;

    try {
      await img.decode();
    } catch {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      });
    }
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const compressImage = async (blob: Blob, policy: ImagePolicy): Promise<Blob> => {
  const maxDimension = policy?.maxDimension || 3072;
  const enableWebp = policy?.enableWebp !== false;
  const quality = typeof policy?.webpQuality === 'number' ? policy.webpQuality : 0.95;

  const img = await loadImageFromBlob(blob);
  const srcWidth = img.naturalWidth || img.width || 0;
  const srcHeight = img.naturalHeight || img.height || 0;

  if (!srcWidth || !srcHeight) return blob;

  const maxSide = Math.max(srcWidth, srcHeight);
  const needsResize = maxSide > maxDimension;
  const scale = needsResize ? maxDimension / maxSide : 1;
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  if (!needsResize && !enableWebp) return blob;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const candidates: { blob: Blob; type: string }[] = [];

  if (enableWebp) {
    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    );
    if (webpBlob) candidates.push({ blob: webpBlob, type: 'webp' });
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  );
  if (jpegBlob) candidates.push({ blob: jpegBlob, type: 'jpeg' });

  if (!needsResize) candidates.push({ blob, type: 'original' });

  candidates.sort((a, b) => a.blob.size - b.blob.size);
  return candidates[0]?.blob || blob;
};

export const blobToBase64Image = async (blob: Blob): Promise<Base64Image> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('READ_FILE_FAILED'));
    reader.readAsDataURL(blob);
  });

  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : '';
  return {
    mimeType: blob.type || 'image/jpeg',
    data: base64,
  };
};

export const fileToBase64Image = async (file: File, policy: ImagePolicy): Promise<Base64Image> => {
  const converted = await convertHeicIfNeeded(file, file.name);
  const compressed = await compressImage(converted, policy);
  return blobToBase64Image(compressed);
};

export const toImageSrc = (image: Base64Image) => {
  if (!image?.data) return '';
  if (image.data.startsWith('http://') || image.data.startsWith('https://')) return image.data;
  return `data:${image.mimeType || 'image/png'};base64,${image.data}`;
};
