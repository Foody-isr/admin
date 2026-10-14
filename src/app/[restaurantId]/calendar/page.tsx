'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, MoreHorizontal, Plus, RotateCw, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Input, Select, Textarea } from '@/components/ds';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { ChoiceRow, BooleanInput } from '@/components/ds/Selection';
import { getRestaurantCalendar, saveRestaurantCalendarEvent, deleteRestaurantCalendarEvent, getCalendarConflicts, listCateringEvents, type RestaurantCalendarEvent, type CalendarConflicts } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { calendarMoveMonth, calendarShiftDate, calendarWeekDays, calendarEventValid, cateringCalendarEntries, newCalendarEvent, type CalendarEntry } from '@/lib/restaurant-calendar';
import { CalendarViews, type CalendarView } from './CalendarViews';
import { CalendarDialog, CalendarField } from './CalendarDialog';

const SERVICES = ['pickup', 'delivery', 'dine_in'] as const;
const KINDS = ['other', 'catering', 'closure'] as const;

/** Restaurant agenda and full-day service closures, separate from staff scheduling. */
export default function RestaurantCalendarPage() {
  const { restaurantId } = useParams();
  return <CalendarWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}

function CalendarWorkspace({ rid }: { rid: number }) {
  const { t, locale, direction } = useI18n();
  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const canReadCatering = hasAnyPermission('catering.view', 'catering.manage');
  const [events, setEvents] = useState<RestaurantCalendarEvent[]>([]), [catering, setCatering] = useState<CalendarEntry[]>([]);
  const [timezone, setTimezone] = useState('Asia/Jerusalem'), [weekStart, setWeekStart] = useState(1);
  const [selected, setSelected] = useState(''), [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [cateringError, setCateringError] = useState(false);
  const [filter, setFilter] = useState('all'), [view, setView] = useState<CalendarView>('week');
  const dateInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<RestaurantCalendarEvent | null>(null), [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<CalendarConflicts | null>(null), [conflictsLoading, setConflictsLoading] = useState(false), [conflictsFailed, setConflictsFailed] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null);
  const lock = useRef(false), guard = useRef(new RestaurantRequestGuard()), alive = useRef(true);
  guard.current.enterRestaurant(rid);
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const localToday = useCallback(() => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }, [timezone]);
  const reload = useCallback(async () => {
    const token = guard.current.begin(rid);
    setLoading(true); setError(''); setCateringError(false);
    const agenda = getRestaurantCalendar(rid);
    const imported = canReadCatering ? listCateringEvents(rid) : Promise.resolve([]);
    const [calendarResult, cateringResult] = await Promise.allSettled([agenda, imported]);
    if (!guard.current.isCurrent(token)) return;
    if (calendarResult.status === 'fulfilled') {
      setEvents(calendarResult.value.events); setTimezone(calendarResult.value.timezone); setWeekStart(calendarResult.value.week_start_day ?? 1);
    } else { setError('calendarLoadFailed'); }
    if (cateringResult.status === 'fulfilled') setCatering(cateringCalendarEntries(cateringResult.value, t('calendarKindCatering')));
    else { setCatering([]); setCateringError(true); }
    setLoading(false);
  }, [rid, canReadCatering, t]);
  useEffect(() => { if (window.matchMedia('(max-width: 639px)').matches) setView('list'); }, []);
  useEffect(() => {
    const currentGuard = guard.current;
    alive.current = true;
    if (!permissionsLoading) void reload();
    return () => { alive.current = false; currentGuard.invalidate(); };
  }, [reload, permissionsLoading]);
  useEffect(() => { if (!loading && !selected) { const today = localToday(); setSelected(today); setMonth(today.slice(0, 7)); } }, [loading, selected, localToday]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const conflictKey = draft?.kind === 'closure' && calendarEventValid(draft) ? JSON.stringify(draft) : '';
  useEffect(() => {
    setConflicts(null); setConflictsFailed(false);
    if (!conflictKey) { setConflictsLoading(false); return; }
    let current = true; setConflictsLoading(true);
    const timer = window.setTimeout(() => {
      void getCalendarConflicts(rid, JSON.parse(conflictKey)).then(value => { if (current) setConflicts(value); }).catch(() => { if (current) setConflictsFailed(true); }).finally(() => { if (current) setConflictsLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [conflictKey, rid]);
  const allEntries = useMemo(() => [...events, ...catering], [events, catering]);
  const entries = allEntries.filter(event => filter === 'all' || event.kind === filter);
  const dateText = (date: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }) => date ? new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : '';
  const kindLabel = (kind: RestaurantCalendarEvent['kind']) => t(kind === 'closure' ? 'calendarKindClosure' : kind === 'catering' ? 'calendarKindCatering' : 'calendarKindOther');
  const serviceLabel = (service: typeof SERVICES[number]) => t(service === 'dine_in' ? 'dineIn' : service);
  const selectDate = (date: string) => { setSelected(date); setMonth(date.slice(0, 7)); };
  const changePeriod = (offset: number) => {
    selectDate(view === 'month' || view === 'list' ? `${calendarMoveMonth(month, offset)}-01` : calendarShiftDate(selected, offset * (view === 'week' ? 7 : 1)));
  };
  const openEvent = (event?: RestaurantCalendarEvent, date = selected || localToday(), kind: RestaurantCalendarEvent['kind'] = 'other', hour?: number) => {
    const value = event ? structuredClone(event) : { ...newCalendarEvent(date), id: crypto.randomUUID(), kind, closed_services: kind === 'closure' ? [...SERVICES] : [], ...(hour !== undefined && kind !== 'closure' ? { all_day: false, start_time: `${String(hour).padStart(2, '0')}:00`, end_time: `${String((hour + 1) % 24).padStart(2, '0')}:00`, end_date: hour === 23 ? calendarShiftDate(date, 1) : date } : {}) };
    setDraft(value); setBaseline(JSON.stringify(value)); setSaveError(''); setSaved(false);
  };
  const close = () => { if (lock.current) return; if (dirty) setConfirm('discard'); else setDraft(null); };
  const patch = (value: Partial<RestaurantCalendarEvent>) => { setDraft(current => current ? { ...current, ...value } : current); setSaveError(''); };
  const errorKey = (cause: unknown) => cause instanceof Error && cause.message === 'calendar_changed' ? 'calendarChanged' : 'calendarSaveFailed';
  const save = async () => {
    if (!draft || !canEdit || lock.current || !calendarEventValid(draft) || (draft.kind === 'closure' && (conflictsLoading || conflictsFailed))) return;
    lock.current = true; setSaving(true); setSaveError('');
    try {
      const event = await saveRestaurantCalendarEvent(rid, draft);
      if (alive.current) { setEvents(current => [...current.filter(value => value.id !== event.id), event]); setDraft(null); setSaved(true); }
    } catch (cause) { if (alive.current) setSaveError(errorKey(cause)); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  const remove = async () => {
    if (!draft?.updated_at || !canEdit || lock.current) return;
    lock.current = true; setSaving(true); setSaveError('');
    try { await deleteRestaurantCalendarEvent(rid, draft); if (alive.current) { setEvents(current => current.filter(value => value.id !== draft.id)); setDraft(null); setSaved(true); } }
    catch (cause) { if (alive.current) setSaveError(errorKey(cause)); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  const week = selected ? calendarWeekDays(selected, weekStart) : [];
  const periodLabel = view === 'week' && week.length
    ? `${dateText(week[0], { day: '2-digit', month: '2-digit', year: 'numeric' })}–${dateText(week[6], { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    : view === 'day' ? dateText(selected, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : month ? dateText(`${month}-01`, { month: 'long', year: 'numeric' }) : '';
  const pill = 'relative inline-flex min-h-12 shrink-0 items-center rounded-full bg-[#f2f2f2] dark:bg-[var(--surface-2)] text-sm font-semibold text-[#6d6d6d] dark:text-[var(--fg-muted)]';
  const picker = 'h-12 w-auto appearance-none rounded-full border-0 bg-transparent ps-4 pe-7 text-sm font-semibold text-[#6d6d6d] dark:text-[var(--fg-muted)] focus:shadow-ring';
  return <div data-restaurant-calendar className="relative min-w-0 lg:pt-[14px]" style={{ fontFamily: "'Orders Sans', var(--font-sans)" }}>
    {saved && <div role="status" className="mb-4 flex min-h-[42px] items-center justify-center gap-2 bg-[#00b32d] px-4 py-2 text-sm font-semibold text-white lg:absolute lg:-inset-x-8 lg:-top-8 lg:mb-0"><CheckCircle2 className="size-5" aria-hidden />{t('saved')}</div>}
    <div data-calendar-notice className="flex min-h-[42px] items-center gap-2 rounded-md bg-[#f0f0f0] dark:bg-[var(--surface-2)] px-5 py-2 text-sm font-semibold leading-5"><Info className="size-[18px] shrink-0 fill-[var(--fg)] text-[var(--surface-2)]" aria-hidden /><p>{t('calendarTimezoneNotice')} <bdi title={t('calendarPrivate')}>{timezone}</bdi></p></div>
    <h1 className="mt-4 text-[26px] font-semibold leading-8 tracking-[-0.02em]">{t('restaurantCalendar')}</h1>
    {error && <div role="alert" className="mt-6"><p>{t(error)}</p><Button className="mt-3" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
    {cateringError && <div role="alert" className="mt-4 border-s-4 border-[var(--warning-500)] p-4"><p>{t('calendarCateringFailed')}</p><Button className="mt-2" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
    {loading ? <p role="status" className="py-8">{t('loading')}</p> : !error && selected && month && <>
      <div data-calendar-toolbar className="mb-[18px] mt-[30px] flex flex-wrap items-center gap-3">
        <label className={pill}><Select aria-label={t('calendarView')} value={view} onChange={event => setView(event.target.value as CalendarView)} className={picker}><option value="week">{t('calendarWeek')}</option><option value="day">{t('calendarDay')}</option><option value="month">{t('calendarMonth')}</option><option value="list">{t('calendarList')}</option></Select><ChevronDown className="pointer-events-none absolute end-3 size-3.5" aria-hidden /></label>
        <div data-calendar-period className="inline-flex h-12 max-w-full shrink-0 items-stretch overflow-hidden rounded-full bg-[#f2f2f2] dark:bg-[var(--surface-2)] text-sm font-semibold text-[#6d6d6d] dark:text-[var(--fg-muted)] focus-within:shadow-ring">
          <button type="button" aria-label={t('calendarPreviousPeriod')} onClick={() => changePeriod(-1)} className="grid w-11 shrink-0 place-items-center border-e border-[var(--line)] outline-none hover:bg-[var(--line)] focus-visible:bg-[var(--line)]">{direction === 'rtl' ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
          <div className="relative flex min-w-0 items-center justify-center gap-2 px-4">
            <button type="button" onClick={() => dateInput.current?.showPicker?.()} className="flex min-h-12 min-w-0 items-center gap-2 outline-none" aria-label={t('calendarChooseDate')}><span className="min-w-0 truncate" title={periodLabel}>{periodLabel}</span><ChevronDown className="size-4 shrink-0" aria-hidden /></button>
            <input ref={dateInput} type="date" tabIndex={-1} aria-label={t('calendarChooseDate')} value={selected} onChange={event => { if (event.target.value) selectDate(event.target.value); }} className="pointer-events-none absolute bottom-0 start-0 size-px opacity-0" />
          </div>
          <button type="button" aria-label={t('calendarNextPeriod')} onClick={() => changePeriod(1)} className="grid w-11 shrink-0 place-items-center border-s border-[var(--line)] outline-none hover:bg-[var(--line)] focus-visible:bg-[var(--line)]">{direction === 'rtl' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}</button>
        </div>
        <label className={pill}><Select aria-label={t('calendarFilter')} value={filter} onChange={event => setFilter(event.target.value)} className={picker}><option value="all">{t('calendarAllEvents')}</option>{KINDS.map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</Select><ChevronDown className="pointer-events-none absolute end-3 size-3.5" aria-hidden /></label>
        <Button variant="ghost" onClick={() => selectDate(localToday())} className="min-h-12 bg-[#f2f2f2] dark:bg-[var(--surface-2)] px-4 text-sm font-semibold">{t('calendarToday')}</Button>
        <div className="ms-auto flex items-center gap-3">
          <Menu><MenuTrigger asChild><Button variant="ghost" icon aria-label={t('calendarActions')} className="min-h-12 w-12 bg-[#f2f2f2] dark:bg-[var(--surface-2)] text-[var(--fg)] [&_svg]:size-5"><MoreHorizontal /></Button></MenuTrigger><MenuContent align="end"><MenuItem disabled={saving || !!draft} onSelect={() => void reload()}><RotateCw />{t('calendarReload')}</MenuItem></MenuContent></Menu>
          {canEdit && <Button onClick={() => openEvent()} disabled={loading || !!error} className="min-h-12 px-5 text-sm"><Plus />{t('calendarAdd')}</Button>}
        </div>
      </div>
      <CalendarViews restaurantId={rid} view={view} selected={selected} today={localToday()} month={month} weekStart={weekStart} entries={entries} filter={filter} canEdit={canEdit} onSelectDay={date => { selectDate(date); setView('day'); }} onCreate={(date, kind, hour) => { selectDate(date); openEvent(undefined, date, kind, hour); }} onEdit={event => openEvent(event)} />
    </>}
    <CalendarDialog open={!!draft} onClose={close} title={draft?.updated_at ? t('calendarEdit') : t('calendarAdd')} onSave={canEdit ? () => void save() : undefined} saveDisabled={saving || !dirty || !draft || !calendarEventValid(draft) || (draft.kind === 'closure' && (conflictsLoading || conflictsFailed))} saving={saving} footer={draft?.updated_at && canEdit && <Button variant="ghost" disabled={saving} onClick={() => setConfirm('delete')}><Trash2 />{t('calendarDelete')}</Button>}>
      {draft && <form className="space-y-6" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={!canEdit || saving} className="divide-y divide-[var(--line)] border border-[var(--line)]">
          <CalendarField label={t('calendarEventTitle')}><Input autoFocus value={draft.title} maxLength={160} onChange={event => patch({ title: event.target.value })} required /></CalendarField>
          <CalendarField label={t('calendarType')}><Select aria-label={t('calendarType')} value={draft.kind} onChange={event => { const kind = event.target.value as RestaurantCalendarEvent['kind']; patch({ kind, all_day: kind === 'closure' ? true : draft.all_day, closed_services: kind === 'closure' ? [...SERVICES] : [] }); }}>{KINDS.map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</Select></CalendarField>
          <div className="divide-y divide-[var(--line)]"><CalendarField label={t('calendarStart')}><Input type="date" dir="ltr" value={draft.start_date} onChange={event => patch({ start_date: event.target.value, end_date: draft.end_date < event.target.value ? event.target.value : draft.end_date })} required /></CalendarField><CalendarField label={t('calendarEnd')}><Input type="date" dir="ltr" value={draft.end_date} min={draft.start_date} onChange={event => patch({ end_date: event.target.value })} required /></CalendarField></div>
          {draft.kind !== 'closure' && <label className="flex min-h-12 items-center justify-between gap-3 bg-[#f2f2f2] dark:bg-[var(--surface-2)] px-4 py-0.5 text-sm font-semibold"><span>{t('calendarAllDay')}</span><BooleanInput checked={draft.all_day} onChange={event => patch({ all_day: event.target.checked, start_time: draft.start_time || '09:00', end_time: draft.end_time || '18:00' })} /></label>}
          {!draft.all_day && <div className="divide-y divide-[var(--line)]"><CalendarField label={t('calendarStartTime')}><Input type="time" dir="ltr" value={draft.start_time} onChange={event => patch({ start_time: event.target.value })} required /></CalendarField><CalendarField label={t('calendarEndTime')}><Input type="time" dir="ltr" value={draft.end_time} onChange={event => patch({ end_time: event.target.value })} required /></CalendarField></div>}
          {draft.kind === 'closure' ? <section className="space-y-3 p-4"><h3 className="font-semibold">{t('calendarClosedServices')}</h3><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('calendarClosureHint')}</p><div className="divide-y divide-[var(--line)] rounded-r-md border border-[var(--line)]">{SERVICES.map(service => <ChoiceRow key={service} label={serviceLabel(service)} checked={draft.closed_services.includes(service)} onChange={event => patch({ closed_services: event.target.checked ? [...draft.closed_services, service] : draft.closed_services.filter(value => value !== service) })} />)}</div></section> : <CalendarField label={t('calendarLocation')}><Input value={draft.location} maxLength={300} onChange={event => patch({ location: event.target.value })} /></CalendarField>}
          <CalendarField label={t('calendarNotes')}><Textarea value={draft.notes} maxLength={4000} rows={3} onChange={event => patch({ notes: event.target.value })} /></CalendarField>
        </fieldset>
        <p className="text-xs text-[var(--fg-muted)]">{t('calendarNotesPrivate')}</p>
        {draft.kind === 'closure' && <div className="space-y-2 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6">
          <p>{t('calendarExistingKept')}</p>
          {conflictsLoading && <p role="status">{t('calendarChecking')}</p>}
          {conflictsFailed && <p role="alert">{t('calendarConflictsFailed')}</p>}
          {conflicts && <p role="status">{t('calendarConflicts').replace('{orders}', String(conflicts.orders)).replace('{catering}', String(conflicts.catering))}</p>}
        </div>}
        {saveError && <div className="space-y-3"><p role="alert" className="text-sm text-[var(--danger-500)]">{t(saveError)}</p><Button type="button" variant="secondary" onClick={() => { setDraft(null); void reload(); }}>{t('calendarReload')}</Button></div>}
      </form>}
    </CalendarDialog>
    <ConfirmDialog open={confirm !== null} onOpenChange={value => { if (!value) setConfirm(null); }} title={t(confirm === 'delete' ? 'calendarDeleteConfirm' : 'discardUnsavedChanges')} description={confirm === 'delete' ? t('calendarDeleteHint') : undefined} confirmLabel={t(confirm === 'delete' ? 'calendarDelete' : 'discardChanges')} cancelLabel={t('cancel')} danger={confirm === 'delete'} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'delete') void remove(); else setDraft(null); }} />
  </div>;
}
