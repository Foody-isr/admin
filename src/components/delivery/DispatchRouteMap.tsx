'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeftIcon, ArrowRightIcon, FlagIcon, Maximize2Icon, Minimize2Icon, RouteIcon, ScanIcon } from 'lucide-react';
import { Button, Select } from '@/components/ds';
import type { DeliveryMapProps, RouteLayer, RouteMapPoint } from './DeliveryMap';
import type { DeliveryRoute } from '@/lib/delivery';
import { deliveryEtaWindow, isPendingDeliveryStop } from '@/lib/delivery-planning';
import { formatRouteAddress } from '@/lib/route-address';
import { useI18n } from '@/lib/i18n';
import board from './DispatchWorkspace.module.css';

const DeliveryMap = dynamic(() => import('./DeliveryMap'), { ssr: false });
const desktopQuery = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

function subscribeDesktop(notify: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

type Tour = { route: DeliveryRoute; layer: RouteLayer; number: number; courier: string };
type Selection = { tourId?: number; point?: RouteMapPoint };

/** Displays the dispatch map and its desktop-only, read-only route walkthrough. */
export function DispatchRouteMap({ title, overview, tours, initialRouteId, initialStopId }: {
  title: string; overview: DeliveryMapProps; tours: Tour[]; initialRouteId: number | null; initialStopId?: number | null;
}) {
  const { t, locale, direction } = useI18n();
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [count, setCount] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const initialTour = tours.find(item => item.route.id === initialRouteId) ?? tours[0];
  const tour = selection && (selection.tourId === undefined ? initialTour : tours.find(item => item.route.id === selection.tourId));
  const open = desktop && selection !== null && (selection.tourId === undefined || !!tour);
  useEffect(() => {
    if (!open && selection !== null) setSelection(null);
  }, [open, selection]);

  useEffect(() => {
    if (!open) return;
    let native = document.fullscreenElement === surface.current;
    const onFullscreenChange = () => {
      if (native && !document.fullscreenElement) setSelection(null);
      native = document.fullscreenElement === surface.current;
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [open]);

  const stops = tour ? [...tour.route.stops].sort((a, b) => a.sequence - b.sequence || a.id - b.id) : [];
  const points: RouteMapPoint[] = stops.map(stop => stop.id);
  if (tour?.layer.start) points.unshift('start');
  if (tour?.layer.end) points.push('end');
  const index = selection?.point === undefined ? -1 : points.indexOf(selection.point);
  const current = points[index];
  const stop = stops.find(item => item.id === current);
  const arrival = tour && stop && isPendingDeliveryStop(stop) ? deliveryEtaWindow(tour.route, stop, locale) : null;
  const address = stop ? formatRouteAddress(stop) : current === 'start' ? tour?.route.start_address : current === 'end' ? tour?.route.end_address : undefined;
  const selectPoint = (point?: RouteMapPoint) => { if (tour) setSelection({ tourId: tour.route.id, point }); };
  const previousPoint = points[index < 0 ? points.length - 1 : index - 1];
  const nextPoint = points[index + 1];
  const rtl = direction === 'rtl';
  const previousKey = rtl ? 'ArrowRight' : 'ArrowLeft';
  const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
  const browse = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]'))) return;
    const previous = event.key === previousKey || event.key === 'ArrowUp';
    if (!previous && event.key !== nextKey && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const next = previous ? previousPoint : nextPoint;
    if (next !== undefined) selectPoint(next);
  };
  const openMap = (value: boolean) => {
    if (!value || !desktop) { setSelection(null); return; }
    setSelection({ tourId: initialTour?.route.id, point: initialStopId ?? undefined });
  };
  const titleText = tour ? t('dispatchMapFor').replace('{courier}', tour.courier) : title;
  let pointTitle = t('dispatchStopCount').replace('{count}', String(stops.length));
  if (current === 'start') pointTitle = t('routeSettingsStartAddress');
  if (current === 'end') pointTitle = t('routeSettingsEndAddress');
  if (stop) pointTitle = stop.customer_name?.trim() || '#' + stop.order_id;
  return <Dialog.Root open={open} onOpenChange={openMap}>
    <div className={board.mapHeading}>
      <h2>{title}</h2>
      <div className={board.mapControls}><span>{t('dispatchPointCount').replace('{count}', String(count))}</span>
        {desktop && <Dialog.Trigger asChild><Button size="sm" variant="ghost" icon aria-label={t('dispatchFullscreenMap')} title={t('dispatchFullscreenMap')}><Maximize2Icon /></Button></Dialog.Trigger>}
      </div>
    </div>
    {!open && <DeliveryMap {...overview} className={board.map} onPointCountChange={setCount} />}
    <Dialog.Portal>
      <Dialog.Content ref={surface} tabIndex={-1} className={board.mapScreen} dir={direction} onKeyDownCapture={browse}
        aria-describedby={undefined}
        onOpenAutoFocus={event => {
          event.preventDefault();
          const element = surface.current;
          element?.focus();
          // The dialog also fills the viewport in browsers that disallow native fullscreen.
          if (!document.fullscreenElement) void element?.requestFullscreen?.().catch(() => {});
        }}>
        <header className={board.screenHead}>
          <div className={board.screenTitle}><RouteIcon aria-hidden="true" size={20} />
            <Dialog.Title>{titleText}</Dialog.Title>
          </div>
          {tours.length > 1 && <Select className={board.tourSelect} aria-label={t('dispatchChooseRoute')} value={tour?.route.id ?? ''}
            onChange={event => {
              setSelection({ tourId: Number(event.target.value) });
              surface.current?.focus();
            }}>
            {tours.map(item => <option key={item.route.id} value={item.route.id}>{item.courier} · {t('mapsRoute')} {item.number}</option>)}
          </Select>}
          {tour && index >= 0 && <Button variant="ghost" className={board.overviewButton} onClick={() => selectPoint()}><ScanIcon />{t('courierFitRoute')}</Button>}
          <Dialog.Close asChild><Button variant="secondary" className={board.closeScreen}><Minimize2Icon />{t('productionExitFullscreen')}</Button></Dialog.Close>
        </header>
        {tour ? <DeliveryMap restaurantId={overview.restaurantId} routes={[tour.layer]} restaurant={overview.restaurant}
          couriers={overview.couriers?.filter(marker => marker.courierId === tour.route.courier_id)}
          selectedStopId={stop?.id} focusedPoint={current} onEndpointClick={selectPoint}
          onStopClick={point => selectPoint(point.id)} className={board.screenMap} />
          : <DeliveryMap {...overview} className={board.screenMap} onQueueClick={id => { setSelection(null); overview.onQueueClick?.(id); }} />}
        {tour && points.length > 0 && <footer className={board.screenFoot}>
          <div className={board.pointDetail} aria-live="polite" aria-atomic="true">
            <span className={board.pointNumber}>{stop ? <><span className="sr-only">{t('dispatchStop')} </span><bdi>{stop.sequence}</bdi></>
              : index < 0 ? <RouteIcon aria-hidden="true" size={20} /> : <FlagIcon aria-hidden="true" size={20} />}</span>
            <div className={board.pointText}>
              <strong><bdi>{pointTitle}</bdi></strong>
              {address && <bdi>{address}</bdi>}
            </div>
            {arrival && <div className={board.pointTime}><span>{t('dispatchWindow')}</span><bdi dir="ltr">{arrival.label}</bdi></div>}
          </div>
          <div className={board.pointNav} role="group" aria-label={t('dispatchBrowsePoints')}>
            <Button variant="secondary" icon disabled={previousPoint === undefined} aria-label={t('dispatchPreviousPoint')} title={t('dispatchPreviousPoint')} aria-keyshortcuts={previousKey + ' ArrowUp'} onClick={() => selectPoint(previousPoint)}>
              {rtl ? <ArrowRightIcon /> : <ArrowLeftIcon />}
            </Button>
            <div className={board.stepCount}>{index >= 0 ? <bdi dir="ltr" className="num">{index + 1} / {points.length}</bdi> : <span>{t('overview')}</span>}<small>{t('dispatchBrowsePoints')}</small></div>
            <Button variant="secondary" icon disabled={nextPoint === undefined} aria-label={t('dispatchNextPoint')} title={t('dispatchNextPoint')} aria-keyshortcuts={nextKey + ' ArrowDown'} onClick={() => selectPoint(nextPoint)}>
              {rtl ? <ArrowLeftIcon /> : <ArrowRightIcon />}
            </Button>
          </div>
        </footer>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
