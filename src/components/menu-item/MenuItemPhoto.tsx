'use client';

import { ImagePlus, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** Photo upload surface placed after the item's primary fields. */
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
    <div className={`item-photo ${imageUrl ? 'item-photo-filled' : ''}`}>
      {imageUrl && (
        // User uploads and temporary local previews share this image surface.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="item-photo-image" />
      )}
      <div className="item-photo-actions">
        {onImageClick && (
          <button
            type="button"
            onClick={onImageClick}
            className="item-photo-upload"
          >
            <ImagePlus size={24} />
            <span>{imageUrl ? t('itemChangePhoto') : t('addPhoto')}</span>
          </button>
        )}
        {onAiImageClick && (
          <button
            type="button"
            onClick={onAiImageClick}
            className="item-photo-ai"
          >
            <Sparkles size={18} />
            {t('generateWithAi')}
          </button>
        )}
      </div>
    </div>
  );
}
