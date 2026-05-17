'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  getQrCardConfig,
  updateQrCardConfig,
  getRestaurant,
  type QrCardConfig,
  type QrCardTemplate,
  type QrCardBrandMode,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Input, PageHead, Field } from '@/components/ds';
import { QrCard, contrastRatio, TEMPLATE_SIZES } from '@/components/qr/QrCard';

const TEMPLATE_OPTIONS: {
  id: QrCardTemplate;
  labelKey: 'qrTplCompact' | 'qrTplWide' | 'qrTplTall';
  sizeKey: 'qrSizeCompact' | 'qrSizeWide' | 'qrSizeTall';
}[] = [
  { id: 'compact', labelKey: 'qrTplCompact', sizeKey: 'qrSizeCompact' },
  { id: 'wide', labelKey: 'qrTplWide', sizeKey: 'qrSizeWide' },
  { id: 'tall', labelKey: 'qrTplTall', sizeKey: 'qrSizeTall' },
];

const SAMPLE_URL = 'https://app.foody-pos.co.il/r/example/table/A1?sessionId=preview';

export default function CustomizeQrCardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [draft, setDraft] = useState<QrCardConfig | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // i18n-aware defaults for empty text fields, applied once on load.
  const defaults = useMemo(
    () => ({
      brand_text: t('qrDefaultBrand'),
      title: t('qrDefaultTitle'),
      subtitle: t('qrDefaultSubtitle'),
      step1: t('qrDefaultStep1'),
      step2: t('qrDefaultStep2'),
      step3: t('qrDefaultStep3'),
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getQrCardConfig(rid), getRestaurant(rid).catch(() => null)])
      .then(([cfg, rest]) => {
        if (cancelled) return;
        const filled: QrCardConfig = {
          ...cfg,
          brand_text: cfg.brand_text || defaults.brand_text,
          title: cfg.title || defaults.title,
          subtitle: cfg.subtitle || defaults.subtitle,
          step1: cfg.step1 || defaults.step1,
          step2: cfg.step2 || defaults.step2,
          step3: cfg.step3 || defaults.step3,
        };
        setDraft(filled);
        if (rest?.logo_url) setLogoUrl(rest.logo_url);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, defaults]);

  const setField = <K extends keyof QrCardConfig>(key: K, value: QrCardConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await updateQrCardConfig(rid, {
        template: draft.template,
        background_color: draft.background_color,
        text_color: draft.text_color,
        brand_mode: draft.brand_mode,
        brand_text: draft.brand_text,
        title: draft.title,
        subtitle: draft.subtitle,
        step1: draft.step1,
        step2: draft.step2,
        step3: draft.step3,
      });
      setDraft({
        ...saved,
        brand_text: saved.brand_text || defaults.brand_text,
        title: saved.title || defaults.title,
        subtitle: saved.subtitle || defaults.subtitle,
        step1: saved.step1 || defaults.step1,
        step2: saved.step2 || defaults.step2,
        step3: saved.step3 || defaults.step3,
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      template: 'compact',
      background_color: '#ffffff',
      text_color: '#1a1a1a',
      brand_mode: 'text',
      brand_text: defaults.brand_text,
      title: defaults.title,
      subtitle: defaults.subtitle,
      step1: defaults.step1,
      step2: defaults.step2,
      step3: defaults.step3,
    });
  };

  if (loading || !draft) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const ratio = contrastRatio(draft.background_color, draft.text_color);
  const lowContrast = ratio < 4.5;

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('qrCustomizeTitle')}
        desc={t('qrCustomizeDesc')}
        actions={
          <>
            <Link href={`/${rid}/restaurant/table-qr`}>
              <Button variant="ghost" size="md">
                <ArrowLeft />
                {t('back')}
              </Button>
            </Link>
            <Button variant="secondary" size="md" onClick={handleReset}>
              <RotateCcw />
              {t('resetToDefaults')}
            </Button>
            <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
              {savedAt && Date.now() - savedAt < 2000 ? <Check /> : null}
              {saving ? t('saving') : t('save')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-[var(--s-5)]">
        <div className="card p-[var(--s-5)] space-y-[var(--s-4)]">
          <Field label={t('template')}>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATE_OPTIONS.map((opt) => {
                const active = draft.template === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setField('template', opt.id)}
                    className={
                      'px-2 py-2 rounded-md border text-fs-xs font-medium transition-colors flex flex-col items-center gap-0.5 ' +
                      (active
                        ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]'
                        : 'border-[var(--line)] hover:border-[var(--brand-500)]')
                    }
                  >
                    <span>{t(opt.labelKey)}</span>
                    <span className="text-[10px] opacity-60 font-normal">{t(opt.sizeKey)}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t('qrColors')}>
            <div className="flex flex-col gap-3">
              <ColorRow
                label={t('background')}
                value={draft.background_color}
                onChange={(v) => setField('background_color', v)}
              />
              <ColorRow
                label={t('textAccent')}
                value={draft.text_color}
                onChange={(v) => setField('text_color', v)}
              />
            </div>
            {lowContrast && (
              <div className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-50 text-amber-800 text-fs-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('lowContrastWarning')}</span>
              </div>
            )}
          </Field>

          <Field label={t('brand')}>
            <div className="flex gap-1 p-0.5 bg-[var(--bg-subtle)] rounded-md mb-2">
              {(['text', 'logo'] as QrCardBrandMode[]).map((m) => {
                const active = draft.brand_mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setField('brand_mode', m)}
                    disabled={m === 'logo' && !logoUrl}
                    className={
                      'flex-1 px-2 py-1.5 rounded text-fs-xs font-medium transition-colors ' +
                      (active
                        ? 'bg-[var(--bg)] shadow text-fg-primary'
                        : 'text-fg-secondary disabled:opacity-40 disabled:cursor-not-allowed')
                    }
                  >
                    {m === 'text' ? t('brandText') : t('brandLogo')}
                  </button>
                );
              })}
            </div>
            {draft.brand_mode === 'text' ? (
              <Input
                value={draft.brand_text}
                onChange={(e) => setField('brand_text', e.target.value)}
                placeholder={defaults.brand_text}
              />
            ) : logoUrl ? (
              <div className="p-2 border rounded text-center bg-white">
                <img src={logoUrl} alt="logo" className="max-h-12 mx-auto object-contain" />
              </div>
            ) : (
              <p className="text-fs-xs text-fg-secondary">{t('noLogoUploadedHint')}</p>
            )}
          </Field>

          <Field label={t('title')}>
            <Input
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={defaults.title}
            />
          </Field>

          <Field label={t('subtitle')}>
            <Input
              value={draft.subtitle}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder={defaults.subtitle}
            />
          </Field>

          <Field label={t('qrSteps')}>
            <div className="space-y-2">
              <Input value={draft.step1} onChange={(e) => setField('step1', e.target.value)} placeholder={defaults.step1} />
              <Input value={draft.step2} onChange={(e) => setField('step2', e.target.value)} placeholder={defaults.step2} />
              <Input value={draft.step3} onChange={(e) => setField('step3', e.target.value)} placeholder={defaults.step3} />
            </div>
          </Field>
        </div>

        <div className="card p-[var(--s-5)] flex flex-col items-center gap-[var(--s-4)] bg-[var(--bg-subtle)]">
          <div className="text-fs-xs uppercase tracking-wide text-fg-secondary font-semibold">
            {t('livePreview')}
          </div>
          <QrCard
            config={draft}
            url={SAMPLE_URL}
            tableLabel={`${t('previewSection')} · ${t('previewTable')}`}
            logoUrl={logoUrl}
            labels={{ poweredBy: t('poweredByFoody') }}
            width={draft.template === 'wide' ? 440 : 300}
          />
          <div className="text-fs-xs text-fg-secondary">
            {TEMPLATE_SIZES[draft.template].wMm} × {TEMPLATE_SIZES[draft.template].hMm} mm
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded border border-[var(--line)] cursor-pointer"
      />
      <div className="flex-1">
        <div className="text-fs-xs text-fg-secondary mb-0.5">{label}</div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 border border-[var(--line)] rounded text-fs-sm font-mono"
        />
      </div>
    </div>
  );
}
