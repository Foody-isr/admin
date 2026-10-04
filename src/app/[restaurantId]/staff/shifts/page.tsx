'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableRow,
} from '@/components/data-table';
import { listStaffShifts, StaffShiftSummary } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';

function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function duration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}`;
}

export default function StaffShiftsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const today = useMemo(() => new Date(), []);
  const initialFrom = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 29);
    return inputDate(date);
  }, [today]);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(inputDate(today));
  const [shifts, setShifts] = useState<StaffShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const load = async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try {
      if (!from || !to || from > to) throw new Error(t('dateRangeRequired'));
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const result = await listStaffShifts(rid, { from: start.toISOString(), to: end.toISOString() });
      if (guard.isCurrent(token)) setShifts(result);
    } catch (cause) {
      if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('failedToLoadShifts'));
    } finally {
      if (guard.isCurrent(token)) setLoading(false);
    }
  };

  useEffect(() => { const guard = requestGuard.current; void load(); return () => guard.invalidate(); }, [rid, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = shifts.reduce(
    (value, shift) => ({
      seconds: value.seconds + shift.duration_seconds,
      orders: value.orders + shift.order_count,
      tables: value.tables + shift.table_count,
      sales: value.sales + shift.sales_total,
    }),
    { seconds: 0, orders: 0, tables: 0, sales: 0 },
  );
  const active = shifts.filter((shift) => !shift.ended_at).length;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('shiftReports')}
        desc={t('shiftReportsDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="md" asChild>
              <Link href={`/${rid}/staff`}><ArrowLeft className="rtl:rotate-180" />{t('back')}</Link>
            </Button>
            <Button variant="secondary" size="md" onClick={() => void load()} disabled={loading}>
              <RefreshCw />{t('refresh')}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-0 flex-1 sm:flex-none text-sm text-fg-secondary">
          <span className="block mb-1">{t('from')}</span>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="min-w-0 flex-1 sm:flex-none text-sm text-fg-secondary">
          <span className="block mb-1">{t('to')}</span>
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {!loading && !error && active > 0 && (
          <div className="ms-auto inline-flex items-center gap-2 rounded-r-md bg-[var(--success-50)] px-3 py-2 text-sm font-medium text-[var(--success-500)]">
            <span className="h-2 w-2 rounded-full bg-current" />
            {t('activeShifts').replace('{count}', String(active))}
          </div>
        )}
      </div>

      {!loading && !error && <dl className="grid grid-cols-2 xl:grid-cols-4 gap-5 rounded-r-lg bg-[var(--summary-bg)] p-5">
        {[[t('workedHours'), duration(totals.seconds)], [t('ordersTaken'), String(totals.orders)], [t('tablesServed'), String(totals.tables)], [t('attributedSales'), money(totals.sales)]].map(([label, value]) => (
          <div key={label} className="min-w-0 space-y-2"><dt className="text-sm text-fg-secondary">{label}</dt><dd className="text-2xl font-semibold tabular-nums break-words text-[var(--summary-fg)]">{value}</dd></div>
        ))}
      </dl>}
      {error && <div role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)] flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>}
      {loading && <p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('loading')}</p>}

      {!loading && !error && <DataTable>
        <DataTableHead>
          <DataTableHeadCell>{t('staffMember')}</DataTableHeadCell>
          <DataTableHeadCell>{t('shiftStart')}</DataTableHeadCell>
          <DataTableHeadCell>{t('shiftEnd')}</DataTableHeadCell>
          <DataTableHeadCell align="right">{t('duration')}</DataTableHeadCell>
          <DataTableHeadCell align="right">{t('ordersTaken')}</DataTableHeadCell>
          <DataTableHeadCell align="right">{t('tablesServed')}</DataTableHeadCell>
          <DataTableHeadCell align="right">{t('attributedSales')}</DataTableHeadCell>
        </DataTableHead>
        <DataTableBody>
          {!loading && shifts.map((shift, index) => (
            <DataTableRow key={shift.id} index={index}>
              <DataTableCell mobilePrimary>
                <div className="font-semibold text-fg-primary">{shift.staff_name}</div>
                <div className="text-xs text-fg-muted">{shift.role_name}</div>
              </DataTableCell>
              <DataTableCell mobileLabel={t('shiftStart')}>{dateTime.format(new Date(shift.started_at))}</DataTableCell>
              <DataTableCell mobileLabel={t('shiftEnd')}>
                {shift.ended_at ? dateTime.format(new Date(shift.ended_at)) : (
                  <span className="text-[var(--success-500)] font-medium">{t('inProgress')}</span>
                )}
              </DataTableCell>
              <DataTableCell align="right" mobileLabel={t('duration')} className="tabular-nums whitespace-nowrap">{duration(shift.duration_seconds)}</DataTableCell>
              <DataTableCell align="right" mobileLabel={t('ordersTaken')} className="tabular-nums">{shift.order_count}</DataTableCell>
              <DataTableCell align="right" mobileLabel={t('tablesServed')} className="tabular-nums">{shift.table_count}</DataTableCell>
              <DataTableCell align="right" mobileLabel={t('attributedSales')} className="tabular-nums">{money(shift.sales_total)}</DataTableCell>
            </DataTableRow>
          ))}
          {!loading && shifts.length === 0 && (
            <DataTableRow index={0}>
              <DataTableCell colSpan={7} className="py-12 text-center text-fg-muted">{t('noShifts')}</DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>}
    </div>
  );
}
