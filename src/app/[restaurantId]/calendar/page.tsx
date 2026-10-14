'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, MapPin, LockKeyhole, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Drawer, Field, Input, PageHead, Select, Textarea } from '@/components/ds';
import { ChoiceRow, BooleanInput } from '@/components/ds/Selection';
import { getRestaurantCalendar, saveRestaurantCalendarEvent, deleteRestaurantCalendarEvent, getCalendarConflicts, listCateringEvents, type RestaurantCalendarEvent, type CalendarConflicts } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { calendarMonthDays, calendarMoveMonth, calendarEntriesOnDate, calendarEventValid, cateringCalendarEntries, newCalendarEvent, type CalendarEntry } from '@/lib/restaurant-calendar';

const SERVICES = ['pickup', 'delivery', 'dine_in'] as const;
const KINDS = ['other', 'catering', 'closure'] as const;
const eventClass = (kind: RestaurantCalendarEvent['kind']) => kind === 'closure' ? 'border-[var(--danger-500)] bg-[var(--danger-bg)]' : kind === 'catering' ? 'border-[var(--brand-ink)] bg-[var(--summary-bg)]' : 'border-[var(--fg-subtle)] bg-[var(--surface-2)]';

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
  const [filter, setFilter] = useState('all'), [view, setView] = useState('month');
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
  const days = month ? calendarMonthDays(month, weekStart) : [];
  const chosenEntries = calendarEntriesOnDate(entries, selected);
  const monthEntries = entries.filter(event => event.start_date <= `${month}-31` && event.end_date >= `${month}-01`).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time));
  const dateText = (date: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }) => date ? new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : '';
  const kindLabel = (kind: RestaurantCalendarEvent['kind']) => t(kind === 'closure' ? 'calendarKindClosure' : kind === 'catering' ? 'calendarKindCatering' : 'calendarKindOther');
  const serviceLabel = (service: typeof SERVICES[number]) => t(service === 'dine_in' ? 'dineIn' : service);
  const changeMonth = (offset: number) => { const next = calendarMoveMonth(month, offset); setMonth(next); setSelected(`${next}-01`); };
  const openEvent = (event?: RestaurantCalendarEvent) => {
    const value = event ? structuredClone(event) : { ...newCalendarEvent(selected || localToday()), id: crypto.randomUUID() };
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
  const eventRow = (event: CalendarEntry) => <div key={event.id} className={`border-s-4 p-4 ${eventClass(event.kind)}`}>
    <p className="mb-1 text-xs text-[var(--fg-muted)]">{kindLabel(event.kind)}{event.catering_id && ` · ${t('calendarImported')}`}</p>
    {event.catering_id ? <Link href={`/${rid}/catering/events`} className="font-semibold underline underline-offset-4">{event.title}</Link> : <button type="button" className="text-start font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" onClick={() => openEvent(event)}>{event.title}</button>}
    <p className="mt-2 text-sm">{event.all_day ? t('calendarAllDay') : `${event.start_time}–${event.end_time}`}</p>
    {event.start_date !== event.end_date && <p className="mt-1 text-sm text-[var(--fg-muted)]">{dateText(event.start_date, { dateStyle: 'medium' })} – {dateText(event.end_date, { dateStyle: 'medium' })}</p>}
    {event.kind === 'closure' && <p className="mt-2 text-sm">{event.closed_services.map(serviceLabel).join(', ')}</p>}
    {event.location && <p className="mt-2 flex items-center gap-2 text-sm text-[var(--fg-muted)]"><MapPin className="size-4 shrink-0" />{event.location}</p>}
  </div>;
  return <div className="space-y-6">
    <PageHead title={t('restaurantCalendar')} desc={t('calendarDescription')} actions={canEdit && <Button onClick={() => openEvent()} disabled={loading || !!error}><Plus />{t('calendarAdd')}</Button>} />
    <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)]"><LockKeyhole className="size-4" aria-hidden />{t('calendarPrivate')} <bdi>{timezone}</bdi></p>
    {saved && <p role="status">{t('saved')}</p>}
    {error && <div role="alert"><p>{t(error)}</p><Button className="mt-3" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
    {cateringError && <div role="alert" className="border-s-4 border-[var(--warning-500)] p-4"><p>{t('calendarCateringFailed')}</p><Button className="mt-2" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
    {loading ? <p role="status">{t('loading')}</p> : !error && month && <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" disabled={saving || !!draft} onClick={() => void reload()}>{t('calendarReload')}</Button>
          <Button variant="secondary" onClick={() => { const date = localToday(); setMonth(date.slice(0, 7)); setSelected(date); }}>{t('calendarToday')}</Button>
          <Button variant="ghost" icon aria-label={t('calendarPrevious')} onClick={() => changeMonth(-1)}>{direction === 'rtl' ? <ChevronRight /> : <ChevronLeft />}</Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{dateText(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
          <Button variant="ghost" icon aria-label={t('calendarNextMonth')} onClick={() => changeMonth(1)}>{direction === 'rtl' ? <ChevronLeft /> : <ChevronRight />}</Button>
        </div>
        <div className="flex gap-3">
          <Select aria-label={t('calendarFilter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('calendarAllEvents')}</option>{KINDS.map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</Select>
          <Select aria-label={t('calendarView')} value={view} onChange={event => setView(event.target.value)}><option value="month">{t('calendarMonth')}</option><option value="list">{t('calendarList')}</option></Select>
        </div>
      </div>
      {view === 'month' ? <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 overflow-x-auto rounded-r-lg border border-[var(--line)]">
          <div className="grid min-w-[560px] grid-cols-7 border-b border-[var(--line)] bg-[var(--surface-2)]">{days.slice(0, 7).map(day => <div key={day} className="p-3 text-center text-xs font-semibold">{dateText(day, { weekday: 'short' })}</div>)}</div>
          <div className="grid min-w-[560px] grid-cols-7">{days.map(date => {
            const dayEvents = calendarEntriesOnDate(entries, date), isSelected = selected === date;
            return <div key={date} data-calendar-date={date} className={`min-h-28 min-w-0 border-b border-e border-[var(--line)] p-1.5 ${isSelected ? 'bg-[var(--summary-bg)]' : date.startsWith(month) ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'}`}>
              <button type="button" aria-label={dateText(date)} aria-pressed={isSelected} onClick={() => setSelected(date)} className={`mb-1 grid size-8 place-items-center rounded-full text-sm focus-visible:outline focus-visible:outline-2 ${date === localToday() ? 'bg-[var(--action)] text-[var(--action-fg)]' : 'hover:bg-[var(--surface-2)]'}`}>{Number(date.slice(-2))}</button>
              <div className="space-y-1">{dayEvents.slice(0, 2).map(event => event.catering_id ? <Link key={event.id} href={`/${rid}/catering/events`} className={`block truncate border-s-2 px-1.5 py-1 text-xs ${eventClass(event.kind)}`} title={event.title}>{event.title}</Link> : <button type="button" key={event.id} onClick={() => { setSelected(date); openEvent(event); }} className={`block w-full truncate border-s-2 px-1.5 py-1 text-start text-xs focus-visible:outline focus-visible:outline-2 ${eventClass(event.kind)}`} title={event.title}>{event.title}</button>)}</div>
              {dayEvents.length > 2 && <button type="button" className="mt-1 p-1 text-xs underline" onClick={() => setSelected(date)}>+{dayEvents.length - 2} {t('calendarMore')}</button>}
            </div>;
          })}</div>
        </div>
        <section aria-label={t('calendarDayAgenda')} className="min-w-0 space-y-4">
          <div className="border-b border-[var(--line)] pb-4"><h3 className="text-lg font-semibold">{dateText(selected)}</h3>{canEdit && <Button variant="ghost" className="mt-2" onClick={() => openEvent()}><Plus />{t('calendarAdd')}</Button>}</div>
          {chosenEntries.length ? chosenEntries.map(eventRow) : <div className="py-8 text-[var(--fg-muted)]"><CalendarDays className="mb-3 size-6" aria-hidden /><p>{t('calendarEmptyDay')}</p></div>}
        </section>
      </div> : <section aria-label={t('calendarList')} className="space-y-4">{monthEntries.length ? monthEntries.map(event => <div key={event.id}><p className="mb-2 text-sm font-semibold">{dateText(event.start_date, { dateStyle: 'long' })}</p>{eventRow(event)}</div>) : <p className="py-12 text-center text-[var(--fg-muted)]">{t('calendarEmptyMonth')}</p>}</section>}
    </>}
    <Drawer open={!!draft} onOpenChange={value => { if (!value) close(); }} title={draft?.updated_at ? t('calendarEdit') : t('calendarAdd')} onSave={canEdit ? () => void save() : undefined} saveLabel={saving ? t('saving') : t('save')} saveDisabled={saving || !dirty || !draft || !calendarEventValid(draft) || (draft.kind === 'closure' && (conflictsLoading || conflictsFailed))} closeDisabled={saving} footer={draft?.updated_at && canEdit && <Button variant="ghost" disabled={saving} onClick={() => setConfirm('delete')}><Trash2 />{t('calendarDelete')}</Button>}>
      {draft && <form className="space-y-6" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={!canEdit || saving} className="space-y-6">
          <Field label={t('calendarEventTitle')}><Input autoFocus value={draft.title} maxLength={160} onChange={event => patch({ title: event.target.value })} required /></Field>
          <Field label={t('calendarType')}><Select aria-label={t('calendarType')} value={draft.kind} onChange={event => { const kind = event.target.value as RestaurantCalendarEvent['kind']; patch({ kind, all_day: kind === 'closure' ? true : draft.all_day, closed_services: kind === 'closure' ? [...SERVICES] : [] }); }}>{KINDS.map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-4"><Field label={t('calendarStart')}><Input type="date" dir="ltr" value={draft.start_date} onChange={event => patch({ start_date: event.target.value, end_date: draft.end_date < event.target.value ? event.target.value : draft.end_date })} required /></Field><Field label={t('calendarEnd')}><Input type="date" dir="ltr" value={draft.end_date} min={draft.start_date} onChange={event => patch({ end_date: event.target.value })} required /></Field></div>
          {draft.kind !== 'closure' && <label className="flex items-center justify-between gap-3 text-sm"><span>{t('calendarAllDay')}</span><BooleanInput checked={draft.all_day} onChange={event => patch({ all_day: event.target.checked, start_time: draft.start_time || '09:00', end_time: draft.end_time || '18:00' })} /></label>}
          {!draft.all_day && <div className="grid grid-cols-2 gap-4"><Field label={t('calendarStartTime')}><Input type="time" dir="ltr" value={draft.start_time} onChange={event => patch({ start_time: event.target.value })} required /></Field><Field label={t('calendarEndTime')}><Input type="time" dir="ltr" value={draft.end_time} onChange={event => patch({ end_time: event.target.value })} required /></Field></div>}
          {draft.kind === 'closure' ? <section className="space-y-3"><h3 className="font-semibold">{t('calendarClosedServices')}</h3><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('calendarClosureHint')}</p><div className="divide-y divide-[var(--line)] rounded-r-md border border-[var(--line)]">{SERVICES.map(service => <ChoiceRow key={service} label={serviceLabel(service)} checked={draft.closed_services.includes(service)} onChange={event => patch({ closed_services: event.target.checked ? [...draft.closed_services, service] : draft.closed_services.filter(value => value !== service) })} />)}</div></section> : <Field label={t('calendarLocation')}><Input value={draft.location} maxLength={300} onChange={event => patch({ location: event.target.value })} /></Field>}
          <Field label={t('calendarNotes')} hint={t('calendarNotesPrivate')}><Textarea value={draft.notes} maxLength={4000} rows={5} onChange={event => patch({ notes: event.target.value })} /></Field>
        </fieldset>
        {draft.kind === 'closure' && <div className="space-y-2 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6">
          <p>{t('calendarExistingKept')}</p>
          {conflictsLoading && <p role="status">{t('calendarChecking')}</p>}
          {conflictsFailed && <p role="alert">{t('calendarConflictsFailed')}</p>}
          {conflicts && <p role="status">{t('calendarConflicts').replace('{orders}', String(conflicts.orders)).replace('{catering}', String(conflicts.catering))}</p>}
        </div>}
        {saveError && <div className="space-y-3"><p role="alert" className="text-sm text-[var(--danger-500)]">{t(saveError)}</p><Button type="button" variant="secondary" onClick={() => { setDraft(null); void reload(); }}>{t('calendarReload')}</Button></div>}
      </form>}
    </Drawer>
    <ConfirmDialog open={confirm !== null} onOpenChange={value => { if (!value) setConfirm(null); }} title={t(confirm === 'delete' ? 'calendarDeleteConfirm' : 'discardUnsavedChanges')} description={confirm === 'delete' ? t('calendarDeleteHint') : undefined} confirmLabel={t(confirm === 'delete' ? 'calendarDelete' : 'discardChanges')} cancelLabel={t('cancel')} danger={confirm === 'delete'} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'delete') void remove(); else setDraft(null); }} />
  </div>;
}
