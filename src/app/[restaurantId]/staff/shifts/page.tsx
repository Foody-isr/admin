'use client';

import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ListFilter } from 'lucide-react';
import { Button } from '@/components/ds';
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
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);

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
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(inputDate(today));
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

  const statusOptions = [{ value: 'active', label: t('inProgress') }, { value: 'ended', label: t('completed') }];
  const groupOptions = Array.from(new Set(shifts.map(shift => shift.role_name).filter(Boolean))).map(name => ({ value: name, label: name }));
  const filtered = shifts.filter(shift => shift.staff_name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) && (!selectedGroups.size || selectedGroups.has(shift.role_name)) && (!selectedStatuses.size || selectedStatuses.has(shift.ended_at ? 'ended' : 'active')));
  const listFilters = [{ id: 'group', label: t('role'), options: groupOptions, selected: selectedGroups }, { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses }];
  const openFilters = (view: string) => { setDraftFrom(from); setDraftTo(to); setFilterView(view); };
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-[var(--s-5)]">
      <h1 className="sr-only">{t('shiftReports')}</h1>
      <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
        filters={<>
          <ListFilterButton label={t('role')} value={selectedGroups.size || undefined} onClick={() => openFilters('group')} />
          <ListStateFilter label={t('listState')} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
          <ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => openFilters('index')} />
        </>}
        actions={<ActionsDropdown actions={[
          { label: t('refresh'), disabled: loading, onClick: () => void load() },
          { label: t('staff'), onClick: () => router.push(`/${rid}/staff`) },
        ]} />}
      />
      <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters}
        customFilters={[{ id: 'period', label: t('date'), summary: `${draftFrom} – ${draftTo}`, onReset: () => { setDraftFrom(initialFrom); setDraftTo(inputDate(today)); }, content: <div className="space-y-4"><label className="block text-sm">{t('from')}<input type="date" className="input mt-2" value={draftFrom} max={draftTo} onChange={event => setDraftFrom(event.target.value)} /></label><label className="block text-sm">{t('to')}<input type="date" className="input mt-2" value={draftTo} min={draftFrom} onChange={event => setDraftTo(event.target.value)} /></label></div> }]}

        onApply={values => { setSelectedGroups(values.group); setSelectedStatuses(values.status); setFrom(draftFrom); setTo(draftTo); }} />
      {error && <div role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)] flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>}
      {loading && <p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('loading')}</p>}

      {!loading && !error && <DataTable className="list-table">
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
          {!loading && filtered.map((shift, index) => (
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
          {!loading && filtered.length === 0 && (
            <DataTableRow index={0}>
              <DataTableCell colSpan={7} className="py-12 text-center text-fg-muted">{t('noShifts')}</DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>}
    </div>
  );
}
