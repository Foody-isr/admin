'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { type OrderSerie } from '@/lib/api';
import { presetRange, seriesInRange, type SerieRange, type SeriePreset } from '@/lib/series';
import { useI18n } from '@/lib/i18n';

const DATE_LOCALES: Record<'en' | 'he' | 'fr', string> = {
  en: 'en-US',
  he: 'he-IL',
  fr: 'fr-FR',
};

/** "vendredi 10 juillet" — parsed at local midnight so the day never shifts. */
function formatSerie(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "10 juil." — compact form for range labels. */
function formatShort(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** Série selector: quick presets (last / last 3 / this month / all) plus a
 *  custom De→À range over the restaurant's séries. Reports a {from,to} range
 *  (from === to for a single série). Presentational — the parent owns the série
 *  list and the selection. Shared by the dashboard and the orders list. */
export default function SeriePicker({
  series,
  value,
  onChange,
  align = 'start',
}: {
  series: OrderSerie[];
  value: SerieRange | null;
  onChange: (sel: SerieRange) => void;
  align?: 'start' | 'end';
}) {
  const { t, locale } = useI18n();
  const dateLocale = DATE_LOCALES[locale];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const count = value ? seriesInRange(series, value).length : 0;
  const label = !value
    ? t('serieNone')
    : value.from === value.to
      ? formatSerie(value.from, dateLocale)
      : `${formatShort(value.from, dateLocale)} – ${formatShort(value.to, dateLocale)}`;

  const applyPreset = (preset: SeriePreset) => {
    const r = presetRange(series, preset, new Date());
    if (r) onChange(r);
    setOpen(false);
  };

  const setFrom = (from: string) => {
    const to = value && value.to >= from ? value.to : from;
    onChange({ from, to });
  };
  const setTo = (to: string) => {
    const from = value && value.from <= to ? value.from : to;
    onChange({ from, to });
  };

  const presets: { key: SeriePreset; label: string }[] = [
    { key: 'last', label: t('serieLast') },
    { key: 'last3', label: t('serieLast3') },
    { key: 'month', label: t('serieMonth') },
    { key: 'all', label: t('serieAll') },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        <span className="font-semibold text-fg-primary capitalize">{label}</span>
        {count > 1 && <span className="text-fg-secondary tabular-nums">· {count}</span>}
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 rounded-standard py-2 min-w-[260px] z-50 shadow-lg ${align === 'end' ? 'end-0' : 'start-0'}`}
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {series.length === 0 ? (
            <div className="px-3 py-2 text-sm text-fg-secondary">{t('serieNone')}</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className="px-2.5 py-1 rounded-standard text-xs text-fg-secondary hover:text-fg-primary transition-colors"
                    style={{ border: '1px solid var(--divider)' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border-t px-3 pt-2 flex flex-col gap-2" style={{ borderColor: 'var(--divider)' }}>
                <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
                  <span className="shrink-0">{t('serieFrom')}</span>
                  <select
                    value={value?.from ?? ''}
                    onChange={(e) => setFrom(e.target.value)}
                    className="input py-1.5 px-2 text-sm capitalize w-full"
                  >
                    {series.map((s) => (
                      <option key={s.date} value={s.date}>
                        {formatSerie(s.date, dateLocale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
                  <span className="shrink-0">{t('serieTo')}</span>
                  <select
                    value={value?.to ?? ''}
                    onChange={(e) => setTo(e.target.value)}
                    className="input py-1.5 px-2 text-sm capitalize w-full"
                  >
                    {series.map((s) => (
                      <option key={s.date} value={s.date}>
                        {formatSerie(s.date, dateLocale)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
