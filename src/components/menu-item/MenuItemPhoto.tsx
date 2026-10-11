'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/** Single item photo, with a focused preview and the existing upload/AI actions. */
export default function MenuItemPhoto({
  imageUrl,
  name,
  onImageClick,
  onAiImageClick,
  onRemove,
}: {
  imageUrl?: string;
  name: string;
  onImageClick?: () => void;
  onAiImageClick?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remove = () => {
    setOpen(false);
    onRemove?.();
  };
  return (
    <div className="item-photo-section">
      <Dialog.Root open={open && !!imageUrl} onOpenChange={setOpen}>
        <div className={`item-photo ${imageUrl ? 'item-photo-filled' : ''}`}>
          {imageUrl && (
            <div className="item-photo-thumbnail">
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="item-photo-preview"
                  aria-label={t('itemPhotoTitle')}
                >
                  {/* Uploaded images and local file previews use the same surface. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={name} className="item-photo-image" />
                  <span className="item-photo-overlay">
                    {t('itemPhotoPrimary')}
                  </span>
                </button>
              </Dialog.Trigger>
              {onRemove && (
                <button
                  type="button"
                  className="item-photo-remove"
                  onClick={remove}
                  aria-label={t('removeImage')}
                  title={t('removeImage')}
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          )}
          {onImageClick && (
            <button
              type="button"
              onClick={onImageClick}
              className="item-photo-upload"
              aria-label={imageUrl ? t('itemChangePhoto') : t('addPhoto')}
            >
              {imageUrl ? <Plus size={24} /> : <ImagePlus size={24} />}
              <span>{imageUrl ? t('itemPhotoReplace') : t('addPhoto')}</span>
            </button>
          )}
        </div>
        {imageUrl && (
          <Dialog.Portal>
            <Dialog.Overlay className="item-photo-dialog-overlay" />
            <Dialog.Content
              className="item-editor item-photo-dialog"
              aria-describedby={undefined}
            >
              <header className="item-photo-dialog-header">
                <Dialog.Close asChild>
                  <Button variant="secondary" icon aria-label={t('close')}>
                    <X />
                  </Button>
                </Dialog.Close>
                <Dialog.Title>{t('itemPhotoTitle')}</Dialog.Title>
              </header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={name}
                className="item-photo-dialog-image"
              />
              <footer className="item-photo-dialog-actions">
                {onRemove && (
                  <Button variant="ghost" onClick={remove}>
                    <Trash2 size={18} />
                    {t('removeImage')}
                  </Button>
                )}
                {onImageClick && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOpen(false);
                      onImageClick();
                    }}
                  >
                    {t('itemChangePhoto')}
                  </Button>
                )}
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
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
