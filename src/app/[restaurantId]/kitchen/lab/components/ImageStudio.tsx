'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckIcon, ImageIcon, SparklesIcon } from 'lucide-react';
import { labConfirmImage, labGenerateImage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { DraftImageResult } from '../types';

export function ImageStudio({ restaurantId, draftId, currentImage, disabled, onConfirmed }: {
  restaurantId: number;
  draftId: number;
  currentImage?: string;
  disabled?: boolean;
  onConfirmed: (url: string) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'commercial' | 'plating'>('commercial');
  const [style, setStyle] = useState('natural');
  const [angle, setAngle] = useState('45');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<DraftImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(Array.from({ length: 3 }, () => labGenerateImage(restaurantId, draftId, { kind, style, angle, additional_notes: notes })));
      setImages(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('labImageFailed'));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (image: DraftImageResult) => {
    setConfirming(image.generation_id);
    setError(null);
    try {
      const result = await labConfirmImage(restaurantId, draftId, { generation_id: image.generation_id, image_b64: image.image_b64 });
      onConfirmed(result.image_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('labImageFailed'));
    } finally {
      setConfirming(null);
    }
  };

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]"><ImageIcon className="h-4 w-4" />{t('labImageStudio')}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{t('labImageHelp')}</p>

      {currentImage && <Image src={currentImage} alt="" width={640} height={640} unoptimized className="mt-3 aspect-square w-full rounded-lg object-cover" />}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Select value={kind} onChange={(v) => setKind(v as 'commercial' | 'plating')} options={[['commercial', t('labImageCommercial')], ['plating', t('labImagePlating')]]} />
        <Select value={style} onChange={setStyle} options={[['natural', t('labStyleNatural')], ['brasserie', 'Brasserie'], ['street_food', 'Street food'], ['fine_dining', 'Fine dining'], ['delivery', t('labStyleDelivery')]]} />
        <Select value={angle} onChange={setAngle} options={[['45', '45°'], ['top_down', t('labTopDown')], ['close_up', t('labCloseUp')]]} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('labImageNotes')} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-xs text-[var(--fg)]" />
      </div>

      <button type="button" onClick={generate} disabled={disabled || loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-500)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
        <SparklesIcon className="h-4 w-4" />{loading ? t('labImageGenerating') : t('labGenerateImages')}
      </button>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {images.map((image) => (
            <button key={image.generation_id} type="button" onClick={() => confirm(image)} disabled={confirming != null} className="group relative overflow-hidden rounded-lg border border-[var(--line)] disabled:opacity-50">
              <Image src={`data:image/png;base64,${image.image_b64}`} alt={t('labGeneratedDish')} width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
              <span className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded bg-black/70 px-1 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"><CheckIcon className="h-3 w-3" />{confirming === image.generation_id ? t('labSaving') : t('labChooseImage')}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-xs text-[var(--fg)]">{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
}
