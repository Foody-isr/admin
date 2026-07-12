'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, RotateCcw } from 'lucide-react';
import {
  uploadWebsiteFont,
  type ExtraFont,
  type QrCardLocale,
  type QrCardTypography,
  type QrSectionKey,
  type QrSectionStyle,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { FontSelect } from '@/components/website-menu/FontSelect';
import {
  familySupportsHebrew,
  nearestWeight,
  QR_SECTIONS,
  SIZE_MULT_MAX,
  SIZE_MULT_MIN,
  TRACKING_MAX,
  TRACKING_MIN,
  weightsFor,
} from '@/lib/qr/typography';
import { WEIGHT_LABELS } from '@/lib/website-fonts';

type SectionLabelKey = 'brand' | 'title' | 'subtitle' | 'qrSteps' | 'qrSectionTable';

const SECTION_LABELS: Record<QrSectionKey, SectionLabelKey> = {
  brand: 'brand',
  title: 'title',
  subtitle: 'subtitle',
  steps: 'qrSteps',
  table: 'qrSectionTable',
};

const CASE_OPTIONS: { value: QrSectionStyle['transform']; labelKey: 'qrCaseAuto' | 'qrCaseUpper' | 'qrCaseCapitalize' | 'qrCaseNormal' }[] = [
  { value: undefined, labelKey: 'qrCaseAuto' },
  { value: 'uppercase', labelKey: 'qrCaseUpper' },
  { value: 'capitalize', labelKey: 'qrCaseCapitalize' },
  { value: 'none', labelKey: 'qrCaseNormal' },
];

/**
 * Per-section text styling for the QR card: font, size, weight, colour, case
 * and letter-spacing for each of the five text sections.
 *
 * The styling is shared by all four templates — each template scales it against
 * its own card width, so one config stays balanced from the 90mm round sticker
 * to the 178mm poster.
 */
export function QrTypographyPanel({
  restaurantId,
  typography,
  textColor,
  activeLocale,
  onChange,
}: {
  restaurantId: number;
  typography: QrCardTypography | null | undefined;
  /** The card's global text colour — shown as the fallback each section inherits. */
  textColor: string;
  /** Locale being previewed; drives the Hebrew-coverage warning. */
  activeLocale: QrCardLocale;
  onChange: (next: QrCardTypography) => void;
}) {
  const { t } = useI18n();
  const [openSection, setOpenSection] = useState<QrSectionKey | null>(null);

  const extraFonts = typography?.extraFonts ?? [];

  const patchSection = (key: QrSectionKey, patch: Partial<QrSectionStyle>) => {
    const sections = { ...(typography?.sections ?? {}) };
    const next: QrSectionStyle = { ...(sections[key] ?? {}), ...patch };
    // An explicitly-undefined field means "back to the template default".
    for (const k of Object.keys(patch) as (keyof QrSectionStyle)[]) {
      if (patch[k] === undefined) delete next[k];
    }
    if (Object.keys(next).length === 0) delete sections[key];
    else sections[key] = next;
    onChange({ ...typography, sections });
  };

  const resetSection = (key: QrSectionKey) => {
    const sections = { ...(typography?.sections ?? {}) };
    delete sections[key];
    onChange({ ...typography, sections });
  };

  /** Remember a font the restaurant just picked, so its weights and Hebrew
   *  coverage are known on the next load without re-querying the catalog. */
  const rememberFont = (picked?: ExtraFont) => {
    if (!picked) return extraFonts;
    if (extraFonts.some((f) => f.family === picked.family)) return extraFonts;
    return [...extraFonts, picked];
  };

  const pickFont = (key: QrSectionKey, family: string, picked?: ExtraFont) => {
    const nextFonts = rememberFont(picked);
    const sections = { ...(typography?.sections ?? {}) };
    const cur: QrSectionStyle = { ...(sections[key] ?? {}) };

    if (family) cur.font = family;
    else delete cur.font;

    // A family may not ship the currently-selected weight; snapping avoids the
    // browser synthesizing a faux-bold, which prints badly.
    if (typeof cur.weight === 'number') {
      const avail = weightsFor(family || undefined, nextFonts);
      if (!avail.includes(cur.weight)) cur.weight = nearestWeight(avail, cur.weight);
    }

    if (Object.keys(cur).length === 0) delete sections[key];
    else sections[key] = cur;
    onChange({ ...typography, sections, extraFonts: nextFonts });
  };

  return (
    <div className="space-y-1.5">
      {QR_SECTIONS.map((key) => {
        const style = typography?.sections?.[key];
        const isOpen = openSection === key;
        const customized = !!style && Object.keys(style).length > 0;
        const weights = weightsFor(style?.font, extraFonts);
        const hebrewGap =
          activeLocale === 'he' && !familySupportsHebrew(style?.font, extraFonts);

        return (
          <div
            key={key}
            className="border border-[var(--line)] rounded-md overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenSection(isOpen ? null : key)}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-fs-xs font-medium hover:bg-[var(--surface-hover)] transition-colors"
            >
              <ChevronDown
                className={'w-3.5 h-3.5 shrink-0 transition-transform ' + (isOpen ? '' : '-rotate-90')}
              />
              <span className="flex-1 text-start">{t(SECTION_LABELS[key])}</span>
              {hebrewGap && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              {customized && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-500)] shrink-0" />
              )}
            </button>

            {isOpen && (
              <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 border-t border-[var(--line)]">
                <FontSelect
                  value={style?.font ?? ''}
                  onChange={(family, picked) => pickFont(key, family, picked)}
                  extraFonts={extraFonts}
                  defaultLabel={t('qrFontDefault')}
                  onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
                />

                {hebrewGap && (
                  <div className="flex items-start gap-1.5 p-1.5 rounded bg-amber-50 text-amber-800 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>{t('qrFontNoHebrew')}</span>
                  </div>
                )}

                <div className="flex gap-1.5">
                  <select
                    value={style?.weight ?? ''}
                    onChange={(e) =>
                      patchSection(key, {
                        weight: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] text-fs-xs"
                    style={style?.weight ? { fontWeight: style.weight } : undefined}
                  >
                    <option value="">{t('qrCaseAuto')}</option>
                    {weights.map((w) => (
                      <option key={w} value={w} style={{ fontWeight: w }}>
                        {WEIGHT_LABELS[w] ?? w}
                      </option>
                    ))}
                  </select>

                  <select
                    value={style?.transform ?? ''}
                    onChange={(e) =>
                      patchSection(key, {
                        transform: (e.target.value || undefined) as QrSectionStyle['transform'],
                      })
                    }
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] text-fs-xs"
                  >
                    {CASE_OPTIONS.map((o) => (
                      <option key={o.labelKey} value={o.value ?? ''}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>

                <Slider
                  label={t('qrFontSize')}
                  display={`${Math.round((style?.sizeMult ?? 1) * 100)}%`}
                  min={SIZE_MULT_MIN}
                  max={SIZE_MULT_MAX}
                  step={0.05}
                  value={style?.sizeMult ?? 1}
                  onChange={(v) => patchSection(key, { sizeMult: v === 1 ? undefined : v })}
                />

                <Slider
                  label={t('qrLetterSpacing')}
                  display={`${(style?.tracking ?? 0).toFixed(2)}em`}
                  min={TRACKING_MIN}
                  max={TRACKING_MAX}
                  step={0.01}
                  value={style?.tracking ?? 0}
                  onChange={(v) => patchSection(key, { tracking: v === 0 ? undefined : v })}
                />

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style?.color || textColor}
                    onChange={(e) => patchSection(key, { color: e.target.value })}
                    className="w-8 h-8 rounded border border-[var(--line)] cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-fg-secondary mb-0.5">{t('qrTextColor')}</div>
                    <input
                      type="text"
                      value={style?.color ?? ''}
                      onChange={(e) => patchSection(key, { color: e.target.value || undefined })}
                      placeholder={textColor}
                      className="w-full px-2 py-1 border border-[var(--line)] rounded text-fs-xs font-mono"
                    />
                  </div>
                  {style?.color && (
                    <button
                      type="button"
                      onClick={() => patchSection(key, { color: undefined })}
                      className="text-[11px] text-fg-secondary hover:text-fg-primary underline shrink-0"
                    >
                      {t('qrInherit')}
                    </button>
                  )}
                </div>

                {customized && (
                  <button
                    type="button"
                    onClick={() => resetSection(key)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line)] text-[11px] hover:bg-[var(--surface-hover)] transition w-full justify-center"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('resetToDefaults')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-fg-secondary mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
