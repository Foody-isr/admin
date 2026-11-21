'use client';

import { useEffect, useState } from 'react';
import { CalendarDaysIcon, ChevronRightIcon, Undo2Icon } from 'lucide-react';
import { Badge, Button, Select } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { getDeliveryHistoryRoute, listDeliveryHistory, type DeliveryHistoryPage, type DeliveryRoute } from '@/lib/delivery';
import board from './DispatchWorkspace.module.css';

/** Keeps the archive index and the selected route independent of the planning calendar. */
export function useDeliveryHistory(rid: number, enabled: boolean) {
  const [courier, setCourier] = useState<number | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [cursor, setCursor] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<DeliveryHistoryPage>({ routes: [] });
  const [detail, setDetail] = useState<DeliveryRoute | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    setListState('loading');
    void listDeliveryHistory(rid, courier, cursor, request.signal).then(result => {
      if (request.signal.aborted) return;
      setPage(previous => cursor ? {
        ...previous, next_cursor: result.next_cursor,
        routes: [...previous.routes, ...result.routes.filter(row => !previous.routes.some(item => item.id === row.id))],
      } : result);
      setListState('ready');
    }).catch(() => { if (!request.signal.aborted) setListState('error'); });
    return () => request.abort();
  }, [rid, enabled, courier, cursor, revision]);

  useEffect(() => {
    if (!enabled || id === null) return;
    const request = new AbortController();
    setDetailState('loading');
    void getDeliveryHistoryRoute(rid, id, request.signal).then(route => {
      if (request.signal.aborted) return;
      setDetail(route);
      setDetailState('ready');
    }).catch(() => { if (!request.signal.aborted) setDetailState('error'); });
    return () => request.abort();
  }, [rid, enabled, id, revision]);

  function open(routeId: number | null) {
    setDetail(null);
    setDetailState('loading');
    setId(routeId);
  }

  function filter(value: number | null) {
    open(null);
    setListState('loading');
    setPage(previous => ({ couriers: previous.couriers, routes: [] }));
    setCursor('');
    setCourier(value);
  }

  function refresh() {
    setCursor('');
    setRevision(value => value + 1);
  }

  return { courier, id, page, detail: detail?.id === id ? detail : null, listState, detailState,
    open, filter, refresh, more: () => setCursor(page.next_cursor ?? ''), retry: () => setRevision(value => value + 1) };
}

type Archive = ReturnType<typeof useDeliveryHistory>;

/** Renders the chronological route index and compact controls for navigating its detail. */
export function DeliveryHistory({ archive, courierName, onOpen }: {
  archive: Archive; courierName: (id: number) => string; onOpen: (id: number | null) => void;
}) {
  const { t, locale } = useI18n();
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const day = (date: string) => formatter.format(new Date(date + 'T12:00:00Z'));
  const { page, id, listState, detailState } = archive;
  const courierLabel = (value: number) => page.couriers?.find(item => item.id === value)?.name || courierName(value);
  const options = [...(page.couriers ?? [])].sort((a, b) => courierLabel(a.id).localeCompare(courierLabel(b.id), locale) || a.id - b.id);
  const status = (value: DeliveryRoute['status']) => t(value === 'draft' ? 'courierDeparturePending' : value === 'active' ? 'routeStatusActive' : value === 'cancelled' ? 'cancelled' : 'routeStatusCompleted');
  return <section className={board.archive} aria-label={t('dispatchArchiveTitle')}>
    <div className={board.archiveHead}>
{id === null ? <h2>{t('mapsAllRoutes')}</h2> :
        <Button variant="ghost" onClick={() => onOpen(null)}><Undo2Icon/>{t('dispatchBackHistory')}</Button>}
      <label>{t('courier')}
        <Select value={archive.courier ?? ''} onChange={event => archive.filter(Number(event.target.value) || null)}>
          <option value="">{t('dispatchAllCouriers')}</option>
          {options.map(item => <option key={item.id} value={item.id}>{courierLabel(item.id)}</option>)}
        </Select>
      </label>
      {id !== null && <label>{t('mapsRoute')}
        <Select value={id} onChange={event => onOpen(Number(event.target.value))}>
          {page.routes.map(route => <option key={route.id} value={route.id}>{day(route.date)} · {courierLabel(route.courier_id)} · #{route.id}</option>)}
        </Select>
      </label>}
    </div>
    {id === null && <>
      <ul className={board.archiveList}>
        {page.routes.map((route, index) => <li key={route.id}>
          {route.date !== page.routes[index - 1]?.date && <h3><CalendarDaysIcon size={15}/>{day(route.date)}</h3>}
          <button className={board.archiveRow} type="button" onClick={() => onOpen(route.id)}>
            <span className={board.avatar} aria-hidden>{Array.from(courierLabel(route.courier_id))[0]}</span>
            <span className={board.archiveName}><strong><bdi>{courierLabel(route.courier_id)}</bdi></strong>
              <small>{t('mapsRoute')} #{route.id} · {t('dispatchStopCount').replace('{count}', String(route.stop_count))}</small></span>
            <Badge tone={route.status === 'completed' ? 'success' : route.status === 'active' ? 'info' : 'neutral'}>{status(route.status)}</Badge>
            <ChevronRightIcon size={17} aria-hidden className="rtl:rotate-180"/>
          </button>
        </li>)}
      </ul>
      {listState === 'ready' && !page.routes.length && <p className={board.archiveMessage}>{t('deliveryPlanNoHistory')}</p>}
      {listState === 'ready' && page.next_cursor && <Button className={board.archiveMore} variant="secondary" onClick={archive.more}>{t('dispatchOlderRoutes')}</Button>}
    </>}
    {(id === null ? listState : detailState) === 'loading' && <p className={board.archiveMessage} role="status">{t('loading')}</p>}
    {(id === null ? listState : detailState) === 'error' && <div role="alert" className={board.archiveMessage}>{t('couldNotLoad')} <Button variant="secondary" onClick={archive.retry}>{t('retry')}</Button></div>}
  </section>;
}
