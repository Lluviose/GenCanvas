import { memo } from 'react';
import { useResolvedImageUrl } from '@/hooks/useResolvedImageUrl';

interface ResolvedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined;
}

/**
 * Image component that automatically resolves idb:// URLs from IndexedDB
 */
export const ResolvedImage = memo(({ src, alt, ...props }: ResolvedImageProps) => {
  const resolvedSrc = useResolvedImageUrl(src);

  if (!resolvedSrc) {
    return null;
  }

  return <img src={resolvedSrc} alt={alt} {...props} />;
});

ResolvedImage.displayName = 'ResolvedImage';

export default ResolvedImage;
