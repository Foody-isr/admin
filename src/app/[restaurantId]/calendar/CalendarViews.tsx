'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { calendarDayEventLanes, calendarEntriesOnDate, calendarMonthDays, calendarWeekDays, type CalendarEntry } from '@/lib/restaurant-calendar';
import type { RestaurantCalendarEvent } from '@/lib/api';

export type CalendarView = 'week' | 'day' | 'month' | 'list';
type Kind = RestaurantCalendarEvent['kind'];
const KINDS: Kind[] = ['other', 'catering', 'closure'];
const HOUR_WIDTH = 88;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface CalendarViewsProps {
  restaurantId: number;
  view: CalendarView;
  selected: string;
  today: string;
  month: string;
  weekStart: number;
  entries: CalendarEntry[];
  filter: string;
  canEdit: boolean;
  onSelectDay: (date: string) => void;
  onCreate: (date: string, kind?: Kind, hour?: number) => void;
  onEdit: (event: RestaurantCalendarEvent) => void;
}

function useCalendarLabels() {
  const { t, locale } = useI18n();
  return {
    t,
    dateText: (date: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)),
    kindLabel: (kind: Kind) => t(kind === 'closure' ? 'calendarKindClosure' : kind === 'catering' ? 'calendarKindCatering' : 'calendarKindOther'),
    rowLabel: (kind: Kind) => t(kind === 'closure' ? 'calendarClosures' : kind === 'catering' ? 'catering' : 'calendarEvents'),
    countLabel: (count: number) => t(count === 1 ? 'calendarSingleEvent' : 'calendarMultipleEvents').replace('{count}', String(count)),
  };
}

function EventTile({ event, restaurantId, onEdit, className = '' }: Pick<CalendarViewsProps, 'restaurantId' | 'onEdit'> & { event: CalendarEntry; className?: string }) {
  const { t, kindLabel } = useCalendarLabels();
  const { locale } = useI18n();
  const compactTime = (time: string) => locale === 'fr' ? `${Number(time.slice(0, 2))} h${time.slice(3) === '00' ? '' : time.slice(3)}` : `${Number(time.slice(0, 2))}:${time.slice(3)}`;
  const time = event.all_day ? t('calendarAllDay') : `${compactTime(event.start_time)} – ${compactTime(event.end_time)}`;
  const content = <><span className="block truncate font-semibold">{event.title}</span><span className="block truncate">{event.all_day ? time : <bdi dir="ltr">{time}</bdi>}</span></>;
  const classes = `block min-h-14 w-full rounded-[6px] bg-[#0fba98] px-3 py-2 text-start text-xs leading-5 text-white outline-none hover:bg-[#0ca888] focus-visible:ring-2 focus-visible:ring-[var(--fg)] focus-visible:ring-offset-2 ${className}`;
  const title = `${event.title} · ${kindLabel(event.kind)} · ${time}${event.kind === 'closure' ? ` · ${event.closed_services.map(service => t(service === 'dine_in' ? 'dineIn' : service)).join(', ')}` : ''}${event.catering_id ? ` · ${t('calendarImported')}` : ''}`;
  return event.catering_id
    ? <Link href={`/${restaurantId}/catering/events`} className={classes} title={title} aria-label={event.title}>{content}</Link>
    : <button type="button" className={classes} onClick={() => onEdit(event)} title={title} aria-label={event.title}>{content}</button>;
}

function WeekView(props: CalendarViewsProps) {
  const { t, dateText, kindLabel, rowLabel, countLabel } = useCalendarLabels();
  const days = calendarWeekDays(props.selected, props.weekStart);
  const kinds = KINDS.filter(kind => props.filter === 'all' || kind === props.filter);
  const inWeek = props.entries.filter(event => event.start_date <= days[6] && event.end_date >= days[0]);
  return <div data-calendar-grid="week" className="min-w-0 overflow-x-auto">
    <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
      <colgroup><col style={{ width: 148 }} />{days.map(day => <col key={day} />)}</colgroup>
      <thead><tr className="h-12 border-b border-[var(--line-strong)] text-start">
        <th scope="col" className="border-e border-[var(--line)] px-2 text-start font-semibold">{t('calendarType')}</th>
        {days.map(day => <th scope="col" key={day} className="border-e border-[var(--line)] px-2 text-start font-semibold last:border-e-0"><button type="button" onClick={() => props.onSelectDay(day)} aria-label={dateText(day)} className="py-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--fg)]"><span className={day === props.today ? 'underline decoration-2 underline-offset-4' : ''}>{dateText(day, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span></button></th>)}
      </tr></thead>
      <tbody>{kinds.map(kind => <tr key={kind} className="border-b border-[var(--line)]">
        <th scope="row" className="border-e border-[var(--line-strong)] px-2 py-3 text-start align-top font-normal"><span className="block">{rowLabel(kind)}</span><span className="mt-1 block text-xs text-[var(--fg-subtle)]">{countLabel(inWeek.filter(event => event.kind === kind).length)}</span></th>
        {days.map(day => <td key={day} data-calendar-date={day} className="group relative h-[72px] border-e border-[var(--line)] p-2 align-top last:border-e-0">
          {props.canEdit && <button type="button" onClick={() => props.onCreate(day, kind)} aria-label={`${t('calendarAdd')} · ${kindLabel(kind)} · ${dateText(day)}`} className="absolute inset-2 grid min-h-14 place-items-center rounded-md bg-[var(--surface-2)] opacity-0 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--fg)] group-hover:opacity-100"><Plus className="size-5" aria-hidden /></button>}
          <div className="relative space-y-2 empty:pointer-events-none">{calendarEntriesOnDate(props.entries, day).filter(event => event.kind === kind).map(event => <EventTile key={event.id} event={event} restaurantId={props.restaurantId} onEdit={props.onEdit} />)}</div>
        </td>)}
      </tr>)}</tbody>
      <tfoot><tr className="h-16 border-t border-[var(--line-strong)] align-top"><th scope="row" className="border-e border-[var(--line)] px-2 py-3 text-start font-semibold">{countLabel(inWeek.length)}</th>{days.map(day => <td key={day} className="border-e border-[var(--line)] px-2 py-3 last:border-e-0"><span className="font-semibold">{countLabel(calendarEntriesOnDate(props.entries, day).length)}</span></td>)}</tr></tfoot>
    </table>
  </div>;
}

function DayView(props: CalendarViewsProps) {
  const { t, dateText, kindLabel, rowLabel, countLabel } = useCalendarLabels();
  const { direction } = useI18n();
  const scroll = useRef<HTMLDivElement>(null);
  const dayEntries = calendarEntriesOnDate(props.entries, props.selected);
  const allDay = dayEntries.filter(event => event.all_day);
  const kinds = KINDS.filter(kind => props.filter === 'all' || kind === props.filter);
  const lanes = calendarDayEventLanes(props.entries, props.selected);
  const firstHour = lanes.length ? Math.floor(Math.min(...lanes.map(event => event.start)) / 60) : 0;
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = firstHour * HOUR_WIDTH * (direction === 'rtl' ? -1 : 1); }, [props.selected, firstHour, direction]);
  return <div data-calendar-grid="day" className="min-w-0">
    {allDay.length > 0 && <div className="flex border-y border-[var(--line)]">
      <p className="w-[180px] shrink-0 border-e border-[var(--line-strong)] px-4 py-4 text-sm">{t('calendarAllDay')}</p>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2 p-2">{allDay.map(event => <EventTile key={event.id} event={event} restaurantId={props.restaurantId} onEdit={props.onEdit} className="!w-44 max-w-full" />)}</div>
    </div>}
    <div ref={scroll} className="min-w-0 overflow-x-auto">
      <table className="table-fixed border-collapse text-sm" style={{ width: 180 + 24 * HOUR_WIDTH }}>
        <colgroup><col style={{ width: 180 }} />{HOURS.map(hour => <col key={hour} style={{ width: HOUR_WIDTH }} />)}</colgroup>
        <thead><tr className="h-12 border-b border-[var(--line-strong)]">
          <th scope="col" className="sticky start-0 z-20 border-e border-[var(--line-strong)] bg-[var(--surface)] px-4 text-start font-semibold">{t('calendarType')}</th>
          {HOURS.map(hour => <th key={hour} scope="col" className="px-5 text-start font-semibold text-[var(--fg-muted)]">{hour} {t('calendarHourUnit')}</th>)}
        </tr></thead>
        <tbody>{kinds.map(kind => {
          const row = calendarDayEventLanes(props.entries.filter(event => event.kind === kind), props.selected);
          const height = Math.max(72, (Math.max(-1, ...row.map(event => event.lane)) + 1) * 64 + 8);
          return <tr key={kind} className="border-b border-[var(--line)]">
            <th scope="row" className="sticky start-0 z-20 border-e border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-start align-top font-normal"><span className="block">{rowLabel(kind)}</span><span className="mt-1 block text-xs text-[var(--fg-subtle)]">{countLabel(dayEntries.filter(event => event.kind === kind).length)}</span></th>
            <td colSpan={24} className="p-0 align-top"><div className="relative" style={{ height }}>
              <div className="absolute inset-0 grid grid-cols-[repeat(24,88px)]">{HOURS.map(hour => <div key={hour} className="group border-e border-[var(--line)] p-2">{props.canEdit && <button type="button" onClick={() => props.onCreate(props.selected, kind, hour)} aria-label={`${t('calendarAdd')} · ${kindLabel(kind)} · ${dateText(props.selected)} · ${hour}:00`} className="grid size-full min-h-14 place-items-center rounded-md bg-[var(--surface-2)] opacity-0 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--fg)] group-hover:opacity-100"><Plus className="size-5" aria-hidden /></button>}</div>)}</div>
              {row.map(({ event, start, end, lane }) => <div key={event.id} className="absolute" style={{ insetInlineStart: start / 60 * HOUR_WIDTH, top: 8 + lane * 64, width: Math.max(26, (end - start) / 60 * HOUR_WIDTH - 4) }}><EventTile event={event} restaurantId={props.restaurantId} onEdit={props.onEdit} /></div>)}
            </div></td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="h-16 border-t border-[var(--line-strong)]"><th scope="row" className="sticky start-0 z-20 border-e border-[var(--line)] bg-[var(--surface)] px-4 text-start font-semibold">{countLabel(dayEntries.length)}</th><td colSpan={24} /></tr></tfoot>
      </table>
    </div>
  </div>;
}

/** Square-style calendar tables, with restaurant event types in the fixed first column. */
export function CalendarViews(props: CalendarViewsProps) {
  const { t, dateText, kindLabel } = useCalendarLabels();
  if (props.view === 'week') return <WeekView {...props} />;
  if (props.view === 'day') return <DayView {...props} />;
  const days = calendarMonthDays(props.month, props.weekStart);
  if (props.view === 'month') return <div data-calendar-grid="month" className="min-w-0 overflow-x-auto">
    <div className="grid min-w-[700px] grid-cols-7 border-b border-[var(--line-strong)]">{days.slice(0, 7).map(day => <div key={day} className="px-3 py-4 text-start text-sm font-semibold">{dateText(day, { weekday: 'short' })}</div>)}</div>
    <div className="grid min-w-[700px] grid-cols-7">{days.map(date => <div key={date} data-calendar-date={date} className={`group relative min-h-24 border-b border-e border-[var(--line)] p-2 ${date.startsWith(props.month) ? '' : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'}`}>
      <div className="mb-2 flex items-center justify-between"><button type="button" onClick={() => props.onSelectDay(date)} aria-label={dateText(date)} className={`grid size-7 place-items-center rounded-full text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)] ${date === props.today ? 'bg-[var(--action)] text-[var(--action-fg)]' : 'hover:bg-[var(--surface-2)]'}`}>{Number(date.slice(-2))}</button>{props.canEdit && <button type="button" onClick={() => props.onCreate(date)} aria-label={`${t('calendarAdd')} · ${dateText(date)}`} className="grid size-7 place-items-center rounded-full text-[var(--fg-muted)] opacity-0 outline-none hover:bg-[var(--surface-2)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--fg)] group-hover:opacity-100"><Plus className="size-4" aria-hidden /></button>}</div>
      <div className="space-y-1">{calendarEntriesOnDate(props.entries, date).slice(0, 2).map(event => <EventTile key={event.id} event={event} restaurantId={props.restaurantId} onEdit={props.onEdit} className="!min-h-0 !px-2 !py-1 !text-xs [&>span+span]:hidden" />)}</div>
      {calendarEntriesOnDate(props.entries, date).length > 2 && <button type="button" onClick={() => props.onSelectDay(date)} className="mt-1 text-xs underline">+{calendarEntriesOnDate(props.entries, date).length - 2} {t('calendarMore')}</button>}
    </div>)}</div>
  </div>;
  const entries = props.entries.filter(event => event.start_date <= `${props.month}-31` && event.end_date >= `${props.month}-01`).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time));
  return <section aria-label={t('calendarList')} className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{entries.length ? entries.map(event => <div key={event.id} className="grid gap-3 py-5 sm:grid-cols-[180px_minmax(0,1fr)]"><p className="text-sm text-[var(--fg-muted)]">{dateText(event.start_date, { dateStyle: 'long' })}</p><div className="min-w-0"><div className="max-w-sm"><EventTile event={event} restaurantId={props.restaurantId} onEdit={props.onEdit} /></div><p className="mt-2 text-sm text-[var(--fg-muted)]">{kindLabel(event.kind)}{event.catering_id ? ` · ${t('calendarImported')}` : ''}{event.location ? ` · ${event.location}` : ''}</p>{event.end_date !== event.start_date && <p className="mt-1 text-sm text-[var(--fg-muted)]">{dateText(event.start_date, { dateStyle: 'medium' })} – {dateText(event.end_date, { dateStyle: 'medium' })}</p>}</div></div>) : <p className="py-12 text-center text-sm text-[var(--fg-muted)]">{t('calendarEmptyMonth')}</p>}</section>;
}
