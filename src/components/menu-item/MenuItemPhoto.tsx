'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/** Ordered product photos with preview, cover selection and upload actions. */
export default function MenuItemPhoto({
  imageUrls,
  name,
  onImageClick,
  onAiImageClick,
  onRemove,
  onPrimary,
}: {
  imageUrls: string[];
  name: string;
  onImageClick?: () => void;
  onAiImageClick?: () => void;
  onRemove?: (index: number) => void;
  onPrimary?: (index: number) => void;
}) {
  const { t } = useI18n();
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const image = selected === null ? undefined : imageUrls[selected];
  return (
    <div className="item-photo-section">
      <Dialog.Root
        open={!!image}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <div
          className={`item-photo ${imageUrls.length ? 'item-photo-filled' : ''}`}
        >
          {imageUrls.map((url, index) => (
            <div className="item-photo-thumbnail" key={url}>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="item-photo-preview"
                  onClick={(event) => {
                    lastTrigger.current = event.currentTarget;
                    setSelected(index);
                  }}
                  aria-label={
                    imageUrls.length > 1
                      ? `${t('itemPhotoTitle')} ${index + 1}`
                      : t('itemPhotoTitle')
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${name} ${index + 1}`}
                    className="item-photo-image"
                  />
                </button>
              </Dialog.Trigger>
              {index === 0 && (
                <span className="absolute bottom-1 start-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
                  {t('itemPhotoPrimary')}
                </span>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="item-photo-remove"
                  onClick={() => onRemove(index)}
                  aria-label={
                    imageUrls.length > 1
                      ? `${t('removeImage')} ${index + 1}`
                      : t('removeImage')
                  }
                  title={t('removeImage')}
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          ))}
          {onImageClick && imageUrls.length < 10 && (
            <button
              type="button"
              onClick={onImageClick}
              className="item-photo-upload"
              aria-label={t('addPhoto')}
            >
              {imageUrls.length ? <Plus size={24} /> : <ImagePlus size={24} />}
              <span>{t('addPhoto')}</span>
            </button>
          )}
        </div>
        {image && selected !== null && (
          <Dialog.Portal>
            <Dialog.Overlay className="item-photo-dialog-overlay" />
            <Dialog.Content
              className="item-editor item-photo-dialog"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (lastTrigger.current?.isConnected) {
                  event.preventDefault();
                  lastTrigger.current.focus();
                }
              }}
            >
              <header className="item-photo-dialog-header">
                <Dialog.Close asChild>
                  <Button variant="secondary" icon aria-label={t('close')}>
                    <X />
                  </Button>
                </Dialog.Close>
                <Dialog.Title>
                  {t('itemPhotoTitle')}
                  {imageUrls.length > 1
                    ? ` ${selected + 1}/${imageUrls.length}`
                    : ''}
                </Dialog.Title>
              </header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={name} className="item-photo-dialog-image" />
              <footer className="item-photo-dialog-actions">
                {onRemove && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      onRemove(selected);
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={18} />
                    {t('removeImage')}
                  </Button>
                )}
                {onPrimary && selected > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onPrimary(selected);
                      setSelected(null);
                    }}
                  >
                    {t('itemPhotoMakePrimary')}
                  </Button>
                )}
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
      <p className="text-xs text-fg-secondary">{t('itemPhotosHint')}</p>
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
  );
}
