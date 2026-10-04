'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, ListFilter, Trash, Utensils, GripVertical } from 'lucide-react';
import { listMenus, reorderMenus, deleteMenu, duplicateMenu, getRestaurant, type Menu, type Restaurant } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Badge, Button, ConfirmDialog, EmptyState } from '@/components/ds';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';
import MenuCreateModal from '@/components/menu/MenuCreateModal';

/** Menus retain their sales channels, ordering and routes to their group editors. */
export default function MenusPage() {
  const rid = Number(useParams().restaurantId);
  const router = useRouter();
  const { t, locale, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextError, setContextError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Menu | null>(null);
  const requestGuard = useRef(new RestaurantRequestGuard());
  const dragSource = useRef<number | null>(null);
  const originalOrder = useRef<Menu[]>([]);
  const deleteReturnFocus = useRef<HTMLButtonElement | null>(null);
  requestGuard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try {
      const [menuResult, restaurantResult] = await Promise.allSettled([listMenus(rid), getRestaurant(rid)]);
      if (!guard.isCurrent(token)) return;
      if (menuResult.status === 'rejected') throw menuResult.reason;
      setMenus(menuResult.value);
      setRestaurant(restaurantResult.status === 'fulfilled' ? restaurantResult.value : null);
      setContextError(restaurantResult.status === 'rejected');
    } catch (cause) { if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : 'libraryOperationFailed'); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid]);
  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const mutate = async (operation: () => Promise<void>) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    try { await operation(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const moveMenu = (id: number, targetId: number) => {
    if (!reordering || busy || id === targetId) return;
    setMenus(current => {
      const from = current.findIndex(menu => menu.id === id);
      const to = current.findIndex(menu => menu.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const toggleReorder = () => {
    if (!reordering) {
      originalOrder.current = [...menus];
      setSearch(''); setSelectedChannels(new Set()); setSelectedStatuses(new Set()); setView('grid'); setReordering(true); setActionError('');
    } else void mutate(async () => { await reorderMenus(rid, menus.map(menu => menu.id)); setReordering(false); await reload(); });
  };
  const filtered = menus.filter(menu => menu.name.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)) && (!selectedChannels.size || (selectedChannels.has('pos') && menu.pos_enabled) || (selectedChannels.has('web') && menu.web_enabled)) && (!selectedStatuses.size || selectedStatuses.has(menu.is_active ? 'active' : 'inactive')));
  const channels = (menu: Menu) => [menu.pos_enabled ? t('posSystem') : '', menu.web_enabled ? 'Web' : ''].filter(Boolean).join(' · ') || t('noChannels');
  const dayName = (day: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  const hoursSummary = (menu: Menu) => menu.follows_restaurant_hours ? t('followsRestaurantHours') : menu.availability_hours?.filter(hour => !hour.is_closed).map(hour => `${dayName(hour.day_of_week)} ${hour.open_time}–${hour.close_time}`).join(' · ') || t('menuNoCustomHours');
  const actions = (menu: Menu) => canEdit && !reordering && <DropdownMenu dir={direction}>
    <DropdownMenuTrigger asChild><button type="button" disabled={busy} onFocus={event => { deleteReturnFocus.current = event.currentTarget; }} aria-label={`${t('actions')} · ${menu.name}`} className="grid size-11 shrink-0 place-items-center rounded-r-md border border-[var(--line)] text-fg-secondary hover:bg-[var(--surface-2)]"><MoreHorizontal className="size-5" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] min-w-60">
      <DropdownMenuItem className="min-h-11" onSelect={() => router.push(`/${rid}/menu/menus/${menu.id}/edit`)}><Pencil />{t('editMenuDetails')}</DropdownMenuItem>
      <DropdownMenuItem className="min-h-11" onSelect={() => void mutate(async () => { const copy = await duplicateMenu(rid, menu.id); router.push(`/${rid}/menu/menus/${copy.id}`); })}><Copy />{t('duplicateMenu')}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="min-h-11" variant="destructive" onSelect={() => { window.setTimeout(() => setPendingDelete(menu), 0); }}><Trash />{t('deleteMenu')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;

  const statusOptions = [{ value: 'active', label: t('active') }, { value: 'inactive', label: t('inactive') }];
  const channelOptions = [{ value: 'pos', label: t('posSystem') }, { value: 'web', label: 'Web' }];
  const listFilters = [
    { id: 'channel', label: t('salesChannels'), options: channelOptions, selected: selectedChannels },
    { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses },
  ];
  return <div className="min-w-0">
    <h1 className="sr-only">{t('menus')}</h1>
    <ListToolbar search={{ value: search, onChange: setSearch, label: t('search'), disabled: reordering }}
      filters={<>
        <ListFilterButton label={t('salesChannels')} disabled={reordering} value={selectedChannels.size || undefined} onClick={() => setFilterView('channel')} />
        <ListStateFilter label={t('listState')} disabled={reordering} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
        <ListFilterButton label={t('allFilters')} disabled={reordering} icon={<ListFilter />} onClick={() => setFilterView('index')} />
      </>}
      primaryAction={canEdit && <Button disabled={busy || reordering} onClick={() => setCreating(true)}>{t('createMenu')}</Button>}
      actions={<ActionsDropdown actions={[
        { label: t('refresh'), disabled: busy || reordering || loading, onClick: () => void reload() },
        { label: t(view === 'list' ? 'menuCardsView' : 'menuListView'), disabled: reordering, onClick: () => setView(view === 'list' ? 'grid' : 'list') },
        ...(canEdit ? [{ label: t(reordering ? 'doneReordering' : 'reorder'), disabled: loading || !!error || busy || menus.length < 2, onClick: toggleReorder }] : []),
        ...(reordering ? [{ label: t('cancel'), disabled: busy, onClick: () => { setMenus(originalOrder.current); setReordering(false); setView('list'); setActionError(''); } }] : []),
      ]} />}
    />
    <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters} onApply={values => { setSelectedChannels(values.channel); setSelectedStatuses(values.status); }} />
    {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
    {contextError && !error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-r-md bg-[var(--warning-50)] p-3 text-sm text-[var(--warning-500)]"><p className="flex-1">{t('menuRestaurantDetailsUnavailable')}</p><button type="button" disabled={loading || reordering} className="min-h-11 font-semibold underline" onClick={() => void reload()}>{t('retry')}</button></div>}
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
      : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{t(error)}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
      : !filtered.length ? <EmptyState icon={<Utensils />} title={t(menus.length ? 'noResults' : 'noMenusYet')} action={canEdit && !menus.length ? <Button variant="primary" onClick={() => setCreating(true)}>{t('createMenu')}</Button> : undefined} />
      : view === 'grid' ? <div className="space-y-3">
        {filtered.map((menu, index) => <article key={menu.id} draggable={reordering && !busy}
          onDragStart={() => { dragSource.current = menu.id; }} onDragOver={event => { event.preventDefault(); if (dragSource.current !== null) moveMenu(dragSource.current, menu.id); }} onDrop={() => { dragSource.current = null; }} onDragEnd={() => { dragSource.current = null; }}
          className={`flex items-start gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 sm:gap-4 sm:p-5 ${reordering ? 'cursor-grab' : ''}`}>
          <span className="hidden size-11 shrink-0 place-items-center rounded-r-md bg-[var(--summary-bg)] text-[var(--summary-fg)] sm:grid">{reordering ? <GripVertical className="size-5" /> : <Utensils className="size-5" />}</span>
          <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2">{reordering ? <h2 className="break-words text-base font-semibold">{menu.name}</h2> : <Link href={`/${rid}/menu/menus/${menu.id}`} className="break-words text-base font-semibold hover:underline">{menu.name}</Link>}{!menu.is_active && <Badge>{t('inactive')}</Badge>}</div>
            <Link href={`/${rid}/menu/menus/${menu.id}/edit`} tabIndex={reordering ? -1 : undefined} className={`block text-sm text-fg-secondary hover:underline ${reordering ? 'pointer-events-none' : ''}`}>{[restaurant?.name, channels(menu)].filter(Boolean).join(' · ')}</Link>
            <Link href={`/${rid}/menu/menus/${menu.id}/edit`} tabIndex={reordering ? -1 : undefined} className={`mt-2 block break-words text-xs leading-relaxed text-fg-secondary hover:underline ${reordering ? 'pointer-events-none' : ''}`}>{hoursSummary(menu)}</Link>
          </div>
          {reordering ? <div className="flex shrink-0 flex-col gap-1"><button type="button" aria-label={`${t('moveUp')} · ${menu.name}`} disabled={busy || index === 0} onClick={() => moveMenu(menu.id, menus[index - 1].id)} className="grid size-11 place-items-center rounded-r-md border border-[var(--line)] hover:bg-[var(--surface-2)] disabled:opacity-30"><ArrowUp className="size-4" /></button><button type="button" aria-label={`${t('moveDown')} · ${menu.name}`} disabled={busy || index === menus.length - 1} onClick={() => moveMenu(menu.id, menus[index + 1].id)} className="grid size-11 place-items-center rounded-r-md border border-[var(--line)] hover:bg-[var(--surface-2)] disabled:opacity-30"><ArrowDown className="size-4" /></button></div> : actions(menu)}
        </article>)}
      </div> : <DataTable className="list-table">
        <DataTableHead><DataTableHeadCell>{t('name')}</DataTableHeadCell><DataTableHeadCell>{t('pointOfSale')}</DataTableHeadCell><DataTableHeadCell>{t('salesChannels')}</DataTableHeadCell><DataTableHeadSpacerCell /></DataTableHead>
        <DataTableBody>{filtered.map((menu, index) => <DataTableRow key={menu.id} index={index}><DataTableCell mobilePrimary><Link href={`/${rid}/menu/menus/${menu.id}`} className="font-semibold hover:underline">{menu.name}</Link></DataTableCell><DataTableCell mobileLabel={t('pointOfSale')} className="text-sm text-fg-secondary">{restaurant?.name ?? '—'}</DataTableCell><DataTableCell mobileLabel={t('salesChannels')} className="text-sm text-fg-secondary">{channels(menu)}</DataTableCell><DataTableCell>{actions(menu)}</DataTableCell></DataTableRow>)}</DataTableBody>
      </DataTable>}
    {creating && <MenuCreateModal restaurantId={rid} onClose={created => { setCreating(false); if (created) void reload(); }} onSaved={() => { setCreating(false); void reload(); }} />}
    <ConfirmDialog returnFocusRef={deleteReturnFocus} open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('deleteMenu')} description={pendingDelete?.name} danger confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={() => { if (pendingDelete) void mutate(async () => { await deleteMenu(rid, pendingDelete.id); await reload(); }); }} />
  </div>;
}
