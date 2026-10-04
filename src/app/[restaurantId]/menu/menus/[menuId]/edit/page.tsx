'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clock, MapPin, Monitor, Repeat } from 'lucide-react';
import {
  listMenus, getRestaurant, updateMenu, getMenuHours, setMenuHours, getLocations, getMenuLocations, setMenuLocations,
  type Menu, type MenuAvailabilityHour, type Restaurant, type Location,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, ConfirmDialog, FullScreenEditor } from '@/components/ds';
import { MenuHoursEditor, menuHoursAreComplete } from '@/components/menu/MenuHoursEditor';

type Draft = { name: string; pos: boolean; web: boolean; follows: boolean; rotating: boolean; hours: MenuAvailabilityHour[]; locations: number[] };

/** Edit menu availability only after all persisted scopes and schedules have loaded. */
export default function MenuEditPage() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const original = useRef('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [partialSave, setPartialSave] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);
  const home = `/${rid}/menu/menus/${mid}`;

  const load = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setLoadError('');
    try {
      // Hours and location failures must never become empty replacement arrays.
      const [menus, rest, locations, assigned, hours] = await Promise.all([
        listMenus(rid), getRestaurant(rid), getLocations(rid), getMenuLocations(rid, mid), getMenuHours(rid, mid),
      ]);
      if (!guard.isCurrent(token)) return;
      const found = menus.find(value => value.id === mid);
      setMenu(found ?? null);
      setRestaurant(rest);
      setAllLocations(locations);
      if (found) {
        const next = { name: found.name, pos: found.pos_enabled, web: found.web_enabled, follows: found.follows_restaurant_hours, rotating: found.is_weekly_rotating ?? false, hours, locations: assigned.map(location => location.id) };
        setDraft(next);
        original.current = JSON.stringify(next);
      } else setDraft(null);
    } catch (cause) { if (guard.isCurrent(token)) setLoadError(cause instanceof Error ? cause.message : 'libraryOperationFailed'); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid, mid]);
  useEffect(() => { const guard = requestGuard.current; void load(); return () => guard.invalidate(); }, [load]);
  const dirty = !!draft && JSON.stringify(draft) !== original.current;
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else router.push(home); } };
  const patch = (value: Partial<Draft>) => setDraft(current => current ? { ...current, ...value } : current);

  const save = async () => {
    if (!canEdit || !menu || !draft || !draft.name.trim() || loading || loadError || savingRef.current) return;
    if (!draft.follows && !menuHoursAreComplete(draft.hours)) { setError(t('menuIncompleteHours')); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    let updated = false;
    try {
      await updateMenu(rid, mid, { name: draft.name, pos_enabled: draft.pos, web_enabled: draft.web, follows_restaurant_hours: draft.follows, is_weekly_rotating: draft.rotating });
      updated = true;
      setPartialSave(true);
      if (!draft.follows) await setMenuHours(rid, mid, draft.hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({ day_of_week, open_time, close_time, is_closed })));
      await setMenuLocations(rid, mid, draft.locations);
      router.push(home);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : t('libraryOperationFailed');
      setError(updated ? `${t('menuSavePartial')} ${detail}` : detail);
    } finally { savingRef.current = false; setSaving(false); }
  };

  return <>
    <FullScreenEditor open onOpenChange={open => { if (!open) close(); }} title={t('editMenuTitle')} subtitle={restaurant?.name}
      onSave={canEdit && draft && !loading && !loadError ? save : undefined} saveDisabled={saving || !draft?.name.trim()} saveLabel={saving ? t('saving') : t('save')}>
      <div className="mx-auto max-w-2xl space-y-6">
        {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
          : loadError ? <div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><p className="mb-4 text-[var(--danger-500)]">{t(loadError)}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>
          : !draft || !menu ? <p role="status" className="py-12 text-center text-fg-secondary">{t('menuNotFound')}</p>
          : <form id="menu-details-editor" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={saving} className="space-y-5">
            {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{error}</p>}
            <fieldset disabled={!canEdit || saving} className="space-y-5">
              <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><label htmlFor="menu-detail-name" className="mb-2 block text-sm font-semibold">{t('menuNameLabel')}</label><input id="menu-detail-name" required className="input" value={draft.name} onChange={event => patch({ name: event.target.value })} /></div>
              <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
                <div className="rounded-t-r-lg border-b border-[var(--line)] bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><h2 className="text-lg font-semibold">{t('menuAvailability')}</h2><p className="mt-2 text-sm">{t('menuAvailabilityDesc')}</p></div>
                <div className="space-y-6 p-5">
                  <fieldset><legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin aria-hidden className="size-4" />{t('pointOfSale')}</legend>
                    <p className="mb-3 text-sm text-fg-secondary">{t('noLocationsSelectedMeansAll')}</p>
                    <div className="space-y-2">{allLocations.filter(location => location.is_active || draft.locations.includes(location.id)).map(location => <label key={location.id} className="flex min-h-11 items-center gap-3 rounded-r-md border border-[var(--line)] px-3 py-2 text-sm"><input type="checkbox" className="size-4 shrink-0" checked={draft.locations.includes(location.id)} onChange={event => patch({ locations: event.target.checked ? [...draft.locations, location.id] : draft.locations.filter(id => id !== location.id) })} /><span className="break-words">{location.name}{!location.is_active && <span className="ms-2 text-xs text-fg-secondary">({t('inactive')})</span>}</span></label>)}</div>
                    {!allLocations.length && <p className="text-sm text-fg-secondary">{t('noLocations')}</p>}
                  </fieldset>
                  <fieldset className="border-t border-[var(--line)] pt-5"><legend className="flex items-center gap-2 text-sm font-semibold"><Monitor aria-hidden className="size-4" />{t('channels')}</legend><div className="flex flex-wrap gap-6"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={draft.pos} onChange={event => patch({ pos: event.target.checked })} />POS</label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={draft.web} onChange={event => patch({ web: event.target.checked })} />Web</label></div></fieldset>
                  <label className="flex items-start gap-3 border-t border-[var(--line)] pt-5"><Repeat aria-hidden className="mt-1 size-4 shrink-0 text-fg-secondary" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('rotatingCarte')}</span><span className="mt-2 block text-sm text-fg-secondary">{t('rotatingCarteDesc')}</span></span><input type="checkbox" className="mt-1 size-4 shrink-0" checked={draft.rotating} onChange={event => patch({ rotating: event.target.checked })} /></label>
                  <div className="border-t border-[var(--line)] pt-5"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock aria-hidden className="size-4" />{t('hoursLabel')}</h3><p className="mb-4 text-sm text-fg-secondary">{t('hoursAvailabilityDesc')}</p><label className="mb-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0" checked={draft.follows} onChange={event => patch({ follows: event.target.checked })} />{t('followsRestaurantHours')}</label>{!draft.follows && <MenuHoursEditor hours={draft.hours} menuId={mid} disabled={!canEdit || saving} onChange={hours => patch({ hours })} />}</div>
                </div>
              </section>
            </fieldset>
          </form>}
      </div>
    </FullScreenEditor>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t(partialSave ? 'menuPartialClose' : 'libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => router.push(home)} />
  </>;
}
