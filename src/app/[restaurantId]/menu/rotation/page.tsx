'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Pencil, Trash, Plus, X, Repeat, Search } from 'lucide-react';
import {
  getAllCategories, getRestaurant, getRotationSchedules, setRotationSchedule, deleteRotationSchedule,
  renameRotationGroup, deleteRotationGroup, updateMenuItem,
  type MenuCategory, type MenuItem, type RotationSchedule,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { clampWeekStartDay, getWeekStart, isoDate, type WeekStartDay } from '@/lib/weeks';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, ConfirmDialog, EmptyState, PageHead } from '@/components/ds';
import Modal from '@/components/Modal';

/** Four consecutive weeks, using the restaurant's configured first day. */
function getWeekStarts(weekStartDay: WeekStartDay): string[] {
  const start = getWeekStart(new Date(), weekStartDay);
  return Array.from({ length: 4 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index * 7);
    return isoDate(date);
  });
}

interface RotationGroup {
  name: string;
  items: (MenuItem & { category_name: string })[];
}

type PendingRemoval = { kind: 'group'; name: string } | { kind: 'item'; item: MenuItem };

/** Weekly rotation workspace with explicit mutation feedback and responsive schedules. */
export default function RotationPage() {
  const rid = Number(useParams().restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [schedules, setSchedules] = useState<RotationSchedule[]>([]);
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [groupEditor, setGroupEditor] = useState<{ originalName: string | null } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [addingItems, setAddingItems] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [discard, setDiscard] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try {
      const [cats, scheds, restaurant] = await Promise.all([
        getAllCategories(rid), getRotationSchedules(rid, 4), getRestaurant(rid),
      ]);
      if (!guard.isCurrent(token)) return;
      setCategories(cats);
      setSchedules(scheds);
      setWeekStartDay(clampWeekStartDay(restaurant.week_start_day));
    } catch (cause) {
      if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('libraryOperationFailed'));
    } finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid, t]);
  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const allItems = categories.flatMap(category => (category.items ?? []).map(item => ({ ...item, category_name: category.name })));
  const groupMap = new Map<string, RotationGroup>();
  for (const item of allItems) {
    if (!item.rotation_group) continue;
    if (!groupMap.has(item.rotation_group)) groupMap.set(item.rotation_group, { name: item.rotation_group, items: [] });
    groupMap.get(item.rotation_group)!.items.push(item);
  }
  const groups = Array.from(groupMap.values());
  const ungroupedItems = allItems.filter(item => !item.rotation_group);
  const visibleItems = ungroupedItems.filter(item => `${item.name} ${item.category_name}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)));
  const weekStarts = getWeekStarts(weekStartDay);
  const formatWeek = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const scheduleMap = new Map(schedules.map(schedule => [`${schedule.rotation_group}__${schedule.week_start.split('T')[0]}`, schedule]));

  const mutate = async (operation: () => Promise<unknown>, onSuccess?: () => void) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    try { await operation(); onSuccess?.(); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const openGroupEditor = (originalName: string | null) => {
    setActionError('');
    setGroupName(originalName ?? '');
    setGroupEditor({ originalName });
  };
  const closeGroupEditor = () => {
    if (busy) return;
    if (groupName !== (groupEditor?.originalName ?? '')) setDiscard(true);
    else { setGroupEditor(null); setActionError(''); }
  };
  const saveGroup = () => {
    if (!groupEditor || !groupName.trim()) return;
    const newName = groupName.trim();
    if (groupEditor.originalName !== null) {
      if (newName === groupEditor.originalName) { setGroupEditor(null); return; }
      void mutate(() => renameRotationGroup(rid, groupEditor.originalName!, newName), () => setGroupEditor(null));
    } else if (ungroupedItems.length > 0) {
      // Groups still exist implicitly through their first item assignment.
      void mutate(() => updateMenuItem(rid, ungroupedItems[0].id, { rotation_group: newName }), () => setGroupEditor(null));
    }
  };
  const remove = () => {
    const target = pendingRemoval;
    if (!target) return;
    void mutate(() => target.kind === 'group'
      ? deleteRotationGroup(rid, target.name)
      : updateMenuItem(rid, target.item.id, { rotation_group: null } as unknown as Partial<MenuItem>));
  };
  const modalOpen = !!groupEditor || addingItems !== null;
  const actionFeedback = actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{actionError}</p>;

  return <div className="space-y-6">
    <PageHead title={t('weeklyRotation')} desc={t('weeklyRotationDesc')} actions={canEdit && <Button variant="primary" disabled={loading || busy || !!error} onClick={() => openGroupEditor(null)}><Plus />{t('newGroup')}</Button>} />
    {!modalOpen && actionFeedback}
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
      : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
      : groups.length === 0 ? <EmptyState icon={<Repeat />} title={t('noRotationGroups')} desc={t('noRotationGroupsDesc')} />
      : groups.map(group => <section key={group.name} aria-label={group.name} className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--summary-bg)] px-4 py-3 text-[var(--summary-fg)] sm:px-5">
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">{group.name}</h2>
          {canEdit && <div className="flex shrink-0 gap-1">
            <button type="button" disabled={busy} aria-label={`${t('renameGroup')} · ${group.name}`} onClick={() => openGroupEditor(group.name)} className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--surface)]"><Pencil className="size-4" /></button>
            <button type="button" disabled={busy} aria-label={`${t('deleteGroup')} · ${group.name}`} onClick={() => setPendingRemoval({ kind: 'group', name: group.name })} className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"><Trash className="size-4" /></button>
          </div>}
        </div>
        <div className="space-y-6 p-4 sm:p-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('itemsInGroup')}</h3>
            <div className="flex flex-wrap gap-2">
              {group.items.map(item => <div key={item.id} className="flex min-h-11 max-w-full items-center gap-2 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] ps-3 text-sm">
                <span className="min-w-0 break-words py-2">{item.name}</span>
                {canEdit ? <button type="button" disabled={busy} aria-label={`${t('removeFromGroupConfirm')} · ${item.name}`} onClick={() => setPendingRemoval({ kind: 'item', item })} className="grid size-11 shrink-0 place-items-center rounded-r-md text-fg-secondary hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"><X className="size-4" /></button> : <span className="w-1" />}
              </div>)}
              {canEdit && <Button variant="secondary" disabled={busy} onClick={() => { setSearch(''); setActionError(''); setAddingItems(group.name); }}><Plus />{t('addItem')}</Button>}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('weeklySchedule')}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {weekStarts.map((week, index) => {
                const scheduled = scheduleMap.get(`${group.name}__${week}`);
                const scheduledItem = group.items.find(item => item.id === scheduled?.menu_item_id);
                return <div key={week} className={`min-w-0 space-y-3 rounded-r-md border p-3 ${index === 0 ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)]' : 'border-[var(--line)] bg-[var(--surface-2)]'}`}>
                  <div className="flex min-h-11 items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{index === 0 && <>{t('thisWeek')} · </>}<time dateTime={week}>{formatWeek(week)}</time></span>
                    {canEdit && scheduled && <button type="button" disabled={busy} aria-label={`${t('clear')} · ${group.name} · ${formatWeek(week)}`} onClick={() => void mutate(() => deleteRotationSchedule(rid, scheduled.id))} className="grid size-11 shrink-0 place-items-center rounded-r-md text-fg-secondary hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"><X className="size-4" /></button>}
                  </div>
                  <select className="input min-w-0 w-full text-sm" aria-label={`${t('weeklySchedule')} · ${group.name} · ${formatWeek(week)}`} disabled={!canEdit || busy} value={scheduled?.menu_item_id ?? ''}
                    onChange={event => {
                      const id = Number(event.target.value);
                      if (id) void mutate(() => setRotationSchedule(rid, { rotation_group: group.name, menu_item_id: id, week_start: week }));
                      else if (scheduled) void mutate(() => deleteRotationSchedule(rid, scheduled.id));
                    }}>
                    <option value="">{t('notScheduled')}</option>
                    {group.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  {scheduledItem && <p className="break-words text-xs text-fg-secondary">{scheduledItem.category_name}</p>}
                </div>;
              })}
            </div>
          </div>
        </div>
      </section>)}

    {groupEditor && <Modal title={t(groupEditor.originalName === null ? 'newGroup' : 'renameGroup')} onClose={closeGroupEditor} footer={<div className="flex justify-end gap-3"><button type="button" disabled={busy} className="btn-secondary" onClick={closeGroupEditor}>{t('cancel')}</button><button type="submit" form="rotation-group-editor" disabled={busy || !groupName.trim() || (groupEditor.originalName === null && !ungroupedItems.length)} className="btn-primary">{busy ? t('saving') : t(groupEditor.originalName === null ? 'create' : 'save')}</button></div>}>
      <form id="rotation-group-editor" onSubmit={event => { event.preventDefault(); saveGroup(); }} className="space-y-5" aria-busy={busy}>
        <div><label htmlFor="rotation-group-name" className="mb-2 block text-sm font-medium">{t('rotationGroupName')}</label><input id="rotation-group-name" placeholder={t('groupNamePlaceholder')} autoFocus required disabled={busy} className="input" value={groupName} onChange={event => setGroupName(event.target.value)} /></div>
        {groupEditor.originalName === null && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{ungroupedItems.length ? t('rotationFirstItem').replace('{name}', ungroupedItems[0].name) : t('noUngroupedItems')}</p>}
        {actionFeedback}
      </form>
    </Modal>}
    {addingItems !== null && <Modal title={t('addItem')} subtitle={addingItems} onClose={() => { if (!busy) { setAddingItems(null); setActionError(''); } }} size="lg">
      <div className="space-y-4">
        <div className="relative"><Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-secondary" /><input autoFocus aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} className="input ps-10" disabled={busy} /></div>
        {actionFeedback}
        <div className="space-y-2">
          {visibleItems.map(item => <button type="button" key={item.id} disabled={busy} onClick={() => void mutate(() => updateMenuItem(rid, item.id, { rotation_group: addingItems }), () => setAddingItems(null))} className="flex min-h-14 w-full items-center gap-3 rounded-r-md border border-[var(--line)] px-4 py-3 text-start hover:bg-[var(--surface-2)] disabled:opacity-50"><span className="min-w-0 flex-1 break-words text-sm font-medium">{item.name}</span><span className="text-xs text-fg-secondary">{item.category_name}</span><Plus aria-hidden className="size-4 shrink-0" /></button>)}
          {!visibleItems.length && <p role="status" className="py-6 text-center text-sm text-fg-secondary">{t(ungroupedItems.length ? 'noResults' : 'noUngroupedItems')}</p>}
        </div>
      </div>
    </Modal>}
    <ConfirmDialog open={pendingRemoval !== null} onOpenChange={open => { if (!open) setPendingRemoval(null); }} title={t(pendingRemoval?.kind === 'group' ? 'deleteGroupConfirm' : 'removeFromGroupConfirm')} description={pendingRemoval?.kind === 'group' ? pendingRemoval.name : pendingRemoval?.item.name} danger confirmLabel={t(pendingRemoval?.kind === 'group' ? 'delete' : 'remove')} cancelLabel={t('cancel')} onConfirm={remove} />
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { setGroupEditor(null); setActionError(''); }} />
  </div>;
}
