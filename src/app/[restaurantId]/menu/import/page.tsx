'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  importMenuAI, confirmMenuImport,
  MenuExtraction,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { SparklesIcon } from 'lucide-react';

export default function AIImportPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t, locale } = useI18n();

  const [step, setStep] = useState<'upload' | 'review' | 'importing'>('upload');
  const [extraction, setExtraction] = useState<MenuExtraction | null>(null);
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setExtracting(true);
    try {
      const result = await importMenuAI(rid, file, locale);
      setExtraction(result);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!extraction) return;
    setConfirming(true);
    try {
      await confirmMenuImport(rid, extraction);
      router.push(`/${restaurantId}/menu/items`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create menu');
    } finally {
      setConfirming(false);
    }
  };

  const totalItems = extraction?.categories.reduce((sum, c) => sum + c.items.length, 0) ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            {t('uploadMenuAI')}
          </p>

          <div
            className="flex flex-col items-center justify-center py-16 rounded-card cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            style={{ border: '2px dashed var(--divider)' }}
            onClick={() => fileRef.current?.click()}
          >
            {extracting ? (
              <>
                <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mb-3" />
                <p className="text-sm text-fg-secondary">{t('analyzingMenuAI')}</p>
              </>
            ) : (
              <>
                <SparklesIcon className="w-10 h-10 text-brand-500 mb-3" />
                <p className="text-sm font-medium text-fg-primary">{t('clickToUpload')}</p>
                <p className="text-xs text-fg-secondary mt-1">{t('imageFormats')}</p>
              </>
            )}
          </div>

          <input ref={fileRef} type="file" className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}

      {step === 'review' && extraction && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary"
            dangerouslySetInnerHTML={{
              __html: t('foundCategoriesItems')
                .replace('{categories}', `<strong>${extraction.categories.length}</strong>`)
                .replace('{items}', `<strong>${totalItems}</strong>`),
            }}
          />

          <div className="max-h-96 overflow-y-auto space-y-4">
            {extraction.categories.map((cat, ci) => (
              <div key={ci}>
                <h4 className="text-sm font-bold text-fg-primary mb-2">{cat.name}</h4>
                <div className="space-y-1">
                  {cat.items.map((item, ii) => (
                    <div key={ii} className="flex items-center justify-between text-sm py-2 px-3 rounded"
                      style={{ background: 'var(--surface-subtle)' }}>
                      <span className="text-fg-primary">{item.name}</span>
                      <span className="text-fg-secondary">₪{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => { setStep('upload'); setExtraction(null); }}>
              {t('reUpload')}
            </button>
            <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
              {confirming ? t('creating') : t('importItems').replace('{count}', String(totalItems))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
