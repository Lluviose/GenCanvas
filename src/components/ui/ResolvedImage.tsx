import { memo, useState } from 'react';
import { useResolvedImageUrl } from '@/hooks/useResolvedImageUrl';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';

interface ResolvedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined;
}

/**
 * Image component that automatically resolves idb:// URLs from IndexedDB
 * Includes loading skeleton and error fallback
 */
export const ResolvedImage = memo(({ src, alt, className, ...props }: ResolvedImageProps) => {
  const resolvedSrc = useResolvedImageUrl(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-secondary/50 text-muted-foreground/30", className)}>
        <ImageIcon className="w-1/4 h-1/4" />
      </div>
    );
  }

  // If resolvedSrc is null but src exists, it might be resolving or failed
  // We can show loading state if src starts with idb:// and resolvedSrc is null
  if (src.startsWith('idb://') && !resolvedSrc) {
     return <div className={cn("animate-pulse bg-secondary/80", className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {isLoading && (
        <div className="absolute inset-0 z-10 animate-pulse bg-secondary/80" />
      )}
      
      {hasError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-secondary/50 text-muted-foreground/40">
           <ImageIcon className="w-1/3 h-1/3" />
        </div>
      ) : (
        <img 
          src={resolvedSrc || src} 
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500", 
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          {...props} 
        />
      )}
    </div>
  );
});

ResolvedImage.displayName = 'ResolvedImage';

export default ResolvedImage;
