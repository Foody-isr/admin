'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { Button, Input, Field } from '@/components/ds';
import { getSeriesCommitments, moveSeriesDay, type FulfillmentSeries } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ordersSeriesPath } from '@/lib/orders/routes';

/** Reviews the existing orders and changes the advertised day for a single lot. */
export function SeriesDayEditor({ restaurantId, series, today, onCancel, onSaved }: {
  restaurantId: number;
  series: FulfillmentSeries;
  today: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const dates = series.days.filter(day => day.date >= today);
  const [from, setFrom] = useState(dates[0]?.date ?? '');
  const [to, setTo] = useState('');
  const [commitments, setCommitments] = useState<{ day: string; count: number }>();
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!from) return;
    let active = true;
    setFailure(false);
    getSeriesCommitments(restaurantId, series.key, from).then(({ order_count }) => {
      if (active) setCommitments({ day: from, count: order_count });
    }).catch(() => { if (active) setFailure(true); });
    return () => { active = false; };
  }, [restaurantId, series.key, from]);

  const count = commitments?.day === from ? commitments.count : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (count === undefined || !to || to === from || saving) return;
    setSaving(true);
    setFailure(false);
    try {
      await moveSeriesDay(restaurantId, series.key, { from, to, revision: series.revision, order_count: count });
      onSaved();
    } catch {
      setFailure(true);
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={submit} className="grid gap-3 p-4 sm:w-[338px]">
    <Field label={t('dateSeriesMoveFrom')}>
      <select value={from} disabled={saving} onChange={event => setFrom(event.target.value)}
        className="h-10 w-full rounded-standard border border-[var(--divider)] bg-[var(--surface)] px-2">
        {dates.map(day => <option key={day.date} value={day.date}>
          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(day.date + 'T00:00:00'))}
        </option>)}
      </select>
    </Field>
    <Field label={t('dateSeriesMoveTo')}>
      <Input required type="date" min={today} value={to} disabled={saving} onChange={event => setTo(event.target.value)} />
    </Field>
    {!!count && <p className="text-sm text-fg-secondary">
      {t('dateSeriesMoveCommitments').replace('{n}', String(count))}{' '}
      <Link href={ordersSeriesPath(restaurantId, series.key, from)} className="underline" target="_blank">
        {t('dateSeriesViewOrders')}
      </Link>
    </p>}
    {failure && <p role="alert" className="text-sm text-[var(--danger-600)]">{t('dateSeriesMoveFailed')}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>{t('cancel')}</Button>
      <Button type="submit" disabled={count === undefined || !to || from === to || saving}>{t('dateSeriesMove')}</Button>
    </div>
  </form>;
}
