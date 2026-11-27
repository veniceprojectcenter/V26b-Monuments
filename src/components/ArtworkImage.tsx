import React, { useState, useEffect } from 'react';
import { FileImage } from 'lucide-react';

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  surveyCode?: string;
  regionLabel?: string;
  className?: string;
  compact?: boolean;
  loading?: 'lazy' | 'eager';
  onStatusChange?: (loaded: boolean) => void;
}

export const ArtworkImage: React.FC<ArtworkImageProps> = ({
  src,
  alt,
  surveyCode,
  regionLabel,
  className = 'block w-full h-full object-cover',
  compact = false,
  loading = 'lazy',
  onStatusChange,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (!src) {
      onStatusChange?.(false);
    }
  }, [src, onStatusChange]);

  if (!src || hasError) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-[#f3f4f6] to-[#e5e7eb] text-[#4b5563] flex flex-col items-center justify-center text-center select-none ${
          compact ? 'p-1.5' : 'p-4'
        }`}
      >
        <FileImage className={compact ? 'w-5 h-5 text-[#b91c1c]/80' : 'w-7 h-7 text-[#b91c1c]/80 mb-1.5'} />
        {!compact && (
          <>
            <span className="text-[11px] font-bold text-[#111827] leading-tight">
              {surveyCode ? surveyCode.toUpperCase() : 'Survey123 Record'}
            </span>
            <span className="text-[10px] text-[#6b7280] mt-0.5 leading-tight">
              {regionLabel ? `${regionLabel} • ` : ''}Reference photo pending
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onLoad={() => onStatusChange?.(true)}
      onError={() => {
        setHasError(true);
        onStatusChange?.(false);
      }}
    />
  );
};
