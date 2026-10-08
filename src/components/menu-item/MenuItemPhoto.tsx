'use client';

import { Camera, ImageIcon, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** Compact photo controls alongside the item's identity. */
export default function MenuItemPhoto({
  imageUrl,
  name,
  onImageClick,
  onAiImageClick,
}: {
  imageUrl?: string;
  name: string;
  onImageClick?: () => void;
  onAiImageClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="w-40 space-y-2">
      <div className="aspect-square overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          /> /* eslint-disable-line @next/next/no-img-element */
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--fg-subtle)]">
            <ImageIcon size={32} />
          </div>
        )}
      </div>
      {onImageClick && (
        <button
          type="button"
          onClick={onImageClick}
          className="btn-secondary min-h-11 w-full text-xs"
        >
          <Camera size={16} />
          {t('addPhoto')}
        </button>
      )}
      {onAiImageClick && (
        <button
          type="button"
          onClick={onAiImageClick}
          className="btn-ghost min-h-11 w-full text-xs"
        >
          <Sparkles size={16} />
          {t('generateWithAi')}
        </button>
      )}
    </div>
  );
}
