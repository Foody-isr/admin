'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { CheckIcon, ImageIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { labConfirmImage, labGenerateImage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import styles from '../workspace.module.css';
import type { DraftImageResult, DraftPayload } from '../types';

/** Generate reviewable image options and confirm one against the saved recipe revision. */
export function ImageStudio({ restaurantId, draftId, currentImage, disabled, runAction, onConfirmed }: {
  restaurantId: number;
  draftId: number;
  currentImage?: string;
  disabled?: boolean;
  runAction: <T>(task: (canonical: DraftPayload) => Promise<T>) => Promise<T>;
  onConfirmed: (url: string, canonical: DraftPayload) => void;
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

  const lock = useRef(false);
  const generate = async () => {
    if (disabled || lock.current) return;
    lock.current = true;
    setLoading(true);
    setError(null);
    try {
      await runAction(async () => {
        const results = await Promise.allSettled(Array.from({ length: 3 }, () => labGenerateImage(restaurantId, draftId, { kind, style, angle, additional_notes: notes })));
        const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        setImages(successful);
        if (successful.length !== 3) setError(t('labImagePartial').replace('{count}', String(successful.length)));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('labImageFailed'));
    } finally {
      lock.current = false; setLoading(false);
    }
  };

  const confirm = async (image: DraftImageResult) => {
    if (disabled || lock.current) return;
    lock.current = true;
    setConfirming(image.generation_id);
    setError(null);
    try {
      await runAction(async canonical => {
        if (canonical.revision !== image.recipe_revision) throw new Error(t('labImageStale'));
        const result = await labConfirmImage(restaurantId, draftId, { generation_id: image.generation_id, image_b64: image.image_b64 });
        onConfirmed(result.image_url, canonical);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('labImageFailed'));
    } finally {
      lock.current = false; setConfirming(null);
    }
  };

  return (
    <section className={`${styles.container} overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]`}>
      <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--fg)]"><ImageIcon className="h-4 w-4 text-[var(--brand-ink)]" />{t('labImageStudio')}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{t('labImageHelp')}</p>
      </div>

      <div className={`${styles.imageLayout} p-4 sm:p-6`}>
        {currentImage ? (
          <Image src={currentImage} alt={t('labGeneratedDish')} width={640} height={640} unoptimized className="mx-auto aspect-square w-full max-w-[320px] rounded-[8px] object-cover" />
        ) : (
          <div className="mx-auto flex aspect-square w-full max-w-[320px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-center">
            <ImageIcon className="h-7 w-7 text-[var(--fg-subtle)]" />
            <p className="mt-2 px-4 text-xs leading-5 text-[var(--fg-muted)]">{t('labImageEmpty')}</p>
          </div>
        )}

        <div className="min-w-0">
          <div className={styles.imageControls}>
            <Select label={t('labImageKind')} disabled={disabled || loading || confirming != null} value={kind} onChange={(v) => setKind(v as 'commercial' | 'plating')} options={[['commercial', t('labImageCommercial')], ['plating', t('labImagePlating')]]} />
            <Select label={t('labImageStyle')} disabled={disabled || loading || confirming != null} value={style} onChange={setStyle} options={[['natural', t('labStyleNatural')], ['brasserie', 'Brasserie'], ['street_food', 'Street food'], ['fine_dining', 'Fine dining'], ['delivery', t('labStyleDelivery')]]} />
            <Select label={t('labImageAngle')} disabled={disabled || loading || confirming != null} value={angle} onChange={setAngle} options={[['45', '45°'], ['top_down', t('labTopDown')], ['close_up', t('labCloseUp')]]} />
            <label className="block min-w-0 text-sm"><span className="mb-1 block text-[var(--fg-muted)]">{t('labImageNotes')}</span><input aria-label={t('labImageNotes')} dir="auto" disabled={disabled || loading || confirming != null} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('labImageNotes')} className="h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none sm:h-11 sm:text-sm" /></label>
          </div>

          <Button type="button" size="lg" onClick={generate} disabled={disabled || loading || confirming != null} className="mt-4 w-full sm:w-auto">
            <SparklesIcon />{loading ? t('labImageGenerating') : t('labGenerateImages')}
          </Button>

      {error && <p role="alert" className="mt-3 text-xs text-[var(--danger-500)]">{error}</p>}
      {images.length > 0 && (
        <div className={`${styles.generatedImages} mt-5`}>
          {images.map((image, index) => (
            <button key={image.generation_id} type="button" aria-label={`${t('labChooseImage')} ${index+1}`} onClick={() => confirm(image)} disabled={disabled || loading || confirming != null} className="group relative overflow-hidden rounded-[8px] border border-[var(--line)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50">
              <Image src={`data:image/png;base64,${image.image_b64}`} alt={t('labGeneratedDish')} width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
              <span className=" flex items-center justify-center gap-1 rounded-[6px] bg-black/75 px-1 py-1.5 min-h-11 text-sm text-white"><CheckIcon className="h-3 w-3" />{confirming === image.generation_id ? t('labSaving') : t('labChooseImage')}</span>
            </button>
          ))}
        </div>
      )}
        </div>
      </div>
    </section>
  );
}

function Select({ label, disabled, value, onChange, options }: { label: string; disabled: boolean; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block min-w-0 text-sm"><span className="mb-1 block text-[var(--fg-muted)]">{label}</span><select aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none sm:h-11 sm:text-sm">{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>;
}
