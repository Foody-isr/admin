'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  listMenus, getRestaurant, deleteGroup, deleteMenu, duplicateMenu, reorderGroups,
  reorderGroupItems,
  listAllItems, addItemsToGroup, removeItemFromGroup,
  listGroupMemberships, getBatchFulfillmentConfig,
  getAllCategories, updateMenuItem,
  Menu, MenuGroup, MenuItem, MenuCategory, Restaurant,
  MenuGroupMembership, BatchFulfillmentConfigResponse, GroupItemScope,
  AvailabilityOverride,
} from '@/lib/api';
import { isMembershipActiveOn } from '@/lib/membership';
import { getCarteHealth, CarteHealthReport, CarteHealthProblem } from '@/lib/carte-health';
import { addDays, isoDate } from '@/lib/weeks';
import { getPageCache, setPageCache, saveScroll, restoreScroll } from '@/lib/page-state';
import { BatchPicker } from '@/components/menu/BatchPicker';
import { availabilityToggleTarget } from '@/components/menu/AvailabilityPill';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { ArrowLeft, ChevronUp, ChevronDown, MoreHorizontal, Plus, GripVertical, MonitorSmartphone, ExternalLink, AlertTriangle } from 'lucide-react';
import { PageHead, Button, ConfirmDialog, EmptyState } from '@/components/ds';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { CarteItemRow, CARTE_ITEM_COLUMNS } from '@/components/menu/CarteItemRow';
import { AddRemoveItemsModal, MoveToGroupModal, ReplaceItemsModal } from '@/components/menu/CarteItemDialogs';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';

type TFn = (k: string) => string;

// Guest-facing foodyweb base URL — used to open the live order page for a
// future-week preview. Matches the env contract used by the website editor.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

function hoursRange(menu: Menu, locale: string): string | null {
  if (menu.follows_restaurant_hours) return null;
  return menu.availability_hours?.filter(hour => !hour.is_closed).map(hour => {
    const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + hour.day_of_week)));
    return `${day} ${hour.open_time}–${hour.close_time}`;
  }).join(' · ') || null;
}

// serieDayOf resolves the ISO date (YYYY-MM-DD) a batch cycle is scoped to:
// its primary fulfilment day, falling back to the cutoff date. Shared by the
// membership filter (selectedDay) and the carte-health fetch so both agree.
function serieDayOf(config: BatchFulfillmentConfigResponse | null, index: number): string | null {
  const cyc = config?.upcoming_cycles ?? [];
  const sel = cyc[Math.min(index, cyc.length - 1)] ?? null;
  return (sel?.fulfillment_days?.[0]?.date) ?? (sel?.cutoff_at ? sel.cutoff_at.slice(0, 10) : null);
}

// ─── Carte health banner ─────────────────────────────────────────────────────
// Surfaces per-série misconfigurations right where the operator curates each
// week (combo step short, empty rotating group, unmatched variant pin, orphan
// items) so an unorderable combo is caught before customers hit it.

function healthLine(p: CarteHealthProblem, t: TFn): string {
  switch (p.type) {
    case 'combo_step_under_min':
      return (t('carteHealthComboShort') || '')
        .replace('{combo}', p.combo_name || '')
        .replace('{step}', p.step_name || '')
        .replace('{available}', String(p.available))
        .replace('{required}', String(p.required));
    case 'variant_pin_unmatched':
      return (t('carteHealthVariantPin') || '')
        .replace('{combo}', p.combo_name || '')
        .replace('{step}', p.step_name || '')
        .replace('{variant}', p.variant_label || '');
    case 'empty_group':
      return (t('carteHealthEmptyGroup') || '')
        .replace('{group}', p.group_name || '')
        .replace('{menu}', p.menu_name || '');
    default:
      return '';
  }
}

function CarteHealthBanner({ report, t }: { report: CarteHealthReport | null; t: TFn }) {
  if (!report) return null;
  const problems = report.problems ?? [];
  const alarming = problems.filter((p) => p.severity !== 'info');
  const orphans = problems.filter((p) => p.type === 'item_no_group');
  if (alarming.length === 0 && orphans.length === 0) return null;

  const hasError = alarming.some((p) => p.severity === 'error');
  const tone = alarming.length === 0
    ? 'border-[var(--divider)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]'
    : hasError
      ? 'border-[var(--danger-500)] bg-[var(--danger-50)] text-[var(--danger-500)]'
      : 'border-[var(--warning-500)] bg-[var(--warning-50)] text-[var(--warning-500)]';
  const iconTone = alarming.length === 0
    ? 'text-[var(--text-muted)]'
    : hasError ? 'text-[var(--danger-500)]' : 'text-[var(--warning-500)]';

  return (
    <div className={`rounded-r-lg border px-4 py-3 ${tone}`} role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${iconTone}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            {alarming.length > 0
              ? (t('carteHealthTitle') || '').replace('{n}', String(alarming.length))
              : (t('carteHealthOrphanCount') || '').replace('{n}', String(orphans.length))}
          </p>
          {alarming.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-sm list-disc ps-4">
              {alarming.map((p, i) => (
                <li key={i}>{healthLine(p, t)}</li>
              ))}
              {orphans.length > 0 && (
                <li className="opacity-80">
                  {(t('carteHealthOrphanCount') || '').replace('{n}', String(orphans.length))}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

/** Keying by route isolates drafts and late responses when switching menus. */
export default function MenuDetailPage() {
  const { restaurantId, menuId } = useParams();
  return <MenuDetailContent key={`${restaurantId}.${menuId}`} />;
}

function MenuDetailContent() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [healthError, setHealthError] = useState(false);
  const [healthRetry, setHealthRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const moveProgress = useRef({ added: false, removed: new Set<number>() });
  const replacementProgress = useRef({ removed: new Set<number>(), added: new Set<number>() });
  requestGuard.current.enterRestaurant(rid);

  // Last-known data for this carte, kept across route round-trips (e.g.
  // carte → article editor → back) so the page renders instantly instead of
  // flashing a full spinner. A silent refetch reconciles on every mount.
  const cacheKey = `menu.carte.${rid}.${mid}`;
  const cached = getPageCache<{ menus: Menu[]; items: MenuItem[] }>(cacheKey);

  const [menu, setMenu] = useState<Menu | null>(() => cached?.menus.find((m) => m.id === mid) ?? null);
  const [allMenus, setAllMenus] = useState<Menu[]>(() => cached?.menus ?? []);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  // Full-page spinner only when there is no data at all (true first visit).
  // Subsequent reloads are silent: the list stays mounted, `syncing` drives a
  // small inline indicator, and scroll position is never lost.
  const [loading, setLoading] = useState(() => !cached);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set((cached?.menus.find((m) => m.id === mid)?.groups ?? []).map((g) => g.id)),
  );
  // Groups start expanded on first load only — reloads must not stomp the
  // user's collapsed/expanded choices.
  const expandInitializedRef = useRef(!!cached);
  const [itemPickerGroupId, setItemPickerGroupId] = useState<number | null>(null);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  // All item categories — used only to power the category filter chips in the
  // step-by-step Replace modal.
  const [allCats, setAllCats] = useState<MenuCategory[]>([]);
  const [orderedGroupIds, setOrderedGroupIds] = useState<number[] | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<number | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);
  // Per-group local override of item order during a drag — kept until reload
  // reflects the persisted order. Key: groupId → ordered itemIds.
  const [itemOrderByGroup, setItemOrderByGroup] = useState<Map<number, number[]>>(new Map());
  // Active item drag — { groupId, itemId } of the row being dragged. Scoped
  // to a single group; cross-group reorder isn't supported here.
  const [draggingItem, setDraggingItem] = useState<{ groupId: number; itemId: number } | null>(null);
  // Multi-select state per group for bulk actions (e.g. "Remove from group").
  const [selectedItemsByGroup, setSelectedItemsByGroup] = useState<Map<number, Set<number>>>(new Map());
  // Open state for the "Move selected items to another group" picker. Tracks
  // the source group so we know which selection to move and which group to
  // exclude from the target list.
  const [moveModalSourceGroupId, setMoveModalSourceGroupId] = useState<number | null>(null);
  // Source group for the step-by-step "Replace selected items" modal.
  const [replaceModalSourceGroupId, setReplaceModalSourceGroupId] = useState<number | null>(null);
  // Batch-aware state (only populated when the carte has is_weekly_rotating).
  // batchConfig.upcoming_cycles drives the BatchPicker dropdown.
  const [batchConfig, setBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState(0);
  // Memberships fetched per group; used to determine which items are active
  // for the selected batch cycle.
  const [membershipsByGroup, setMembershipsByGroup] = useState<Map<number, MenuGroupMembership[]>>(new Map());
  // Which groups have the "N items not in this batch" expander open.
  const [showInactiveByGroup, setShowInactiveByGroup] = useState<Set<number>>(new Set());
  // Per-série carte health (empty groups, short combo steps, orphan items).
  const [health, setHealth] = useState<CarteHealthReport | null>(null);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setSyncing(true); setLoadError('');
    try {
      const [menus, items, restaurantDetails, categories] = await Promise.all([listMenus(rid), listAllItems(rid), getRestaurant(rid), getAllCategories(rid)]);
      if (!guard.isCurrent(token)) return;
      const found = menus.find(m => m.id === mid);
      // A failed membership request must not turn a future series into today's menu.
      const config = found?.is_weekly_rotating ? await getBatchFulfillmentConfig(rid) : null;
      const groupList = found?.groups ?? [];
      const memberships = found?.is_weekly_rotating ? await Promise.all(groupList.map(g => listGroupMemberships(rid, g.id))) : [];
      if (!guard.isCurrent(token)) return;
      setBatchConfig(config);
      setMembershipsByGroup(new Map(groupList.map((g, index) => [g.id, memberships[index] ?? []])));
      setPageCache(cacheKey, { menus, items });
      setMenu(found ?? null); setAllMenus(menus); setAllItems(items); setRestaurant(restaurantDetails); setAllCats(categories);
      setOrderedGroupIds(null); setItemOrderByGroup(new Map()); setSelectedItemsByGroup(new Map());
      if (!expandInitializedRef.current && found?.groups) { setExpanded(new Set(found.groups.map(g => g.id))); expandInitializedRef.current = true; }
    } catch (cause) { if (guard.isCurrent(token)) setLoadError(cause instanceof Error ? cause.message : 'libraryOperationFailed'); }
    finally { if (guard.isCurrent(token)) { setLoading(false); setSyncing(false); } }
  }, [rid, mid, cacheKey]);

  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const mutate = async (operation: () => Promise<void>) => {
    if (!canEdit || busyRef.current || syncing || loadError) return;
    busyRef.current = true; setBusy(true); setActionError('');
    try { await operation(); }
    catch (cause) { setActionError(`${cause instanceof Error ? cause.message : t('libraryOperationFailed')} ${t('menuSavePartial')}`); await reload(); }
    finally { busyRef.current = false; setBusy(false); }
  };

  // Fetch carte health for the selected série (server defaults to today when no
  // rotating cycle is picked). Refetches when the operator switches série.
  useEffect(() => {
    let cancelled = false;
    setHealthError(false);
    getCarteHealth(rid, serieDayOf(batchConfig, selectedCycleIndex) ?? undefined)
      .then((r) => { if (!cancelled) setHealth(r); })
      .catch(() => { if (!cancelled) { setHealth(null); setHealthError(true); } });
    return () => { cancelled = true; };
  }, [rid, batchConfig, selectedCycleIndex, healthRetry]);

  // Returning from the article editor: put the user back on the exact row
  // they left. The offset was saved by openItem() below.
  useEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => restoreScroll(cacheKey));
  }, [loading, cacheKey]);

  // Apply a local change to one group's items so the UI responds instantly;
  // the silent reload() that follows reconciles with the server.
  const patchGroupItems = (groupId: number, updater: (items: MenuItem[]) => MenuItem[]) => {
    setMenu((prev) => prev ? {
      ...prev,
      groups: prev.groups?.map((g) => g.id === groupId ? { ...g, items: updater(g.items ?? []) } : g),
    } : prev);
  };

  // Quick "86" from the carte's availability pill. Binary toggle keyed on the
  // item's visible state via availabilityToggleTarget (shared with the Library
  // list) — always a forced override, never 'auto', so the confirmed state
  // matches the reloaded truth. Availability is
  // global to the item, so this takes it off (or back on) every menu and
  // channel, not just this carte.
  const handleToggleSoldOut = async (item: MenuItem) => {
    const next = availabilityToggleTarget(item.availability_state, item.availability_override);
    await mutate(async () => { await updateMenuItem(rid, item.id, { availability_override: next }); await reload(); });
  };

  const bulkSetAvailability = async (groupId: number, value: AvailabilityOverride) => {
    const ids = Array.from(selectedInGroup(groupId));
    await mutate(async () => {
      for (const id of ids) await updateMenuItem(rid, id, { availability_override: value });
      clearGroupSelection(groupId); await reload();
    });
  };

  // Navigate to the article editor with a return address: the editor's Back
  // and post-save navigation honor `from`, landing the user back on this
  // carte. The item is stashed so the editor opens populated (same pattern
  // as the library's openEditor), and the scroll offset is saved for the
  // restore effect above.
  const openItem = (item: MenuItem) => {
    try {
      sessionStorage.setItem(`foody.menuItem.${rid}.${item.id}`, JSON.stringify(item));
    } catch {
      /* quota or SSR — fall through */
    }
    saveScroll(cacheKey);
    router.push(`/${rid}/menu/items/${item.id}?from=${encodeURIComponent(pathname)}`);
  };

  const handleDeleteGroup = (group: MenuGroup) => setConfirmation({ title: t('delete'), description: group.name, action: async () => { await deleteGroup(rid, group.id); await reload(); } });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p>;
  if (loadError) return <div role="alert" className="space-y-4 rounded-r-lg border border-[var(--line)] p-6"><p className="text-[var(--danger-500)]">{t(loadError)}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>;
  if (!menu) return <EmptyState title={t('menuNotFound')} action={<Button variant="secondary" onClick={() => router.push(`/${rid}/menu/menus`)}>{t('back')}</Button>} />;

  const baseGroups = menu.groups ?? [];
  const groups: MenuGroup[] = orderedGroupIds
    ? (orderedGroupIds.map((id) => baseGroups.find((g) => g.id === id)).filter(Boolean) as MenuGroup[])
    : baseGroups;

  const handleDragStart = (e: React.DragEvent<HTMLElement>, groupId: number) => {
    setDraggingGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to initiate drag
    e.dataTransfer.setData('text/plain', String(groupId));
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>, groupId: number) => {
    if (draggingGroupId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (groupId !== dragOverGroupId) setDragOverGroupId(groupId);
  };

  const clearDragState = () => {
    setDraggingGroupId(null);
    setDragOverGroupId(null);
  };

  // Items inside a group, applying any in-flight drag-and-drop override so
  // optimistic reorder updates are reflected before the server roundtrip.
  const itemsForGroup = (group: MenuGroup): MenuItem[] => {
    const items = group.items ?? [];
    const override = itemOrderByGroup.get(group.id);
    if (!override) return items;
    const byId = new Map(items.map((i) => [i.id, i] as const));
    const ordered = override.map((id) => byId.get(id)).filter((i): i is MenuItem => !!i);
    // Append any item not in the override (e.g. just-added) at the end.
    for (const i of items) if (!override.includes(i.id)) ordered.push(i);
    return ordered;
  };

  // ── Batch-aware derived state ────────────────────────────────────────────
  // When the menu rotates weekly, items are split into active/inactive based on
  // their MenuGroupItem.effective_from/until window vs the selected cycle's
  // fulfilment date. When not rotating, all items are "active" and this is a
  // no-op (zero overhead).
  const isRotating = !!menu?.is_weekly_rotating;
  const cycles = batchConfig?.upcoming_cycles ?? [];
  const selectedCycle = cycles[Math.min(selectedCycleIndex, cycles.length - 1)] ?? null;
  // selectedDay: the ISO date used for membership filtering. Prefers the cycle's
  // primary fulfilment day; falls back to the cutoff date if no fulfilment day.
  const selectedDay = serieDayOf(batchConfig, selectedCycleIndex);
  const isCurrentCycle = selectedCycleIndex === 0;
  const healthAlarmCount = (health?.problems ?? []).filter((p) => p.severity !== 'info').length;
  // When adding to a non-current cycle, scope the membership to that cycle's
  // FULFILMENT day(s) — the same axis the series filter uses (selectedDay) — not
  // the earlier ordering window (open_at/cutoff_at). Using open_at/cutoff_at made
  // an item added for a future Shabbat active during the prior ordering week, so
  // it showed under the *current* series and not the one it was added to.
  // Current cycle = empty scope so items persist into future cycles (always-on).
  const cycleFulfilmentDates = (selectedCycle?.fulfillment_days ?? [])
    .map((d) => d.date)
    .filter((d): d is string => !!d)
    .sort();
  const currentBatchScope: GroupItemScope = isCurrentCycle ? {} : {
    effective_from: cycleFulfilmentDates[0] ?? selectedDay ?? selectedCycle?.cutoff_at?.slice(0, 10),
    effective_until:
      cycleFulfilmentDates[cycleFulfilmentDates.length - 1] ?? selectedDay ?? selectedCycle?.cutoff_at?.slice(0, 10),
  };

  // Soft-retire cutoff for removals while viewing a FUTURE cycle: the day before
  // this cycle's first fulfilment date. Removing or replacing then bounds the old
  // membership's effective_until to this date instead of hard-deleting the join
  // row, so the item stays live in the current (and any earlier) week and only
  // rolls off from the selected cycle onward. undefined on the current cycle (and
  // non-rotating menus) → plain hard delete, since that membership is "always-on".
  // Mirrors the group editor's `cutoff` (group/[groupId]/page.tsx).
  const batchRemoveCutoff: string | undefined = (() => {
    if (isCurrentCycle) return undefined;
    const start = (cycleFulfilmentDates[0] ?? selectedDay ?? undefined)?.slice(0, 10);
    if (!start) return undefined;
    const [y, m, d] = start.split('-').map(Number);
    return isoDate(addDays(new Date(y, m - 1, d), -1));
  })();

  // Batch-aware membership removal: hard-delete on the current cycle, soft-retire
  // (scope-out from this cycle onward) on future cycles so earlier weeks keep the
  // item. Every remove/replace path on this page must go through this so editing a
  // future série never erases an article from the current week.
  const removeItemForBatch = (groupId: number, itemId: number) =>
    removeItemFromGroup(rid, groupId, itemId, batchRemoveCutoff);

  const splitForBatch = (group: MenuGroup, items: MenuItem[]): { active: MenuItem[]; inactive: MenuItem[] } => {
    if (!isRotating || !selectedDay) return { active: items, inactive: [] };
    const memberships = membershipsByGroup.get(group.id) ?? [];
    const memberByItemId = new Map(memberships.map((m) => [m.menu_item_id, m] as const));
    const active: MenuItem[] = [];
    const inactive: MenuItem[] = [];
    for (const item of items) {
      const m = memberByItemId.get(item.id);
      // Items without a matching membership row default to active (defensive
      // fallback for legacy data where the join row may not have been backfilled).
      if (!m || isMembershipActiveOn(m, selectedDay)) {
        active.push(item);
      } else {
        inactive.push(item);
      }
    }
    return { active, inactive };
  };

  const toggleInactiveExpanded = (groupId: number) => {
    setShowInactiveByGroup((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // Quick "Add to this batch" — used by the inactive expander to re-activate
  // a single item for the selected cycle without going through the modal.
  const addItemToCurrentBatch = async (groupId: number, itemId: number) => {
    await mutate(async () => { await addItemsToGroup(rid, groupId, [itemId], currentBatchScope); await reload(); });
  };

  // ── Item drag-and-drop within a group ─────────────────────────────────────
  const handleItemDragStart = (e: React.DragEvent<HTMLElement>, groupId: number, itemId: number) => {
    e.stopPropagation();
    setDraggingItem({ groupId, itemId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `item:${itemId}`);
  };

  const handleItemDragOver = (e: React.DragEvent<HTMLElement>, groupId: number, itemId: number) => {
    if (!draggingItem || draggingItem.groupId !== groupId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggingItem.itemId === itemId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    // Drag operates on the VISIBLE (active) items only. Inactive items aren't
    // rendered, so they can't participate; their sort_order stays untouched.
    const currentOrder = splitForBatch(group, itemsForGroup(group)).active.map((i) => i.id);
    const fromIdx = currentOrder.indexOf(draggingItem.itemId);
    const toIdx = currentOrder.indexOf(itemId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...currentOrder];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggingItem.itemId);
    setItemOrderByGroup((prev) => {
      const m = new Map(prev);
      m.set(groupId, next);
      return m;
    });
  };

  const handleItemDrop = async (e: React.DragEvent<HTMLElement>, groupId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = draggingItem;
    setDraggingItem(null);
    if (!drag || drag.groupId !== groupId) return;
    const finalOrder = itemOrderByGroup.get(groupId);
    if (!finalOrder) return;
    await mutate(async () => { await reorderGroupItems(rid, groupId, finalOrder); await reload(); });
  };

  // ── Bulk selection ────────────────────────────────────────────────────────
  const selectedInGroup = (groupId: number): Set<number> =>
    selectedItemsByGroup.get(groupId) ?? new Set<number>();

  const toggleItemSelected = (groupId: number, itemId: number) => {
    setSelectedItemsByGroup((prev) => {
      const m = new Map(prev);
      const cur = new Set(m.get(groupId) ?? new Set<number>());
      if (cur.has(itemId)) cur.delete(itemId); else cur.add(itemId);
      if (cur.size === 0) m.delete(groupId); else m.set(groupId, cur);
      return m;
    });
  };

  const toggleSelectAllInGroup = (groupId: number, itemIds: number[]) => {
    setSelectedItemsByGroup((prev) => {
      const m = new Map(prev);
      const cur = m.get(groupId);
      if (cur && cur.size === itemIds.length) {
        m.delete(groupId);
      } else {
        m.set(groupId, new Set(itemIds));
      }
      return m;
    });
  };

  const clearGroupSelection = (groupId: number) => {
    setSelectedItemsByGroup((prev) => {
      if (!prev.has(groupId)) return prev;
      const m = new Map(prev);
      m.delete(groupId);
      return m;
    });
  };

  const bulkRemoveFromGroup = async (groupId: number) => {
    const ids = Array.from(selectedInGroup(groupId));
    if (ids.length === 0) return;
    for (const itemId of ids) {
      await removeItemForBatch(groupId, itemId);
    }
    clearGroupSelection(groupId);
    patchGroupItems(groupId, (items) => items.filter((i) => !ids.includes(i.id)));
    reload();
  };

  // Move all currently-selected items from sourceGroupId into targetGroupId.
  // Server has no atomic move endpoint, so we add to the new group (batch) and
  // then remove from the old group one-by-one. Items already present in the
  // target group simply update their existing membership row (idempotent).
  // NOTE: a move is a structural change applied across all weeks (the add-side is
  // intentionally always-on), so the source removal is a plain hard delete — it is
  // deliberately NOT batch-scoped like the remove/replace paths above.
  const bulkMoveToGroup = async (sourceGroupId: number, targetGroupId: number) => {
    if (sourceGroupId === targetGroupId) return;
    const ids = Array.from(selectedInGroup(sourceGroupId));
    if (ids.length === 0) return;
    if (!moveProgress.current.added) { await addItemsToGroup(rid, targetGroupId, ids); moveProgress.current.added = true; }
    for (const itemId of ids) {
      if (!moveProgress.current.removed.has(itemId)) { await removeItemFromGroup(rid, sourceGroupId, itemId); moveProgress.current.removed.add(itemId); }
    }
    clearGroupSelection(sourceGroupId);
    setMoveModalSourceGroupId(null);
    // Local patch covers same-menu moves; cross-menu targets reconcile via
    // the silent reload.
    const moved = (menu?.groups?.find((g) => g.id === sourceGroupId)?.items ?? []).filter((i) => ids.includes(i.id));
    setMenu((prev) => prev ? {
      ...prev,
      groups: prev.groups?.map((g) => {
        if (g.id === sourceGroupId) return { ...g, items: (g.items ?? []).filter((i) => !ids.includes(i.id)) };
        if (g.id === targetGroupId) {
          const existing = (g.items ?? []).filter((i) => !ids.includes(i.id));
          return { ...g, items: [...existing, ...moved] };
        }
        return g;
      }),
    } : prev);
    reload();
  };

  // Swap each selected item for the replacement chosen in the step-by-step
  // modal. Mirrors the other bulk actions on this page: remove the old membership
  // (batch-aware — soft-retire on a future cycle so the article stays in earlier
  // weeks), then add the replacement scoped to the selected batch.
  const bulkReplace = async (groupId: number, replacements: { oldId: number; newId: number }[]) => {
    if (replacements.length === 0) {
      setReplaceModalSourceGroupId(null);
      clearGroupSelection(groupId);
      return;
    }
    for (const { oldId, newId } of replacements) {
      if (!replacementProgress.current.removed.has(oldId)) { await removeItemForBatch(groupId, oldId); replacementProgress.current.removed.add(oldId); }
      if (!replacementProgress.current.added.has(newId)) { await addItemsToGroup(rid, groupId, [newId], currentBatchScope); replacementProgress.current.added.add(newId); }
    }
    clearGroupSelection(groupId);
    setReplaceModalSourceGroupId(null);
    const oldIds = replacements.map((r) => r.oldId);
    const newIds = replacements.map((r) => r.newId);
    patchGroupItems(groupId, (items) => [
      ...items.filter((i) => !oldIds.includes(i.id)),
      ...allItems.filter((i) => newIds.includes(i.id) && !items.some((g) => g.id === i.id)),
    ]);
    reload();
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>, targetGroupId: number) => {
    e.preventDefault();
    const dragId = draggingGroupId;
    clearDragState();
    if (dragId === null || dragId === targetGroupId) return;

    const currentOrder = groups.map((g) => g.id);
    const fromIdx = currentOrder.indexOf(dragId);
    const toIdx = currentOrder.indexOf(targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...currentOrder];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    setOrderedGroupIds(next);

    await mutate(async () => { await reorderGroups(rid, mid, next); await reload(); });
  };

  const pending = busy || syncing;
  const moveGroup = (index: number, delta: number) => {
    const order = groups.map(group => group.id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    void mutate(async () => { await reorderGroups(rid, mid, order); await reload(); });
  };
  const moveItem = (group: MenuGroup, index: number, delta: number) => {
    const order = splitForBatch(group, itemsForGroup(group)).active.map(item => item.id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    void mutate(async () => { await reorderGroupItems(rid, group.id, order); await reload(); });
  };
  const closePicker = (changed = false) => { setItemPickerGroupId(null); if (changed) void reload(); };
  const channels = [menu.pos_enabled ? t('posSystem') : '', menu.web_enabled ? 'Web' : ''].filter(Boolean).join(' · ') || t('noChannels');
  return <div className="min-w-0 space-y-5">
    <Button variant="ghost" onClick={() => router.push(`/${rid}/menu/menus`)}><ArrowLeft className="rtl:rotate-180" />{t('menus')}</Button>
    <PageHead title={<span className="break-words">{menu.name}</span>} desc={[restaurant?.name, channels].filter(Boolean).join(' · ')} actions={<>
      {canEdit && <><Button variant="secondary" disabled={pending} onClick={() => router.push(`/${rid}/menu/menus/${mid}/pos-display`)}><MonitorSmartphone />{t('editPosLayout')}</Button>
      <DropdownMenu dir={direction}><DropdownMenuTrigger asChild><Button variant="primary" disabled={pending}>{t('add')}<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:min-h-11"><DropdownMenuItem onSelect={() => router.push(`/${rid}/menu/items/new?menuId=${mid}`)}>{t('addArticle')}</DropdownMenuItem><DropdownMenuItem onSelect={() => router.push(`/${rid}/menu/menus/${mid}/group/new`)}>{t('addGroup')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu dir={direction}><DropdownMenuTrigger asChild><Button variant="secondary" disabled={pending} aria-label={`${t('actions')} · ${menu.name}`} onFocus={event => { returnFocus.current = event.currentTarget; }}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:min-h-11">
          <DropdownMenuItem onSelect={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}>{t('editMenuDetails')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void mutate(async () => { const copy = await duplicateMenu(rid, mid); router.push(`/${rid}/menu/menus/${copy.id}`); })}>{t('duplicateMenu')}</DropdownMenuItem>
          <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirmation({ title: t('deleteMenu'), description: menu.name, action: async () => { await deleteMenu(rid, mid); router.push(`/${rid}/menu/menus`); } })}>{t('deleteMenu')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu></>}
    </>} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-r-lg bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">
      <button type="button" className="min-h-11 min-w-0 break-words text-start hover:underline" onClick={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}>{menu.follows_restaurant_hours ? t('followsRestaurantHours') : hoursRange(menu, locale) || t('menuNoCustomHours')}</button>
      {syncing && <span role="status">{t('loading')}</span>}
      {isRotating && cycles.length > 0 && <BatchPicker cycles={cycles} selectedIndex={selectedCycleIndex} onChange={index => { setSelectedCycleIndex(index); setSelectedItemsByGroup(new Map()); }} />}
      {healthAlarmCount > 0 && <span className="flex items-center gap-2"><AlertTriangle className="size-4" />{t('carteHealthBadge').replace('{n}', String(healthAlarmCount))}</span>}
      {isRotating && selectedDay && restaurant?.slug && <Button variant="secondary" title={t('previewWeekHint')} onClick={() => window.open(`${WEB_URL}/r/${restaurant.slug}/order?preview_date=${selectedDay}`, '_blank', 'noopener')}><ExternalLink />{t('previewOnWeb')}</Button>}
      {isRotating && !cycles.length && <Button variant="secondary" onClick={() => router.push(`/${rid}/settings/orders`)}>{t('configureBatchFirst')}</Button>}
    </div>
    {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
    {healthError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-r-md bg-[var(--warning-50)] p-3 text-sm text-[var(--warning-500)]"><p className="flex-1">{t('carteHealthUnavailable')}</p><Button variant="secondary" onClick={() => setHealthRetry(value => value + 1)}>{t('retry')}</Button></div>}
    <CarteHealthBanner report={health} t={t} />
    {!groups.length && <EmptyState title={t('noGroupsYet')} />}
    {groups.map((group, groupIndex) => {
      const { active: items, inactive: inactiveItems } = splitForBatch(group, itemsForGroup(group));
      const selected = selectedInGroup(group.id);
      const allSelected = items.length > 0 && selected.size === items.length;
      const isExpanded = expanded.has(group.id);
      return <section key={group.id} aria-label={group.name} draggable={canEdit && !pending && draggingItem === null} onDragStart={event => handleDragStart(event, group.id)} onDragOver={event => handleDragOver(event, group.id)} onDrop={event => void handleDrop(event, group.id)} onDragEnd={clearDragState} onDragLeave={() => { if (dragOverGroupId === group.id) setDragOverGroupId(null); }}
        className={`min-w-0 rounded-r-lg border bg-[var(--surface)] ${draggingGroupId === group.id ? 'opacity-40' : ''} ${dragOverGroupId === group.id ? 'border-[var(--brand-500)]' : 'border-[var(--line)]'}`}>
        <div className="flex items-center gap-2 rounded-t-r-lg bg-[var(--summary-bg)] px-3 py-2 text-[var(--summary-fg)]">
          {canEdit && <GripVertical aria-hidden className="hidden size-4 shrink-0 cursor-grab xl:block" />}
          <h2 className="min-w-0 flex-1"><button type="button" aria-expanded={isExpanded} aria-controls={`carte-group-${group.id}`} onClick={() => toggleExpand(group.id)} className="flex min-h-11 w-full items-center gap-3 text-start">{isExpanded ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}<span className="min-w-0 flex-1 break-words font-semibold">{group.name}</span><span className="shrink-0 text-sm font-normal">{t('nArticles').replace('{n}', String(items.length))}</span></button></h2>
          {canEdit && <DropdownMenu dir={direction}><DropdownMenuTrigger asChild><button type="button" disabled={pending} aria-label={`${t('actions')} · ${group.name}`} onFocus={event => { returnFocus.current = event.currentTarget; }} className="grid size-11 shrink-0 place-items-center rounded-r-md hover:bg-[var(--surface)]"><MoreHorizontal className="size-5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] min-w-52 [&_[role=menuitem]]:min-h-11">
            <DropdownMenuItem onSelect={() => { saveScroll(cacheKey); router.push(`/${rid}/menu/menus/${mid}/group/${group.id}`); }}>{t('edit')}</DropdownMenuItem>
            <DropdownMenuItem disabled={groupIndex === 0} onSelect={() => moveGroup(groupIndex, -1)}>{t('moveUp')}</DropdownMenuItem><DropdownMenuItem disabled={groupIndex === groups.length - 1} onSelect={() => moveGroup(groupIndex, 1)}>{t('moveDown')}</DropdownMenuItem>
            <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => handleDeleteGroup(group)}>{t('delete')}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>}
        </div>
        {isExpanded && <div id={`carte-group-${group.id}`}>
          {canEdit && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`${t('selectAll')} · ${group.name}`} checked={allSelected} disabled={pending || !items.length} ref={element => { if (element) element.indeterminate = selected.size > 0 && !allSelected; }} onChange={() => toggleSelectAllInGroup(group.id, items.map(item => item.id))} className="size-5 accent-[var(--brand-500)]" />{t('selectAll')}</label>
            {selected.size > 0 && <><span className="text-sm text-fg-secondary">{t('nSelected').replace('{n}', String(selected.size))}</span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => clearGroupSelection(group.id)}>{t('cancel')}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => { replacementProgress.current = { removed: new Set(), added: new Set() }; setReplaceModalSourceGroupId(group.id); }}>{t('replace')}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => { moveProgress.current = { added: false, removed: new Set() }; setMoveModalSourceGroupId(group.id); }}>{t('moveToGroup')}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => void bulkSetAvailability(group.id, 'force_sold_out')}>{t('quickMarkSoldOut')}</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => void bulkSetAvailability(group.id, 'force_available')}>{t('quickMarkAvailable')}</Button>
              <Button size="sm" variant="danger" disabled={pending} onFocus={event => { returnFocus.current = event.currentTarget; }} onClick={() => setConfirmation({ title: t('carteRemoveFromGroup'), description: t('removeSelectedFromGroupConfirm').replace('{n}', String(selected.size)), action: () => bulkRemoveFromGroup(group.id) })}>{t('carteRemoveFromGroup')}</Button>
            </>}
          </div>}
          <div className="overflow-x-auto">
            <div className="xl:min-w-[940px]">
              {!!items.length && <div aria-hidden className={`hidden ${CARTE_ITEM_COLUMNS} border-b border-[var(--line)] px-4 py-3 text-sm text-fg-secondary`}><span /><span>{t('article')}</span><span>{t('pointOfSale')}</span><span>{t('salesChannels')}</span><span>{t('modifiers')}</span><span>{t('availability')}</span><span className="text-end">{t('price')}</span><span /></div>}
              {items.map((item, index) => <CarteItemRow key={item.id} item={item} restaurantName={restaurant?.name} menu={menu} canEdit={canEdit} busy={pending} isSelected={selected.has(item.id)} onToggleSelected={() => toggleItemSelected(group.id, item.id)}
                isDragging={draggingItem?.itemId === item.id && draggingItem.groupId === group.id} onItemDragStart={event => handleItemDragStart(event, group.id, item.id)} onItemDragOver={event => handleItemDragOver(event, group.id, item.id)} onItemDrop={event => void handleItemDrop(event, group.id)} onItemDragEnd={() => setDraggingItem(null)}
                onOpen={() => openItem(item)} onToggleSoldOut={() => handleToggleSoldOut(item)} onRemove={() => void mutate(async () => { await removeItemForBatch(group.id, item.id); await reload(); })}
                onMoveUp={index ? () => moveItem(group, index, -1) : undefined} onMoveDown={index < items.length - 1 ? () => moveItem(group, index, 1) : undefined} />)}
            </div>
          </div>
          {canEdit && <Button variant="ghost" disabled={pending} className="m-2" onClick={() => setItemPickerGroupId(group.id)}><Plus />{t('addArticle')}</Button>}
          {isRotating && inactiveItems.length > 0 && <div className="border-t border-[var(--line)] p-3"><button type="button" aria-expanded={showInactiveByGroup.has(group.id)} className="flex min-h-11 items-center gap-2 text-start text-sm text-fg-secondary" onClick={() => toggleInactiveExpanded(group.id)}><ChevronDown className={`size-4 shrink-0 ${showInactiveByGroup.has(group.id) ? 'rotate-180' : ''}`} />{t('nItemsNotInThisBatch').replace('{n}', String(inactiveItems.length))}</button>
            {showInactiveByGroup.has(group.id) && inactiveItems.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] py-3"><span className="min-w-0 flex-1 break-words text-sm" dir="auto">{item.name}</span>{canEdit && <Button size="sm" variant="secondary" disabled={pending} onClick={() => void addItemToCurrentBatch(group.id, item.id)}>{t('addToThisBatch')}</Button>}</div>)}
          </div>}
        </div>}
      </section>;
    })}
    {canEdit && <Button variant="secondary" disabled={pending} onClick={() => router.push(`/${rid}/menu/menus/${mid}/group/new`)}><Plus />{t('addGroup')}</Button>}
    {itemPickerGroupId !== null && <AddRemoveItemsModal t={t} rid={rid} groupId={itemPickerGroupId} allItems={allItems} allCats={allCats} groupItems={groups.find(group => group.id === itemPickerGroupId)?.items ?? []} addScope={currentBatchScope} removeCutoff={batchRemoveCutoff} onClose={closePicker} onDone={() => closePicker(true)} onCreateNew={() => router.push(`/${rid}/menu/items/new`)} />}
    {moveModalSourceGroupId !== null && <MoveToGroupModal t={t} menus={allMenus} sourceGroupId={moveModalSourceGroupId} itemCount={selectedInGroup(moveModalSourceGroupId).size} onClose={() => { setMoveModalSourceGroupId(null); if (moveProgress.current.added || moveProgress.current.removed.size) void reload(); }} onPick={target => bulkMoveToGroup(moveModalSourceGroupId, target)} />}
    {replaceModalSourceGroupId !== null && <ReplaceItemsModal t={t} allItems={allItems} allCats={allCats} itemsToReplace={(groups.find(group => group.id === replaceModalSourceGroupId)?.items ?? []).filter(item => selectedInGroup(replaceModalSourceGroupId).has(item.id))} groupItemIds={new Set((groups.find(group => group.id === replaceModalSourceGroupId)?.items ?? []).map(item => item.id))} onClose={() => { setReplaceModalSourceGroupId(null); if (replacementProgress.current.removed.size || replacementProgress.current.added.size) void reload(); }} onDone={replacements => bulkReplace(replaceModalSourceGroupId, replacements)} />}
    <ConfirmDialog returnFocusRef={returnFocus} open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }} title={confirmation?.title} description={confirmation?.description} danger confirmLabel={t('confirm')} cancelLabel={t('cancel')} onConfirm={() => { if (confirmation) void mutate(confirmation.action); }} />
  </div>;
}
