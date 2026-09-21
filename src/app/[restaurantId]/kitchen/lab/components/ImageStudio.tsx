'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckIcon, ImageIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ds';
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
    <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
      <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--fg)]"><ImageIcon className="h-4 w-4 text-[var(--brand-500)]" />{t('labImageStudio')}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{t('labImageHelp')}</p>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {currentImage ? (
          <Image src={currentImage} alt={t('labGeneratedDish')} width={640} height={640} unoptimized className="aspect-square w-full rounded-[12px] object-cover" />
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-center">
            <ImageIcon className="h-7 w-7 text-[var(--fg-subtle)]" />
            <p className="mt-2 px-4 text-xs leading-5 text-[var(--fg-muted)]">{t('labImageEmpty')}</p>
          </div>
        )}

        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={kind} onChange={(v) => setKind(v as 'commercial' | 'plating')} options={[['commercial', t('labImageCommercial')], ['plating', t('labImagePlating')]]} />
            <Select value={style} onChange={setStyle} options={[['natural', t('labStyleNatural')], ['brasserie', 'Brasserie'], ['street_food', 'Street food'], ['fine_dining', 'Fine dining'], ['delivery', t('labStyleDelivery')]]} />
            <Select value={angle} onChange={setAngle} options={[['45', '45°'], ['top_down', t('labTopDown')], ['close_up', t('labCloseUp')]]} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('labImageNotes')} className="h-10 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none" />
          </div>

          <Button type="button" size="lg" onClick={generate} disabled={disabled || loading} className="mt-4 w-full sm:w-auto">
            <SparklesIcon />{loading ? t('labImageGenerating') : t('labGenerateImages')}
          </Button>

      {error && <p className="mt-3 text-xs text-[var(--danger-500)]">{error}</p>}
      {images.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          {images.map((image) => (
            <button key={image.generation_id} type="button" onClick={() => confirm(image)} disabled={confirming != null} className="group relative overflow-hidden rounded-[10px] border border-[var(--line)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50">
              <Image src={`data:image/png;base64,${image.image_b64}`} alt={t('labGeneratedDish')} width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
              <span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-[6px] bg-black/75 px-1 py-1.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><CheckIcon className="h-3 w-3" />{confirming === image.generation_id ? t('labSaving') : t('labChooseImage')}</span>
            </button>
          ))}
        </div>
      )}
        </div>
      </div>
    </section>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none">{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
}
