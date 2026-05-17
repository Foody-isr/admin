'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  getQrCardConfig,
  updateQrCardConfig,
  getRestaurant,
  QR_CARD_LOCALES,
  type QrCardConfig,
  type QrCardLocale,
  type QrCardTemplate,
  type QrCardBrandMode,
  type QrCardTexts,
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

const LOCALE_LABELS: Record<QrCardLocale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

const SAMPLE_URL = 'https://app.foody-pos.co.il/r/example/table/A1?sessionId=preview';

export default function CustomizeQrCardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [draft, setDraft] = useState<QrCardConfig | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [restaurantLocale, setRestaurantLocale] = useState<string | undefined>(undefined);
  const [activeLocale, setActiveLocale] = useState<QrCardLocale>('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Per-locale i18n defaults for empty fields, applied at first load if missing.
  const defaultsByLocale = useMemo<Record<QrCardLocale, QrCardTexts>>(
    () => ({
      en: {
        brand_text: 'My restaurant',
        title: 'Order from your phone',
        subtitle: 'No app required',
        step1: 'Open phone camera',
        step2: 'Scan QR code to see menu',
        step3: 'Order & pay',
      },
      he: {
        brand_text: 'המסעדה שלי',
        title: 'הזמינו מהטלפון',
        subtitle: 'ללא צורך באפליקציה',
        step1: 'פתחו את מצלמת הטלפון',
        step2: 'סרקו את קוד ה-QR לתפריט',
        step3: 'הזמינו ושלמו',
      },
      fr: {
        brand_text: 'Mon restaurant',
        title: 'Commandez depuis votre téléphone',
        subtitle: 'Aucune application requise',
        step1: 'Ouvrez l’appareil photo',
        step2: 'Scannez le code QR pour voir le menu',
        step3: 'Commandez et payez',
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getQrCardConfig(rid), getRestaurant(rid).catch(() => null)])
      .then(([cfg, rest]) => {
        if (cancelled) return;
        // Backfill empty locales with defaults so the editor never shows a blank form.
        const filledTexts: QrCardConfig['texts'] = { ...cfg.texts };
        for (const loc of QR_CARD_LOCALES) {
          const cur = filledTexts[loc] ?? {};
          const def = defaultsByLocale[loc];
          filledTexts[loc] = {
            brand_text: cur.brand_text || def.brand_text,
            title: cur.title || def.title,
            subtitle: cur.subtitle || def.subtitle,
            step1: cur.step1 || def.step1,
            step2: cur.step2 || def.step2,
            step3: cur.step3 || def.step3,
          };
        }
        setDraft({ ...cfg, texts: filledTexts });
        if (rest?.logo_url) setLogoUrl(rest.logo_url);
        const restLoc = rest?.default_locale;
        if (restLoc) {
          setRestaurantLocale(restLoc);
          if (restLoc === 'en' || restLoc === 'he' || restLoc === 'fr') {
            setActiveLocale(restLoc);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, defaultsByLocale]);

  const setVisual = <K extends keyof QrCardConfig>(key: K, value: QrCardConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setText = (field: keyof QrCardTexts, value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const cur = prev.texts[activeLocale] ?? {};
      return {
        ...prev,
        texts: {
          ...prev.texts,
          [activeLocale]: { ...cur, [field]: value },
        },
      };
    });
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
        texts: draft.texts,
      });
      // Merge with existing filled defaults so the editor doesn't show blanks
      // if the server stripped omitted fields.
      const merged: QrCardConfig['texts'] = { ...saved.texts };
      for (const loc of QR_CARD_LOCALES) {
        const cur = merged[loc] ?? {};
        const def = defaultsByLocale[loc];
        merged[loc] = {
          brand_text: cur.brand_text || def.brand_text,
          title: cur.title || def.title,
          subtitle: cur.subtitle || def.subtitle,
          step1: cur.step1 || def.step1,
          step2: cur.step2 || def.step2,
          step3: cur.step3 || def.step3,
        };
      }
      setDraft({ ...saved, texts: merged });
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
      texts: {
        en: { ...defaultsByLocale.en },
        he: { ...defaultsByLocale.he },
        fr: { ...defaultsByLocale.fr },
      },
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
  const localeTexts = draft.texts[activeLocale] ?? {};

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
                    onClick={() => setVisual('template', opt.id)}
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
                onChange={(v) => setVisual('background_color', v)}
              />
              <ColorRow
                label={t('textAccent')}
                value={draft.text_color}
                onChange={(v) => setVisual('text_color', v)}
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
                    onClick={() => setVisual('brand_mode', m)}
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
          </Field>

          {/* Language tabs */}
          <div>
            <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-2">
              {t('language')}
            </div>
            <div className="flex gap-1 p-0.5 bg-[var(--bg-subtle)] rounded-md">
              {QR_CARD_LOCALES.map((loc) => {
                const active = activeLocale === loc;
                return (
                  <button
                    key={loc}
                    onClick={() => setActiveLocale(loc)}
                    className={
                      'flex-1 px-2 py-1.5 rounded text-fs-xs font-medium transition-colors ' +
                      (active
                        ? 'bg-[var(--bg)] shadow text-fg-primary'
                        : 'text-fg-secondary')
                    }
                    dir={loc === 'he' ? 'rtl' : 'ltr'}
                  >
                    {LOCALE_LABELS[loc]}
                  </button>
                );
              })}
            </div>
            <p className="text-fs-xs text-[var(--fg-subtle)] mt-1.5">
              {t('qrEditLanguageHint')}
            </p>
          </div>

          {draft.brand_mode === 'text' && (
            <Field label={t('qrBrandTextLabel')}>
              <Input
                value={localeTexts.brand_text ?? ''}
                onChange={(e) => setText('brand_text', e.target.value)}
                placeholder={defaultsByLocale[activeLocale].brand_text}
                dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
              />
            </Field>
          )}

          <Field label={t('title')}>
            <Input
              value={localeTexts.title ?? ''}
              onChange={(e) => setText('title', e.target.value)}
              placeholder={defaultsByLocale[activeLocale].title}
              dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
            />
          </Field>

          <Field label={t('subtitle')}>
            <Input
              value={localeTexts.subtitle ?? ''}
              onChange={(e) => setText('subtitle', e.target.value)}
              placeholder={defaultsByLocale[activeLocale].subtitle}
              dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
            />
          </Field>

          <Field label={t('qrSteps')}>
            <div className="space-y-2">
              <Input
                value={localeTexts.step1 ?? ''}
                onChange={(e) => setText('step1', e.target.value)}
                placeholder={defaultsByLocale[activeLocale].step1}
                dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
              />
              <Input
                value={localeTexts.step2 ?? ''}
                onChange={(e) => setText('step2', e.target.value)}
                placeholder={defaultsByLocale[activeLocale].step2}
                dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
              />
              <Input
                value={localeTexts.step3 ?? ''}
                onChange={(e) => setText('step3', e.target.value)}
                placeholder={defaultsByLocale[activeLocale].step3}
                dir={activeLocale === 'he' ? 'rtl' : 'ltr'}
              />
            </div>
          </Field>
        </div>

        <div className="card p-[var(--s-5)] flex flex-col items-center gap-[var(--s-4)] bg-[var(--bg-subtle)]">
          <div className="text-fs-xs uppercase tracking-wide text-fg-secondary font-semibold">
            {t('livePreview')} · {LOCALE_LABELS[activeLocale]}
          </div>
          <QrCard
            config={draft}
            url={SAMPLE_URL}
            tableLabel={`${t('previewSection')} · ${t('previewTable')}`}
            logoUrl={logoUrl}
            locale={activeLocale}
            restaurantDefaultLocale={restaurantLocale}
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
