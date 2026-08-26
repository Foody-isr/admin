'use client';

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react';
import { uploadSectionImage, type CateringCatalogItemImageInput } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export const CATERING_GALLERY_LIMIT = 12;

export function moveGalleryImage(
  images: CateringCatalogItemImageInput[],
  index: number,
  target: number,
): CateringCatalogItemImageInput[] {
  if (target < 0 || target >= images.length || index === target) return images;
  const next = [...images];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

type Props = {
  restaurantId: number;
  coverUrl: string;
  images: CateringCatalogItemImageInput[];
  onChange: (images: CateringCatalogItemImageInput[]) => void;
};

export default function CateringItemGalleryEditor({ restaurantId, coverUrl, images, onChange }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, CATERING_GALLERY_LIMIT - images.length);

  async function upload(files: FileList | null) {
    if (!files?.length || remaining === 0) return;
    const selected = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError(files.length > remaining ? t('catering_gallery_limit_error').replace('{n}', String(CATERING_GALLERY_LIMIT)) : null);
    setProgress({ current: 0, total: selected.length });
    const uploaded: CateringCatalogItemImageInput[] = [];
    try {
      for (let index = 0; index < selected.length; index += 1) {
        setProgress({ current: index + 1, total: selected.length });
        const imageUrl = await uploadSectionImage(restaurantId, selected[index]);
        uploaded.push({ image_url: imageUrl, alt_text: '' });
        onChange([...images, ...uploaded]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t('catering_gallery_upload_error'));
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className="rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-fg-primary">{t('catering_gallery_title')}</h4>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fg-secondary">
            {coverUrl ? t('catering_gallery_hint_with_cover') : t('catering_gallery_hint')}
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-fg-tertiary">
          {images.length}/{CATERING_GALLERY_LIMIT}
        </span>
      </div>

      {images.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <article key={`${image.image_url}-${index}`} className="overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)]">
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-subtle)]">
                <img src={image.image_url} alt={image.alt_text ?? ''} className="h-full w-full object-cover" />
                <span className="absolute start-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[11px] font-bold text-white">{index + 1}</span>
              </div>
              <div className="space-y-2 p-2.5">
                <input
                  className="input h-9 text-xs"
                  value={image.alt_text ?? ''}
                  onChange={(event) => onChange(images.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, alt_text: event.target.value } : candidate))}
                  placeholder={t('catering_gallery_alt_placeholder')}
                  aria-label={t('catering_gallery_alt_label').replace('{n}', String(index + 1))}
                />
                <div className="grid grid-cols-[1fr_auto_1fr] gap-1">
                  <button type="button" disabled={index === 0} onClick={() => onChange(moveGalleryImage(images, index, index - 1))} aria-label={t('catering_gallery_move_previous')} className="grid min-h-9 place-items-center rounded-lg border border-[var(--divider)] text-fg-secondary transition hover:border-brand-500 disabled:opacity-30"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
                  <button type="button" onClick={() => onChange(images.filter((_, candidateIndex) => candidateIndex !== index))} aria-label={t('catering_gallery_remove')} className="grid min-h-9 min-w-10 place-items-center rounded-lg border border-red-500/20 text-red-500 transition hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                  <button type="button" disabled={index === images.length - 1} onClick={() => onChange(moveGalleryImage(images, index, index + 1))} aria-label={t('catering_gallery_move_next')} className="grid min-h-9 place-items-center rounded-lg border border-[var(--divider)] text-fg-secondary transition hover:border-brand-500 disabled:opacity-30"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--divider)] bg-[var(--surface)] px-4 py-6 text-center">
          <ImagePlus className="mx-auto h-6 w-6 text-fg-tertiary" />
          <p className="mt-2 text-sm font-medium text-fg-primary">{t('catering_gallery_empty')}</p>
        </div>
      )}

      <button
        type="button"
        disabled={uploading || remaining === 0}
        onClick={() => inputRef.current?.click()}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--divider)] bg-[var(--surface)] px-4 text-sm font-semibold text-fg-secondary transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4" />
        {uploading
          ? t('catering_gallery_upload_progress').replace('{current}', String(progress.current)).replace('{total}', String(progress.total))
          : t('catering_gallery_add')}
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => upload(event.target.files)} />
    </section>
  );
}
