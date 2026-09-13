'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button, Kpi, PageHead } from '@/components/ds';
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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      setShifts(await listStaffShifts(rid, { from: start.toISOString(), to: end.toISOString() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failedToLoadShifts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [rid, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" asChild>
              <Link href={`/${rid}/staff`}><ArrowLeft />{t('back')}</Link>
            </Button>
            <Button variant="secondary" size="md" onClick={() => void load()} disabled={loading}>
              <RefreshCw />{t('refresh')}
            </Button>
          </div>
        }
      />

      <div className="card p-4 flex flex-wrap items-end gap-4">
        <label className="text-sm text-fg-secondary">
          <span className="block mb-1">{t('from')}</span>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm text-fg-secondary">
          <span className="block mb-1">{t('to')}</span>
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {active > 0 && (
          <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-2 text-sm font-medium text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {t('activeShifts').replace('{count}', String(active))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('workedHours')} value={duration(totals.seconds)} />
        <Kpi label={t('ordersTaken')} value={String(totals.orders)} />
        <Kpi label={t('tablesServed')} value={String(totals.tables)} />
        <Kpi label={t('attributedSales')} value={money(totals.sales)} />
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <DataTable>
        <DataTableHead>
          <DataTableHeadCell>{t('staffMember')}</DataTableHeadCell>
          <DataTableHeadCell>{t('shiftStart')}</DataTableHeadCell>
          <DataTableHeadCell>{t('shiftEnd')}</DataTableHeadCell>
          <DataTableHeadCell>{t('duration')}</DataTableHeadCell>
          <DataTableHeadCell>{t('ordersTaken')}</DataTableHeadCell>
          <DataTableHeadCell>{t('tablesServed')}</DataTableHeadCell>
          <DataTableHeadCell>{t('attributedSales')}</DataTableHeadCell>
        </DataTableHead>
        <DataTableBody>
          {!loading && shifts.map((shift, index) => (
            <DataTableRow key={shift.id} index={index}>
              <DataTableCell>
                <div className="font-medium text-fg-primary">{shift.staff_name}</div>
                <div className="text-xs text-fg-muted">{shift.role_name}</div>
              </DataTableCell>
              <DataTableCell>{dateTime.format(new Date(shift.started_at))}</DataTableCell>
              <DataTableCell>
                {shift.ended_at ? dateTime.format(new Date(shift.ended_at)) : (
                  <span className="text-green-600 font-medium">{t('inProgress')}</span>
                )}
              </DataTableCell>
              <DataTableCell>{duration(shift.duration_seconds)}</DataTableCell>
              <DataTableCell>{shift.order_count}</DataTableCell>
              <DataTableCell>{shift.table_count}</DataTableCell>
              <DataTableCell>{money(shift.sales_total)}</DataTableCell>
            </DataTableRow>
          ))}
          {!loading && shifts.length === 0 && (
            <DataTableRow index={0}>
              <DataTableCell colSpan={7} className="py-12 text-center text-fg-muted">{t('noShifts')}</DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
