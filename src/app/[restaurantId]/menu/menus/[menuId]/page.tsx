'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  listMenus, getRestaurant, deleteGroup, deleteMenu, reorderGroups,
  reorderGroupItems,
  listAllItems, addItemsToGroup, removeItemFromGroup,
  listGroupMemberships, getBatchFulfillmentConfig,
  getAllCategories,
  Menu, MenuGroup, MenuItem, MenuCategory, Restaurant,
  MenuGroupMembership, BatchFulfillmentConfigResponse, GroupItemScope,
} from '@/lib/api';
import { isMembershipActiveOn } from '@/lib/membership';
import { getPageCache, setPageCache, saveScroll, restoreScroll } from '@/lib/page-state';
import { BatchPicker } from '@/components/menu/BatchPicker';
import { useI18n } from '@/lib/i18n';
import {
  ArrowLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PlusIcon,
  LayoutGridIcon,
  XIcon,
  SearchIcon,
  GripVerticalIcon,
  MonitorSmartphoneIcon,
  ExternalLinkIcon,
} from 'lucide-react';

type TFn = (k: string) => string;

// Guest-facing foodyweb base URL — used to open the live order page for a
// future-week preview. Matches the env contract used by the website editor.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

// Grid column template — applied at md+ only. On mobile each row collapses to a
// stacked card with inline labels (see ItemRow below).
const GRID_COLS_DESKTOP = 'md:grid md:grid-cols-[40px_1.5fr_1fr_1fr_1fr_80px_40px] md:items-center';

function channelsMeta(m: Menu, t: TFn): string {
  const parts = [m.pos_enabled && t('posSystem'), m.web_enabled && 'Web'].filter(Boolean) as string[];
  if (parts.length === 0) return t('noChannels');
  if (parts.length === 1) return parts[0];
  return `${parts[0]}+ ${parts.length - 1} ${t('andNMore').replace('{n}', String(parts.length - 1)).replace(/^\+ \d+ /, '')}`;
}

function hoursRange(m: Menu): string | null {
  const hours = m.availability_hours;
  if (!hours || hours.length === 0 || m.follows_restaurant_hours) return null;
  const open = hours.filter((h) => !h.is_closed);
  if (open.length === 0) return null;
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const first = open[0];
  const last = open[open.length - 1];
  if (first.day_of_week === last.day_of_week) return `${dayNames[first.day_of_week]}, ${first.open_time} - ${first.close_time}`;
  return `${dayNames[first.day_of_week]} - ${dayNames[last.day_of_week]}, ${first.open_time} - ${last.close_time}`;
}

// ─── Tag / Pill ──────────────────────────────────────────────────────────────

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MenuDetailPage() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

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
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [headerDropdownOpen, setHeaderDropdownOpen] = useState(false);
  const [groupDropdown, setGroupDropdown] = useState<number | null>(null);
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

  const reload = useCallback(() => {
    setSyncing(true);
    Promise.all([listMenus(rid), listAllItems(rid)]).then(async ([menus, items]) => {
      setPageCache(cacheKey, { menus, items });
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      setAllMenus(menus);
      setAllItems(items);
      setOrderedGroupIds(null);
      setItemOrderByGroup(new Map());
      setSelectedItemsByGroup(new Map());
      if (!expandInitializedRef.current && found?.groups) {
        setExpanded(new Set(found.groups.map((g) => g.id)));
        expandInitializedRef.current = true;
      }
      // Batch-aware extras: only fired when the menu has the rotating flag.
      if (found?.is_weekly_rotating) {
        const groupList = found.groups ?? [];
        const [config, ...memberships] = await Promise.all([
          getBatchFulfillmentConfig(rid).catch(() => null),
          ...groupList.map((g) => listGroupMemberships(rid, g.id).catch(() => [])),
        ]);
        setBatchConfig(config);
        const next = new Map<number, MenuGroupMembership[]>();
        groupList.forEach((g, idx) => next.set(g.id, memberships[idx] ?? []));
        setMembershipsByGroup(next);
      } else {
        setBatchConfig(null);
        setMembershipsByGroup(new Map());
      }
    }).finally(() => { setLoading(false); setSyncing(false); });
  }, [rid, mid, cacheKey]);

  useEffect(() => { reload(); getRestaurant(rid).then(setRestaurant).catch(() => null); }, [reload, rid]);

  // Categories load independently of the menu reload — they only feed the
  // Replace modal's filter chips, so they don't need to block the main view.
  useEffect(() => { getAllCategories(rid).then(setAllCats).catch(() => null); }, [rid]);

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

  // Navigate to the article editor with a return address: the editor's Back
  // and post-save navigation honor `from`, landing the user back on this
  // carte. The item is stashed so the editor opens populated (same pattern
  // as the library's openEditor), and the scroll offset is saved for the
  // restore effect above.
  const openItem = (item: MenuItem) => {
    try {
      sessionStorage.setItem(`foody.menuItem.${item.id}`, JSON.stringify(item));
    } catch {
      /* quota or SSR — fall through */
    }
    saveScroll(cacheKey);
    router.push(`/${rid}/menu/items/${item.id}?from=${encodeURIComponent(pathname)}`);
  };

  const handleDeleteGroup = async (group: MenuGroup) => {
    if (!confirm(`${t('delete')} "${group.name}"?`)) return;
    await deleteGroup(rid, group.id);
    setGroupDropdown(null);
    setMenu((prev) => prev ? { ...prev, groups: prev.groups?.filter((g) => g.id !== group.id) } : prev);
    reload();
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="text-center py-16 text-[var(--text-secondary)]">
        Menu not found.
        <button onClick={() => router.back()} className="ml-2 underline">{t('back')}</button>
      </div>
    );
  }

  const baseGroups = menu.groups ?? [];
  const groups: MenuGroup[] = orderedGroupIds
    ? (orderedGroupIds.map((id) => baseGroups.find((g) => g.id === id)).filter(Boolean) as MenuGroup[])
    : baseGroups;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, groupId: number) => {
    setDraggingGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to initiate drag
    e.dataTransfer.setData('text/plain', String(groupId));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, groupId: number) => {
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
  const selectedDay = (selectedCycle?.fulfillment_days?.[0]?.date)
    ?? (selectedCycle?.cutoff_at ? selectedCycle.cutoff_at.slice(0, 10) : null);
  const isCurrentCycle = selectedCycleIndex === 0;
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
    await addItemsToGroup(rid, groupId, [itemId], currentBatchScope);
    reload();
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
    try {
      await reorderGroupItems(rid, groupId, finalOrder);
    } catch {
      reload();
    }
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
    if (!confirm(t('removeSelectedFromGroupConfirm').replace('{n}', String(ids.length)))) return;
    for (const itemId of ids) {
      await removeItemFromGroup(rid, groupId, itemId);
    }
    clearGroupSelection(groupId);
    patchGroupItems(groupId, (items) => items.filter((i) => !ids.includes(i.id)));
    reload();
  };

  // Move all currently-selected items from sourceGroupId into targetGroupId.
  // Server has no atomic move endpoint, so we add to the new group (batch) and
  // then remove from the old group one-by-one. Items already present in the
  // target group simply update their existing membership row (idempotent).
  const bulkMoveToGroup = async (sourceGroupId: number, targetGroupId: number) => {
    if (sourceGroupId === targetGroupId) return;
    const ids = Array.from(selectedInGroup(sourceGroupId));
    if (ids.length === 0) return;
    await addItemsToGroup(rid, targetGroupId, ids);
    for (const itemId of ids) {
      await removeItemFromGroup(rid, sourceGroupId, itemId);
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
  // modal. Mirrors the other bulk actions on this page: hard-remove the old
  // membership, then add the replacement scoped to the current batch.
  const bulkReplace = async (groupId: number, replacements: { oldId: number; newId: number }[]) => {
    if (replacements.length === 0) {
      setReplaceModalSourceGroupId(null);
      clearGroupSelection(groupId);
      return;
    }
    for (const { oldId, newId } of replacements) {
      await removeItemFromGroup(rid, groupId, oldId);
      await addItemsToGroup(rid, groupId, [newId], currentBatchScope);
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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetGroupId: number) => {
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

    try {
      await reorderGroups(rid, mid, next);
    } catch {
      reload();
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/${rid}/menu/menus`)}
            className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{menu.name}</h1>
              {syncing && (
                <div
                  className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full shrink-0"
                  aria-label={t('loading')}
                />
              )}
              <div className="relative">
                <button
                  onClick={() => setHeaderDropdownOpen(!headerDropdownOpen)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-2xl leading-none px-1"
                >
                  ···
                </button>
                {headerDropdownOpen && (
                  <div className="absolute left-0 top-10 z-30 w-72 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); router.push(`/${rid}/menu/menus/${mid}/edit`); }}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">{t('editMenuOption')}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('editMenuOptionDesc')}</p>
                    </button>
                    <div className="border-t border-[var(--divider)]" />
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); alert(t('comingSoon')); }}
                      className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      {t('duplicateMenu')}
                    </button>
                    <div className="border-t border-[var(--divider)]" />
                    <button
                      onClick={async () => {
                        setHeaderDropdownOpen(false);
                        if (!confirm(`${t('deleteMenuOption')} "${menu.name}"?`)) return;
                        await deleteMenu(rid, mid);
                        router.push(`/${rid}/menu/menus`);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      {t('deleteMenuOption')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0 mt-1 text-sm text-[var(--text-secondary)]">
              {restaurant?.name && (
                <>
                  <button
                    onClick={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}
                    className="flex items-center gap-1.5 hover:text-[var(--text-primary)] hover:underline transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                    {restaurant.name}
                  </button>
                  <span className="mx-2 text-[var(--text-muted)]">|</span>
                </>
              )}
              <button
                onClick={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}
                className="flex items-center gap-1.5 hover:text-[var(--text-primary)] hover:underline transition-colors cursor-pointer"
              >
                <LayoutGridIcon className="w-4 h-4 shrink-0" />
                {channelsMeta(menu, t)}
              </button>
              {hoursRange(menu) && (
                <>
                  <span className="mx-2 text-[var(--text-muted)]">|</span>
                  <button
                    onClick={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}
                    className="flex items-center gap-1.5 hover:text-[var(--text-primary)] hover:underline transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    {hoursRange(menu)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {isRotating && cycles.length > 0 && (
            <BatchPicker
              cycles={cycles}
              selectedIndex={selectedCycleIndex}
              onChange={setSelectedCycleIndex}
            />
          )}
          {/* Preview the selected série on the live guest site (view-only). Opens
              foodyweb with ?preview_date pinned to the cycle's fulfilment day, so
              the operator sees exactly what customers will see that week. */}
          {isRotating && selectedDay && restaurant?.slug && (
            <button
              className="btn-secondary rounded-full flex items-center gap-2"
              onClick={() =>
                window.open(
                  `${WEB_URL}/r/${restaurant.slug}/order?preview_date=${selectedDay}`,
                  '_blank',
                  'noopener'
                )
              }
              title={t('previewWeekHint') || 'Open the guest order page for this série (view-only)'}
            >
              <ExternalLinkIcon className="w-4 h-4" />
              {t('previewOnWeb') || 'Preview on web'}
            </button>
          )}
          {isRotating && cycles.length === 0 && (
            <button
              onClick={() => router.push(`/${rid}/settings/scheduled-orders`)}
              className="text-xs text-[var(--text-muted)] italic underline hover:text-[var(--text-primary)] transition-colors"
            >
              {t('configureBatchFirst') || 'Configurez les commandes anticipées dans les paramètres'}
            </button>
          )}
          <button
            className="btn-secondary rounded-full flex items-center gap-2"
            onClick={() => router.push(`/${rid}/menu/menus/${mid}/pos-display`)}
          >
            <MonitorSmartphoneIcon className="w-4 h-4" />
            {t('editPosLayout')}
          </button>
          <div className="relative">
            <button
              onClick={() => setAddDropdownOpen(!addDropdownOpen)}
              className="btn-primary rounded-full flex items-center gap-1.5"
            >
              {t('add')} <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {addDropdownOpen && (
              <div className="absolute right-0 top-12 z-30 w-56 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => { setAddDropdownOpen(false); router.push(`/${rid}/menu/items/new?menuId=${mid}`); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  {t('addArticle')}
                </button>
                <div className="border-t border-[var(--divider)]" />
                <button
                  onClick={() => { setAddDropdownOpen(false); router.push(`/${rid}/menu/menus/${mid}/group/new`); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  {t('addGroup')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Accordion Groups ── */}
      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] text-center py-16 text-sm text-[var(--text-muted)]">
            {t('noGroupsYet')}
          </div>
        )}

        {groups.map((group) => {
          const allItemsInGroup = itemsForGroup(group);
          const { active: items, inactive: inactiveItems } = splitForBatch(group, allItemsInGroup);
          const itemIds = items.map((i) => i.id);
          const selected = selectedInGroup(group.id);
          const inactiveExpanded = showInactiveByGroup.has(group.id);
          const allSelected = items.length > 0 && selected.size === items.length;
          const someSelected = selected.size > 0 && !allSelected;
          const isExpanded = expanded.has(group.id);
          const isDragging = draggingGroupId === group.id;
          const isDragTarget = dragOverGroupId === group.id && draggingGroupId !== null && draggingGroupId !== group.id;
          return (
            <div
              key={group.id}
              draggable={draggingItem === null}
              onDragStart={(e) => handleDragStart(e, group.id)}
              onDragOver={(e) => handleDragOver(e, group.id)}
              onDrop={(e) => handleDrop(e, group.id)}
              onDragEnd={clearDragState}
              onDragLeave={() => { if (dragOverGroupId === group.id) setDragOverGroupId(null); }}
              className={`rounded-xl border bg-[var(--surface)] transition-all ${isDragging ? 'opacity-40' : ''} ${isDragTarget ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-[var(--divider)]'}`}
            >
              {/* ── Group Header ── */}
              <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors ${isExpanded ? '' : 'rounded-xl'}`}
                onClick={() => toggleExpand(group.id)}
              >
                {/* Drag handle is desktop-only — touch reorder isn't supported. */}
                <GripVerticalIcon className="hidden md:block w-5 h-5 text-[var(--text-muted)] shrink-0 cursor-grab active:cursor-grabbing" />
                {isExpanded
                  ? <ChevronUpIcon className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                  : <ChevronDownIcon className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                }
                <span className="font-bold text-base text-[var(--text-primary)]">{group.name}</span>
                <span className="text-sm text-[var(--text-secondary)]">{t('nArticles').replace('{n}', String(items.length))}</span>
                <div className="flex-1" />
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setGroupDropdown(groupDropdown === group.id ? null : group.id); }}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] transition-colors"
                  >
                    <MoreHorizontalIcon className="w-5 h-5" />
                  </button>
                  {groupDropdown === group.id && (
                    <div className="absolute right-0 top-9 z-30 w-48 bg-[var(--surface-elevated,var(--surface))] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); setGroupDropdown(null); saveScroll(cacheKey); router.push(`/${rid}/menu/menus/${mid}/group/${group.id}`); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                      >
                        {t('edit')}
                      </button>
                      <div className="border-t border-[var(--divider)]" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Group Content (expanded) ── */}
              {isExpanded && (
                <div className="border-t border-[var(--divider)] rounded-b-xl">
                  {/* Bulk-action bar — shown when any items in this group are selected. */}
                  {selected.size > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-[color-mix(in_oklab,var(--brand-500)_8%,transparent)] border-b border-[var(--divider)]">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {t('nSelected').replace('{n}', String(selected.size))}
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => clearGroupSelection(group.id)}
                        className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        onClick={() => setReplaceModalSourceGroupId(group.id)}
                        className="text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {t('replace')}
                      </button>
                      <button
                        onClick={() => setMoveModalSourceGroupId(group.id)}
                        className="text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {t('moveToGroup')}
                      </button>
                      <button
                        onClick={() => bulkRemoveFromGroup(group.id)}
                        className="text-sm font-medium text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        {t('removeFromGroup')}
                      </button>
                    </div>
                  )}

                  {/* Table Header Row — desktop only, mobile rows show inline labels */}
                  {items.length > 0 && (
                    <div className={`hidden ${GRID_COLS_DESKTOP} px-4 py-2.5 border-b-2 border-[var(--text-primary)]`}>
                      <div>
                        <input
                          type="checkbox"
                          className="rounded border-[var(--divider)]"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={() => toggleSelectAllInGroup(group.id, itemIds)}
                        />
                      </div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('article')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('pointOfSale')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('salesChannels')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('modifiers')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide text-right">{t('price')}</div>
                      <div />
                    </div>
                  )}

                  {/* Item Rows */}
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      restaurantName={restaurant?.name}
                      menu={menu}
                      t={t}
                      rid={rid}
                      groupId={group.id}
                      isSelected={selected.has(item.id)}
                      onToggleSelected={() => toggleItemSelected(group.id, item.id)}
                      isDragging={draggingItem?.itemId === item.id && draggingItem.groupId === group.id}
                      onItemDragStart={(e) => handleItemDragStart(e, group.id, item.id)}
                      onItemDragOver={(e) => handleItemDragOver(e, group.id, item.id)}
                      onItemDrop={(e) => handleItemDrop(e, group.id)}
                      onItemDragEnd={() => setDraggingItem(null)}
                      onOpen={() => openItem(item)}
                      onRemoved={() => {
                        patchGroupItems(group.id, (items) => items.filter((i) => i.id !== item.id));
                        reload();
                      }}
                    />
                  ))}

                  {/* Add Item Row */}
                  <button
                    onClick={() => setItemPickerGroupId(group.id)}
                    className={`flex md:grid md:grid-cols-[40px_1.5fr_1fr_1fr_1fr_80px_40px] md:items-center w-full px-4 py-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]`}
                  >
                    <div className="hidden md:block" />
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PlusIcon className="w-4 h-4" />
                      {t('addArticle')}
                    </div>
                    <div className="hidden md:block" />
                    <div className="hidden md:block" />
                    <div className="hidden md:block" />
                    <div className="hidden md:block" />
                    <div className="hidden md:block" />
                  </button>

                  {/* Inactive items expander — only shown for rotating cartes
                      when the selected batch has items currently filtered out. */}
                  {isRotating && inactiveItems.length > 0 && (
                    <div className="border-t border-[var(--divider)]">
                      <button
                        onClick={() => toggleInactiveExpanded(group.id)}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
                      >
                        {inactiveExpanded
                          ? <ChevronUpIcon className="w-4 h-4" />
                          : <ChevronDownIcon className="w-4 h-4" />
                        }
                        {(t('nItemsNotInThisBatch') || '{n} articles hors de cette série').replace('{n}', String(inactiveItems.length))}
                      </button>
                      {inactiveExpanded && (
                        <div className="px-4 pb-3 flex flex-col gap-1">
                          {inactiveItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 py-2 text-sm text-[var(--text-secondary)]"
                            >
                              <span className="flex-1 truncate">{item.name}</span>
                              <button
                                onClick={() => addItemToCurrentBatch(group.id, item.id)}
                                className="text-xs font-medium px-3 py-1 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                {t('addToThisBatch') || 'Ajouter à cette série'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Add Group Card ── */}
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] overflow-hidden">
          <button
            onClick={() => router.push(`/${rid}/menu/menus/${mid}/group/new`)}
            className="flex items-center gap-3 w-full px-4 py-4 hover:bg-[var(--surface-subtle)] transition-colors text-base font-bold text-[var(--text-primary)]"
          >
            <PlusIcon className="w-5 h-5" />
            {t('addGroup')}
          </button>
        </div>
      </div>

      {/* ── Add/Remove Items Modal ── */}
      {itemPickerGroupId !== null && (
        <AddRemoveItemsModal
          t={t}
          rid={rid}
          groupId={itemPickerGroupId}
          allItems={allItems}
          allCats={allCats}
          groupItems={groups.find((g) => g.id === itemPickerGroupId)?.items ?? []}
          addScope={currentBatchScope}
          onClose={() => setItemPickerGroupId(null)}
          onDone={(added, removed) => {
            const groupId = itemPickerGroupId;
            setItemPickerGroupId(null);
            patchGroupItems(groupId, (items) => [
              ...items.filter((i) => !removed.includes(i.id)),
              ...allItems.filter((i) => added.includes(i.id) && !items.some((g) => g.id === i.id)),
            ]);
            reload();
          }}
          onCreateNew={() => { setItemPickerGroupId(null); router.push(`/${rid}/menu/items/new`); }}
        />
      )}

      {/* ── Bulk Move-to-Group Modal ── */}
      {moveModalSourceGroupId !== null && (
        <MoveToGroupModal
          t={t}
          menus={allMenus}
          sourceGroupId={moveModalSourceGroupId}
          itemCount={selectedInGroup(moveModalSourceGroupId).size}
          onClose={() => setMoveModalSourceGroupId(null)}
          onPick={(targetGroupId) => bulkMoveToGroup(moveModalSourceGroupId, targetGroupId)}
        />
      )}

      {/* ── Bulk Replace Modal (step-by-step) ── */}
      {replaceModalSourceGroupId !== null && (() => {
        const groupId = replaceModalSourceGroupId;
        const selectedIds = selectedInGroup(groupId);
        const groupItems = groups.find((g) => g.id === groupId)?.items ?? [];
        const itemsToReplace = groupItems.filter((i) => selectedIds.has(i.id));
        const groupItemIds = new Set<number>(groupItems.map((i) => i.id));
        if (itemsToReplace.length === 0) return null;
        return (
          <ReplaceItemsModal
            t={t}
            itemsToReplace={itemsToReplace}
            allItems={allItems}
            allCats={allCats}
            groupItemIds={groupItemIds}
            onClose={() => setReplaceModalSourceGroupId(null)}
            onDone={(replacements) => bulkReplace(groupId, replacements)}
          />
        );
      })()}
    </div>
  );
}

// ─── Add/Remove Items Modal ──────────────────────────────────────────────────

function AddRemoveItemsModal({ t, rid, groupId, allItems, allCats, groupItems, addScope, onClose, onDone, onCreateNew }: {
  t: TFn;
  rid: number;
  groupId: number;
  allItems: MenuItem[];
  allCats: MenuCategory[];
  groupItems: MenuItem[];
  /** When set (non-empty), newly added items are scoped to the given date
   *  window. Used by the carte page when a non-current batch is selected. */
  addScope?: GroupItemScope;
  onClose: () => void;
  onDone: (added: number[], removed: number[]) => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<number | null>(null); // null = all categories
  const [saving, setSaving] = useState(false);

  // Track which items are checked — initialize with items already in the group
  const originalIds = useMemo(() => new Set(groupItems.map((i) => i.id)), [groupItems]);
  const [checked, setChecked] = useState<Set<number>>(() => new Set(groupItems.map((i) => i.id)));

  // Categories that actually hold items, for the filter chips.
  const categories = useMemo(
    () => allCats.filter((c) => (c.items?.length ?? 0) > 0),
    [allCats],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter((item) =>
      (catFilter == null || item.category_id === catFilter) &&
      (!q || item.name.toLowerCase().includes(q))
    );
  }, [allItems, catFilter, search]);

  const selectedCount = checked.size;

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDone = async () => {
    setSaving(true);
    try {
      // Items to add (checked now but weren't before)
      const toAdd = Array.from(checked).filter((id) => !originalIds.has(id));
      // Items to remove (were checked before but aren't now)
      const toRemove = Array.from(originalIds).filter((id) => !checked.has(id));

      if (toAdd.length > 0) {
        await addItemsToGroup(rid, groupId, toAdd, addScope ?? {});
      }
      for (const id of toRemove) {
        await removeItemFromGroup(rid, groupId, id);
      }
      onDone(toAdd, toRemove);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[var(--divider)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
            >
              <XIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleDone}
              disabled={saving}
              className="btn-secondary rounded-full disabled:opacity-40"
            >
              {saving ? '...' : t('done')}
            </button>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">{t('addOrRemoveItems')}</h2>

          {/* Search */}
          <div className="relative mb-4">
            <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category filter chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setCatFilter(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${catFilter == null ? 'bg-[var(--text-primary)] text-[var(--surface)] border-[var(--text-primary)]' : 'border-[var(--divider)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
            >
              {t('allCategoriesFilter')}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${catFilter === c.id ? 'bg-[var(--text-primary)] text-[var(--surface)] border-[var(--text-primary)]' : 'border-[var(--divider)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Subheader */}
        <div className="flex items-center justify-between px-6 pb-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">{t('articlesGroup')}</span>
          <span className="text-sm text-[var(--text-secondary)]">{selectedCount} {t('selected')}</span>
        </div>
        <div className="mx-6 border-t-2 border-[var(--text-primary)]" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Create new */}
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
              <PlusIcon className="w-5 h-5 text-[var(--text-primary)]" />
            </div>
            <span className="text-base font-medium text-[var(--text-primary)]">{t('createNewItems')}</span>
          </button>

          {/* Items list */}
          {filtered.map((item) => (
            <label
              key={item.id}
              className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                {(item.variant_groups?.length ?? 0) > 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">{item.variant_groups!.length} {t('variants')}</p>
                )}
              </div>
              <input
                type="checkbox"
                checked={checked.has(item.id)}
                onChange={() => toggle(item.id)}
                className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0"
              />
            </label>
          ))}

          {filtered.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('noResults')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Replace Items Modal (step-by-step) ──────────────────────────────────────

function ReplaceItemsModal({ t, itemsToReplace, allItems, allCats, groupItemIds, onClose, onDone }: {
  t: TFn;
  itemsToReplace: MenuItem[];
  allItems: MenuItem[];
  allCats: MenuCategory[];
  groupItemIds: Set<number>;
  onClose: () => void;
  onDone: (replacements: { oldId: number; newId: number }[]) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  // oldItemId -> chosen replacement itemId. Built up as the operator advances
  // through one step per item being replaced.
  const [replacements, setReplacements] = useState<Map<number, number>>(new Map());
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<number | null>(null); // null = all categories
  const [saving, setSaving] = useState(false);

  const current: MenuItem | undefined = itemsToReplace[stepIndex];
  const isLast = stepIndex >= itemsToReplace.length - 1;

  // Categories that actually hold selectable items, used for the filter chips.
  const categories = useMemo(
    () => allCats.filter((c) => (c.items?.length ?? 0) > 0),
    [allCats],
  );

  // Replacements chosen for the *other* steps — excluded so the operator can't
  // assign the same item to two slots at once.
  const usedReplacementIds = useMemo(() => {
    const set = new Set<number>();
    replacements.forEach((newId, oldId) => {
      if (oldId !== current?.id) set.add(newId);
    });
    return set;
  }, [replacements, current]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter((item) =>
      !groupItemIds.has(item.id) &&          // not already in this group
      !usedReplacementIds.has(item.id) &&    // not picked for another slot
      (catFilter == null || item.category_id === catFilter) &&
      (!q || item.name.toLowerCase().includes(q))
    );
  }, [allItems, groupItemIds, usedReplacementIds, catFilter, search]);

  if (!current) return null;

  const selectedNewId = replacements.get(current.id) ?? null;

  const choose = (id: number) => {
    setReplacements((prev) => {
      const next = new Map(prev);
      if (next.get(current.id) === id) next.delete(current.id); else next.set(current.id, id);
      return next;
    });
  };

  const advanceWith = async (map: Map<number, number>) => {
    if (isLast) {
      setSaving(true);
      try {
        await onDone(Array.from(map).map(([oldId, newId]) => ({ oldId, newId })));
      } finally {
        setSaving(false);
      }
    } else {
      setStepIndex((i) => i + 1);
      setSearch('');
    }
  };

  const handleNext = () => advanceWith(replacements);

  const handleSkip = () => {
    const next = new Map(replacements);
    next.delete(current.id);
    setReplacements(next);
    advanceWith(next);
  };

  const goBack = () => {
    if (stepIndex > 0) { setStepIndex((i) => i - 1); setSearch(''); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[var(--divider)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
              >
                <XIcon className="w-5 h-5" />
              </button>
              {stepIndex > 0 && (
                <button onClick={goBack} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors">
                  {t('back')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSkip} disabled={saving} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors disabled:opacity-40">
                {t('skip')}
              </button>
              <button
                onClick={handleNext}
                disabled={selectedNewId == null || saving}
                className="btn-secondary rounded-full disabled:opacity-40"
              >
                {saving ? '...' : isLast ? t('done') : t('next')}
              </button>
            </div>
          </div>
          <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">
            {t('replaceStepProgress')
              .replace('{current}', String(stepIndex + 1))
              .replace('{total}', String(itemsToReplace.length))}
          </p>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
            {t('replaceSelectFor').replace('{name}', current.name)}
          </h2>

          {/* Search */}
          <div className="relative mb-4">
            <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category filter chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setCatFilter(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${catFilter == null ? 'bg-[var(--text-primary)] text-[var(--surface)] border-[var(--text-primary)]' : 'border-[var(--divider)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
            >
              {t('allCategoriesFilter')}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(c.id)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${catFilter === c.id ? 'bg-[var(--text-primary)] text-[var(--surface)] border-[var(--text-primary)]' : 'border-[var(--divider)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-6 border-t-2 border-[var(--text-primary)]" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filtered.map((item) => (
            <label
              key={item.id}
              className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                <p className="text-sm text-[var(--text-secondary)]">{item.price?.toFixed(2)} ₪</p>
              </div>
              <input
                type="radio"
                name={`replace-${current.id}`}
                checked={selectedNewId === item.id}
                onChange={() => choose(item.id)}
                className="w-5 h-5 shrink-0 accent-[var(--brand-500)]"
              />
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('noResults')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Move-to-Group Modal ────────────────────────────────────────────────────

function MoveToGroupModal({ t, menus, sourceGroupId, itemCount, onClose, onPick }: {
  t: TFn;
  menus: Menu[];
  sourceGroupId: number;
  itemCount: number;
  onClose: () => void;
  onPick: (targetGroupId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<number | null>(null);

  const visibleMenus = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { menu: Menu; groups: MenuGroup[] }[] = [];
    for (const m of menus) {
      const menuMatches = !q || m.name.toLowerCase().includes(q);
      const groups = (m.groups ?? []).filter((g) => {
        if (g.id === sourceGroupId) return false;
        if (!q) return true;
        return menuMatches || g.name.toLowerCase().includes(q);
      });
      if (groups.length === 0) continue;
      out.push({ menu: m, groups });
    }
    return out;
  }, [menus, search, sourceGroupId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col border border-[var(--divider)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
            >
              <XIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => picked !== null && onPick(picked)}
              disabled={picked === null}
              className="btn-secondary rounded-full disabled:opacity-40"
            >
              {t('move')}
            </button>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">{t('moveToGroup')}</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {t('moveToGroupDesc').replace('{n}', String(itemCount))}
          </p>
          <div className="relative">
            <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {visibleMenus.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('noResults')}</p>
          ) : (
            visibleMenus.map(({ menu: m, groups }) => (
              <div key={m.id} className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                  {m.name}
                </div>
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-3 py-3 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                    onClick={() => setPicked(g.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-[var(--text-primary)] truncate">{g.name}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${picked === g.id ? 'border-fg-primary' : 'border-[var(--divider)]'}`}>
                      {picked === g.id && <div className="w-2.5 h-2.5 rounded-full bg-fg-primary" />}
                    </div>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Row (CSS Grid) ─────────────────────────────────────────────────────

function ItemRow({
  item, restaurantName, menu, t, rid, groupId, onOpen, onRemoved,
  isSelected, onToggleSelected,
  isDragging, onItemDragStart, onItemDragOver, onItemDrop, onItemDragEnd,
}: {
  item: MenuItem;
  restaurantName?: string;
  menu: Menu;
  t: TFn;
  rid: number;
  groupId: number;
  onOpen: () => void;
  onRemoved: () => void;
  isSelected: boolean;
  onToggleSelected: () => void;
  isDragging: boolean;
  onItemDragStart: (e: React.DragEvent<HTMLElement>) => void;
  onItemDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onItemDrop: (e: React.DragEvent<HTMLElement>) => void;
  onItemDragEnd: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openDropdown = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setDropdownOpen(true);
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  const modifierNames = (item.modifier_sets ?? []).map((ms) => ms.name).join(', ') || '—';
  const channelTags: string[] = [];
  if (menu.pos_enabled) channelTags.push(t('posSystem'));
  if (menu.web_enabled) channelTags.push('Web');

  const handleRemoveFromGroup = async () => {
    setDropdownOpen(false);
    if (!confirm(`${t('removeFromGroupConfirm')} "${item.name}"?`)) return;
    await removeItemFromGroup(rid, groupId, item.id);
    onRemoved();
  };

  return (
    <div
      draggable
      onDragStart={onItemDragStart}
      onDragOver={onItemDragOver}
      onDrop={onItemDrop}
      onDragEnd={onItemDragEnd}
      className={`relative flex flex-col gap-2 ${GRID_COLS_DESKTOP} md:gap-0 px-4 py-3 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer ${isDragging ? 'opacity-40' : ''}`}
      onClick={onOpen}
    >
      {/* Checkbox + drag handle — desktop only; cards collapse on mobile */}
      <div className="hidden md:flex md:items-center md:gap-1.5" onClick={(e) => e.stopPropagation()}>
        <GripVerticalIcon className="w-4 h-4 text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0" />
        <input
          type="checkbox"
          className="rounded border-[var(--divider)]"
          checked={isSelected}
          onChange={onToggleSelected}
        />
      </div>

      {/* Article name + image (card heading on mobile) */}
      <div className="flex items-center gap-3 min-w-0 pe-10 md:pe-0">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
          </div>
        )}
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{item.name}</span>
      </div>

      {/* Point of sale */}
      <div className="flex items-center justify-between md:block gap-3">
        <span className="md:hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t('pointOfSale')}</span>
        <div>{restaurantName && <Tag>{restaurantName}</Tag>}</div>
      </div>

      {/* Sales channels */}
      <div className="flex items-center justify-between md:block gap-3">
        <span className="md:hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t('salesChannels')}</span>
        <div className="flex gap-1.5 flex-wrap justify-end md:justify-start">
          {channelTags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
      </div>

      {/* Modifiers */}
      <div className="flex items-center justify-between md:block gap-3 min-w-0">
        <span className="md:hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] shrink-0">{t('modifiers')}</span>
        <div className="text-sm text-[var(--text-secondary)] truncate text-end md:text-start">{modifierNames}</div>
      </div>

      {/* Price */}
      <div className="flex items-center justify-between md:block gap-3">
        <span className="md:hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t('price')}</span>
        <div className="text-sm font-semibold text-[var(--text-primary)] text-end">
          {item.price?.toFixed(2)} ₪
        </div>
      </div>

      {/* Actions — pinned to top-end corner on mobile, inline on desktop */}
      <div className="absolute top-3 end-4 md:static md:flex md:justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          ref={buttonRef}
          onClick={() => (dropdownOpen ? setDropdownOpen(false) : openDropdown())}
          className="p-1 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] transition-colors"
        >
          <MoreHorizontalIcon className="w-4 h-4" />
        </button>
        {dropdownOpen && dropdownPos && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div
              className="fixed z-50 w-64 bg-[var(--surface-elevated,var(--surface))] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden"
              style={{ top: dropdownPos.top, right: dropdownPos.right }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { setDropdownOpen(false); onOpen(); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {t('editItemDetails')}
              </button>
              <div className="border-t border-[var(--divider)]" />
              <button
                onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {t('duplicateItem')}
              </button>
              <div className="border-t border-[var(--divider)]" />
              <button
                onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {t('changeModifiers')}
              </button>
              <div className="border-t border-[var(--divider)]" />
              <button
                onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {t('archiveItem')}
              </button>
              <div className="border-t border-[var(--divider)]" />
              <button
                onClick={handleRemoveFromGroup}
                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              >
                {t('removeFromGroup')}
              </button>
            </div>
          </>,
          document.body,
        )}
      </div>
    </div>
  );
}
