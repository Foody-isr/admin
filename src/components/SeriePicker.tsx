'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { fetchOrderSeries, type OrderSerie } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const DATE_LOCALES: Record<'en' | 'he' | 'fr', string> = {
  en: 'en-US',
  he: 'he-IL',
  fr: 'fr-FR',
};

/** Formats an ISO date (YYYY-MM-DD) as a human série label, e.g.
 *  "vendredi 10 juillet". Parsed at local midnight so the day never shifts. */
function formatSerie(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Dropdown listing a restaurant's séries (scheduled_for fulfillment dates),
 *  reporting the picked date (YYYY-MM-DD). Used by the dashboard and the orders
 *  list when the date basis is "série". On first load, auto-selects the current
 *  série — the next upcoming one (date >= today), else the most recent. */
export default function SeriePicker({
  restaurantId,
  value,
  onChange,
  align = 'start',
}: {
  restaurantId: number;
  value: string | null;
  onChange: (serieDate: string) => void;
  align?: 'start' | 'end';
}) {
  const { t, locale } = useI18n();
  const dateLocale = DATE_LOCALES[locale];
  const [series, setSeries] = useState<OrderSerie[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    fetchOrderSeries(restaurantId)
      .then((list) => {
        if (!active) return;
        setSeries(list);
        // Auto-select the current série when nothing is chosen yet.
        if (!value && list.length) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          // list is newest→oldest; scan oldest→newest for the first date >= today.
          const upcoming = [...list].reverse().find((s) => new Date(`${s.date}T00:00:00`) >= today);
          onChange((upcoming ?? list[0]).date);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayLabel = value ? formatSerie(value, dateLocale) : t('serieNone');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        <span className="font-semibold text-fg-primary capitalize">{displayLabel}</span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 rounded-standard py-1 min-w-[220px] max-h-[320px] overflow-auto z-50 shadow-lg ${align === 'end' ? 'end-0' : 'start-0'}`}
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {series.length === 0 ? (
            <div className="px-3 py-2 text-sm text-fg-secondary">{t('serieNone')}</div>
          ) : (
            series.map((s) => (
              <button
                key={s.date}
                onClick={() => {
                  onChange(s.date);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                  value === s.date
                    ? 'text-brand-500 font-medium'
                    : 'text-fg-primary hover:bg-[var(--surface-2)]'
                }`}
              >
                <span className="capitalize">{formatSerie(s.date, dateLocale)}</span>
                <span className="text-fg-secondary tabular-nums">{s.order_count}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
