'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMenu, listAllItems, createOrder, ApiError, getInternalCheckoutCapabilities,
  getStaffBatchFulfillmentConfig, listGroupMemberships,
  type Menu, type MenuItem, type PaymentStatus,
  type BatchFulfillmentConfigResponse, type MenuGroupMembership,
} from '@/lib/api';
import { isMembershipActiveOn } from '@/lib/membership';
import { itemSizeOptions } from '@/lib/item-options';
import { isItemSoldOut } from '@/lib/orders/itemAvailability';
import {
  loadOrderDraft, saveOrderDraft, clearOrderDraft, type DraftCustomer,
} from '@/lib/orders/orderDraft';
import { rehydrateDraftLines, toDraftLines, type LineIssue } from '@/lib/orders/draftLines';
import {
  issueLabel, issueTone, issueCanBeAccepted, isSubmissionBlocked,
} from '@/lib/orders/draftIssuePresentation';
import { useI18n, useCurrency } from '@/lib/i18n';
import { useSidebar } from '@/lib/sidebar-context';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button } from '@/components/ds';
import { BatchPicker } from '@/components/menu/BatchPicker';
import { DraftRestoredBanner } from '@/components/orders/DraftRestoredBanner';
import { cn } from '@/lib/utils';
import {
  NewOrderItemModal, lineUnitPrice, lineTotal, type NewOrderLine,
} from '@/components/orders/NewOrderItemModal';
import {
  NewOrderCheckoutPanel, type CheckoutData, type DrawerDraftState,
} from '@/components/orders/NewOrderCheckoutPanel';
import { InternalOrderPayment } from '@/components/orders/InternalOrderPayment';
import { NewOrderComboModal } from '@/components/orders/NewOrderComboModal';
import {
  ArrowLeftIcon, SearchIcon, PlusIcon, MinusIcon, Trash2Icon,
  CopyIcon, CheckIcon, ShoppingBagIcon, XIcon,
  LayoutGridIcon, PanelLeftCloseIcon, PanelLeftOpenIcon,
} from 'lucide-react';

interface Section { id: number; name: string; items: MenuItem[] }

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}-${Math.random()}`;
}

/** Removes one line's entry from `issues`, or returns the same map reference
 *  when there's nothing to remove (so a functional `setIssues` update can
 *  bail out without triggering a re-render). Shared by `acceptIssue` and
 *  `removeLine` so both resolve actions prune the same way. */
function dropIssue(prev: Map<string, LineIssue>, lineUid: string): Map<string, LineIssue> {
  if (!prev.has(lineUid)) return prev;
  const next = new Map(prev);
  next.delete(lineUid);
  return next;
}

// Fallback customer used when saving a draft before the drawer has reported
// any state (e.g. a cart-only draft — checkout never opened).
const EMPTY_CUSTOMER: DraftCustomer = {
  name: '', phone: '', address: '', city: '', floor: '', apt: '', entryCode: '', deliveryNotes: '',
};

// Categorical palette (from design tokens) used to colour-code sections in the
// grid — colour the section header and the chip dot
// so staff can scan the catalog by category the way a real POS does.
const CAT_TOKENS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];
function catColor(index: number): string {
  const i = ((index % CAT_TOKENS.length) + CAT_TOKENS.length) % CAT_TOKENS.length;
  return `var(${CAT_TOKENS[i]})`;
}

// An item opens the config modal only when it actually has choices to make;
// otherwise it adds instantly (POS speed). Sizes come from itemSizeOptions
// (option sets — NOT the dead legacy variant_groups): reading the legacy
// tables here quick-added option-set items without ever asking for a size,
// creating size-less lines the production sheet could not weigh.
function hasOptions(it: MenuItem): boolean {
  const variants = itemSizeOptions(it).length > 0 || it.option_sets?.some(set => set.selection_role === "identity");
  const mods =
    (it.modifiers ?? []).some((m) => m.is_active) ||
    (it.modifier_sets ?? []).some((s) => (s.modifiers ?? []).some((m) => m.is_active));
  return variants || mods;
}

export default function NewOrderPage() {
  const { money } = useCurrency();
  const { t, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  const { collapsed, toggleCollapsed } = useSidebar();
  const continueRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const params = useParams();
  const router = useRouter();
  const restaurantId = Number(params.restaurantId);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [itemMap, setItemMap] = useState<Map<number, MenuItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobilePane, setMobilePane] = useState<'catalogue' | 'ticket'>('catalogue');
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [comboItem, setComboItem] = useState<MenuItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Draft persistence — see src/lib/orders/orderDraft.ts and draftLines.ts.
  // `drawerState` is the drawer's draftable slice, reported via onStateChange.
  const [drawerState, setDrawerState] = useState<DrawerDraftState | null>(null);
  // Lines flagged by rehydration (missing / sold out / price changed). Kept
  // separate from `lines` rather than folded into each line's shape: an issue
  // is provisional (accept/remove clears it) while the line itself is the
  // durable cart state that gets saved to the draft and sent to the server.
  const [issues, setIssues] = useState<Map<string, LineIssue>>(new Map());
  const [draftRestored, setDraftRestored] = useState(false);
  const [restoredState, setRestoredState] = useState<DrawerDraftState | null>(null);
  // Prix mémorisés par ligne restaurée. C'est la référence contre laquelle « le
  // prix a changé » se mesure, et elle doit survivre à la réécriture qui suit
  // la reprise : recalculée depuis l'article courant, elle se remplaçait par le
  // nouveau prix et la ligne revenait saine au retour suivant. Une entrée
  // disparaît quand le staff accepte le changement — accepter, c'est justement
  // dire que le prix courant devient la référence.
  const [draftPrices, setDraftPrices] = useState<Map<string, number>>(new Map());
  // Remount key for the checkout drawer. The drawer keeps the customer sheet in
  // its own `useState`, and Radix only portals its *content* — closing it
  // unmounts the dialog, never the component — so nothing the page does to
  // `lines` can reach the customer fields. Bumping this key is the one honest
  // way to drop them: it remounts the subtree, so every field (name, phone,
  // address, `linked`, payment, discount) returns to its initial value with no
  // per-field reset list to keep in sync. Without it, discarding a restored
  // draft kept customer A attached while the staff built customer B's cart, and
  // the next write-back saved B's lines under A's name and address.
  const [drawerResetKey, setDrawerResetKey] = useState(0);

  const [removedLine, setRemovedLine] = useState<{ line: NewOrderLine; index: number; issue?: LineIssue; draftPrice?: number; restored: boolean } | null>(null);
  useEffect(() => {
    if (!removedLine) return;
    const timer = setTimeout(() => setRemovedLine(null), 10000);
    return () => clearTimeout(timer);
  }, [removedLine]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sumitCheckoutEnabled, setSumitCheckoutEnabled] = useState(false);
  const [cardOrder, setCardOrder] = useState<{ id: number; token: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSumitCheckoutEnabled(false);
    getInternalCheckoutCapabilities(restaurantId).then(result => {
      if (!cancelled) setSumitCheckoutEnabled(result.enabled === true);
    }).catch(() => { if (!cancelled) setSumitCheckoutEnabled(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Category filter: 'all' shows every section, otherwise a single group id.
  const [activeSection, setActiveSection] = useState<number | 'all'>('all');
  // The library is independent of menu membership, channels and rotation.
  const [activeMenuId, setActiveMenuId] = useState<number | 'library' | null>(null);
  // Weekly-rotating carte state (only populated when the active carte rotates).
  const [batchConfig, setBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState(0);
  const [membershipsByGroup, setMembershipsByGroup] = useState<Map<number, MenuGroupMembership[]>>(new Map());
  // The internal order flow deliberately uses the staff config: unlike the
  // public config, it also exposes the current in-production série after its
  // ordering cutoff. This lets an admin add a late manual order to that série.
  // It remains independent of the rotating carte batchConfig below.
  const [fulfillmentBatchConfig, setFulfillmentBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    getStaffBatchFulfillmentConfig(restaurantId)
      .then((cfg) => { if (!cancelled) setFulfillmentBatchConfig(cfg); })
      .catch(() => { if (!cancelled) setFulfillmentBatchConfig(null); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [menuList, items] = await Promise.all([
          getMenu(restaurantId),
          listAllItems(restaurantId),
        ]);
        if (cancelled) return;
        setMenus(menuList);
        setItemMap(new Map(items.map((it) => [it.id, it])));
        // Default to the first POS carte in sort_order (matches the Cartes page).
        const firstCarte =
          [...menuList]
            .filter((m) => m.pos_enabled !== false)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)[0];
        setActiveMenuId((prev) => prev ?? firstCarte?.id ?? 'library');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId, loadAttempt]);

  // Restore a stored draft once the menu has actually loaded. `itemMap` has to
  // be populated first: rehydrateDraftLines tells "this item is gone" from
  // "the menu hasn't arrived yet" only by looking the id up in it, so restoring
  // any earlier would flag every single line as missing.
  const didRestore = useRef(false);
  // Pending debounced write-back, and "this cart has already been sent to the
  // kitchen" — see the write-back effect below and `forgetDraft`.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  useEffect(() => {
    if (didRestore.current || loading || itemMap.size === 0) return;
    didRestore.current = true;

    const draft = loadOrderDraft(restaurantId);
    if (!draft) return;

    const rehydrated = rehydrateDraftLines(draft.lines, itemMap);
    setLines(rehydrated.map((r) => r.line));
    setIssues(new Map(rehydrated.filter((r) => r.issue).map((r) => [r.line.uid, r.issue!])));
    setDraftPrices(new Map(rehydrated.map((r) => [r.line.uid, r.unitPriceAtDraft])));
    setRestoredState({
      customer: draft.customer, linked: draft.linked,
      orderType: draft.orderType, fulfillment: draft.fulfillment,
    });
    setDraftRestored(true);
  }, [loading, itemMap, restaurantId]);

  // An issue must never outlive its line: once a flagged line leaves the cart,
  // its entry in `issues` would otherwise linger and keep the checkout button
  // blocked with a reason that no longer applies. `removeLine` already prunes
  // its own line synchronously (so the button updates on the same paint as
  // the click); this effect is the general safety net for every other path
  // that can also drop a line — quantity reaching zero, "Clear all" — without
  // repeating the cleanup at each call site.
  useEffect(() => {
    setIssues((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(lines.map((l) => l.uid));
      let changed = false;
      const next = new Map<string, LineIssue>();
      prev.forEach((issue, lineUid) => {
        if (live.has(lineUid)) next.set(lineUid, issue);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [lines]);

  // Debounced write-back. Gated on `didRestore` so the very first render (empty
  // cart, before the restore attempt above has even run) never overwrites a
  // stored draft with nothing — that would destroy exactly what this feature
  // protects.
  //
  // The pending timer is held in a ref so `forgetDraft` can cancel it, and the
  // callback re-checks `submittedRef` before writing. Both are needed and for
  // different windows: the ref kills a timer that has not fired yet, the flag
  // stops one that is already running. Without them a write armed just before
  // "Create order" fired *after* the draft was cleared and put the order back
  // in storage — and on the payment-link branch the page does not navigate, so
  // that timer was guaranteed to survive. The next visit would then restore a
  // cart that is already in the kitchen, under a banner that says nothing about
  // it having been sent.
  useEffect(() => {
    if (!didRestore.current || submittedRef.current) return;
    const timer = setTimeout(() => {
      saveTimerRef.current = null;
      if (submittedRef.current) return;
      saveOrderDraft(restaurantId, {
        lines: toDraftLines(lines, draftPrices),
        customer: drawerState?.customer ?? EMPTY_CUSTOMER,
        linked: drawerState?.linked ?? null,
        orderType: drawerState?.orderType ?? 'pickup',
        fulfillment: drawerState?.fulfillment ?? { timing: 'immediate' },
      });
    }, 500);
    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (saveTimerRef.current === timer) saveTimerRef.current = null;
    };
  }, [lines, drawerState, draftPrices, restaurantId]);

  // POS-orderable cartes (menus), in the same order as the Cartes page
  // (sort_order, set via "Réorganiser"). Drives the carte selector.
  const cartes = useMemo(
    () =>
      menus
        .filter((m) => m.pos_enabled !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id),
    [menus],
  );
  const libraryLabel = t('catering_choice_article_library');
  const catalogSources = [...cartes, { id: 'library' as const, name: libraryLabel }];
  const activeMenu = useMemo(() => menus.find((m) => m.id === activeMenuId) ?? null, [menus, activeMenuId]);

  // Weekly-rotation context for the active carte.
  const isRotating = !!activeMenu?.is_weekly_rotating;
  const cycles = batchConfig?.upcoming_cycles ?? [];
  const selectedCycle = cycles[Math.min(selectedCycleIndex, Math.max(cycles.length - 1, 0))] ?? null;
  // The ISO day used to filter rotating items: the cycle's primary fulfilment
  // day, falling back to its cutoff date.
  const selectedDay =
    selectedCycle?.fulfillment_days?.[0]?.date ??
    (selectedCycle?.cutoff_at ? selectedCycle.cutoff_at.slice(0, 10) : null);

  // When the active carte rotates, load its staff-visible batch cycles + per-group
  // memberships so items can be filtered to the selected week. The same closed
  // current série offered at checkout must be selectable here too, otherwise the
  // operator would browse next week's composition while ordering for this week.
  useEffect(() => {
    if (!activeMenu?.is_weekly_rotating) {
      setBatchConfig(null);
      setMembershipsByGroup(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const groupList = activeMenu.groups ?? [];
      const [config, ...memberships] = await Promise.all([
        getStaffBatchFulfillmentConfig(restaurantId).catch(() => null),
        ...groupList.map((g) => listGroupMemberships(restaurantId, g.id).catch(() => [] as MenuGroupMembership[])),
      ]);
      if (cancelled) return;
      setBatchConfig(config);
      setSelectedCycleIndex(0);
      const next = new Map<number, MenuGroupMembership[]>();
      groupList.forEach((g, idx) => next.set(g.id, memberships[idx] ?? []));
      setMembershipsByGroup(next);
    })();
    return () => { cancelled = true; };
  }, [activeMenu, restaurantId]);

  // Customer-facing, orderable sections for the active carte: visible POS groups
  // with active items, filtered to the selected week when the carte rotates.
  const sections = useMemo<Section[]>(() => {
    const q = search.trim().toLowerCase();
    const out: Section[] = [];
    if (activeMenuId === 'library') {
      const items = Array.from(itemMap.values())
        .filter((it) => it.is_active && (!q || it.name.toLowerCase().includes(q)))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
      return items.length > 0 ? [{ id: 0, name: libraryLabel, items }] : [];
    }
    if (!activeMenu) return out;
    // For a weekly-rotating carte, the staff menu endpoint (GET /menu/) pre-filters
    // each group's items to TODAY. That hides items whose série window opens on a
    // later fulfilment day (e.g. next Friday's Poissons), so the picker showed far
    // fewer items than the customer's web menu for the selected batch. Rebuild each
    // group from the série-aware memberships instead — active on the selected day —
    // and resolve full item data (variants, modifiers, combos) from itemMap
    // (GET /menu/items, which is série-agnostic and carries every item). Fall back
    // to group.items until memberships have loaded to avoid a transient empty grid.
    const useMemberships = isRotating && !!selectedDay && membershipsByGroup.size > 0;
    for (const group of activeMenu.groups ?? []) {
      if (group.is_hidden || group.pos_enabled === false) continue;
      const source: MenuItem[] = useMemberships
        ? (membershipsByGroup.get(group.id) ?? [])
            .filter((m) => isMembershipActiveOn(m, selectedDay as string))
            .map((m) => itemMap.get(m.menu_item_id) ?? m.item)
            .filter((it): it is MenuItem => !!it)
        : (group.items ?? []).map((gi) => itemMap.get(gi.id) ?? gi);
      const items = source
        .filter((it) => it.is_active)
        .filter((it) => !q || it.name.toLowerCase().includes(q));
      if (items.length > 0) out.push({ id: group.id, name: group.name, items });
    }
    return out;
  }, [activeMenuId, activeMenu, itemMap, search, isRotating, selectedDay, membershipsByGroup, libraryLabel]);

  // Drop the category filter if the active section disappears (e.g. cleared by
  // a search), so the grid never ends up showing nothing unexpectedly.
  useEffect(() => {
    if (activeSection !== 'all' && !sections.some((s) => s.id === activeSection)) {
      setActiveSection('all');
    }
  }, [sections, activeSection]);

  // Sections actually rendered: a single category when one is picked, else all.
  const displaySections = useMemo(
    () => (activeSection === 'all' ? sections : sections.filter((s) => s.id === activeSection)),
    [sections, activeSection],
  );

  // Stable category colour per visible section (keyed by group id) so a tile's
  // accent colour stays the same whether "all" or a single category is shown.
  const sectionColorById = useMemo(
    () => new Map(sections.map((s, i) => [s.id, catColor(i)] as const)),
    [sections],
  );

  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  // Every flagged line must be dealt with (accepted or removed) before the
  // order can go to checkout — see DraftRestoredBanner.
  const blockedByIssues = isSubmissionBlocked(issues);

  // Per-item quantity in the ticket, for the tile badge.
  const qtyByItem = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of lines) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  function handleTile(it: MenuItem) {
    const full = itemMap.get(it.id) ?? it;
    // Defensive: sold-out tiles are rendered disabled, but never let a stale
    // click add a line the order-time guard would reject.
    if (isItemSoldOut(full)) return;
    if (full.item_type === 'combo') {
      setComboItem(full);
      return;
    }
    if (hasOptions(full)) {
      setModalItem(full);
      return;
    }
    // Quick add — merge into an existing plain line for the same item.
    setDraftRestored(false);
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.item.id === full.id && !l.selectedVariantId && l.modifiers.length === 0 && !l.notes,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { uid: uid(), item: full, quantity: 1, notes: '', modifiers: [] }];
    });
  }

  function addLine(line: NewOrderLine) {
    setDraftRestored(false);
    setLines((prev) => [...prev, line]);
  }

  function changeQty(lineUid: string, delta: number) {
    const line = lines.find(line => line.uid === lineUid);
    if (line && line.quantity + delta <= 0) { removeLine(lineUid); return; }
    setDraftRestored(false);
    setLines(prev => prev.map(line => line.uid === lineUid ? { ...line, quantity: line.quantity + delta } : line));
  }

  function removeLine(lineUid: string) {
    const index = lines.findIndex(line => line.uid === lineUid);
    if (index < 0) return;
    setRemovedLine({ line: lines[index], index, issue: issues.get(lineUid), draftPrice: draftPrices.get(lineUid), restored: draftRestored });
    if (!issues.has(lineUid)) setDraftRestored(false);
    setLines(prev => prev.filter(line => line.uid !== lineUid));
    setIssues(prev => dropIssue(prev, lineUid));
  }

  function undoRemove() {
    if (!removedLine || lines.some(line => line.uid === removedLine.line.uid)) return;
    const { line, index, issue, draftPrice, restored } = removedLine;
    setLines(prev => [...prev.slice(0, index), line, ...prev.slice(index)]);
    if (issue) setIssues(prev => new Map(prev).set(line.uid, issue));
    if (draftPrice !== undefined) setDraftPrices(prev => new Map(prev).set(line.uid, draftPrice));
    setDraftRestored(restored);
    setRemovedLine(null);
  }

  function backToItems() {
    setCheckoutOpen(false);
    requestAnimationFrame(() => continueRef.current?.focus());
  }

  // Lifts the block on a `price_changed` line without touching it: the price
  // shown already comes from `lineUnitPrice` on the current item, and the
  // server recomputes the authoritative total at creation. Not treated as a
  // cart change (unlike add/qty/remove above) — the staff is dealing with the
  // resumed draft itself, not adding new work on top of it, so the banner
  // stays up.
  function acceptIssue(lineUid: string) {
    setIssues((prev) => dropIssue(prev, lineUid));
    // Le prix courant devient la référence — c'est la définition d'accepter.
    // Sans cet oubli, la réécriture garderait l'ancien prix et la ligne
    // reviendrait signalée au prochain retour, malgré l'acceptation.
    setDraftPrices((prev) => {
      if (!prev.has(lineUid)) return prev;
      const next = new Map(prev);
      next.delete(lineUid);
      return next;
    });
  }

  /** Erases the stored draft *and* the write that was about to recreate it.
   *  Clearing storage alone is not enough: a debounced write armed moments
   *  earlier fires afterwards and puts the record straight back. */
  function forgetDraft() {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    clearOrderDraft(restaurantId);
  }

  /** Everything a discard has to put back to zero, cart and customer alike.
   *  Emptying the cart without remounting the drawer left the previous
   *  customer attached — name, phone, address and the "Client existant" chip —
   *  so the next order was silently composed under the wrong identity. The two
   *  halves of an order are discarded together or not at all. */
  function resetOrderComposition() {
    setRemovedLine(null);
    setCheckoutOpen(false);
    setLines([]);
    setIssues(new Map());
    setDraftPrices(new Map());
    setDraftRestored(false);
    setRestoredState(null);
    setDrawerResetKey((k) => k + 1);
  }

  async function handleConfirm(data: CheckoutData) {
    if (submittingRef.current || !canManage || blockedByIssues || lines.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Payment link → defer to the provider: no method, server sets it pending.
      // Cash / card → carry the method (so an uncollected cash order still shows
      // the cash badge) and mark paid or unpaid per the "déjà encaissé ?" toggle.
      const isLink = data.paymentMethod === 'link';
      const isSumit = isLink || data.paymentMethod === 'sumit_card';
      const paymentMethod = isSumit ? undefined : data.paymentMethod;
      const paymentStatus: PaymentStatus | undefined = isSumit
        ? undefined
        : data.paymentCollected
          ? 'paid'
          : 'unpaid';

      const res = await createOrder(restaurantId, {
        order_type: data.orderType,
        customer_name: data.customerName.trim(),
        customer_phone: data.customerPhone.trim(),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_required: false,
        ...(isSumit ? { internal_checkout: isLink ? 'link' as const : 'card' as const } : {}),
        force_production: data.addToProduction,
        ...(data.fulfillment.timing === 'scheduled' && data.fulfillment.scheduledFor
          ? {
              is_scheduled: true,
              scheduled_for: data.fulfillment.scheduledFor,
              scheduled_pickup_window_start: data.fulfillment.windowStart,
              scheduled_pickup_window_end: data.fulfillment.windowEnd,
            }
          : {}),
        ...(data.orderType === 'delivery'
          ? {
              delivery_address: data.address.trim(),
              delivery_city: data.city.trim() || undefined,
              delivery_floor: data.floor.trim() || undefined,
              delivery_apt: data.apt.trim() || undefined,
              delivery_notes: data.deliveryNotes.trim() || undefined,
              delivery_entry_code: data.entryCode.trim() || undefined,
              delivery_fee: data.deliveryFee,
            }
          : {}),
        items: lines
          .filter((l) => l.comboItemId == null)
          .map((l) => ({
            menu_item_id: l.item.id,
            quantity: l.quantity,
            selected_variant_id: l.selectedVariantId,
            option_selections: l.optionSelections,
            notes: l.notes || undefined,
            modifiers: l.modifiers.map((m) => ({ modifier_id: m.id, applied: true })),
          })),
        // A combo line carries no server-side quantity, so N× the same combo is
        // sent as N separate combo entries (each becomes its own combo_group).
        combos: lines
          .filter((l) => l.comboItemId != null)
          .flatMap((l) =>
            Array.from({ length: l.quantity }, () => ({
              combo_item_id: l.comboItemId as number,
              selections: (l.comboSelections ?? []).map((s) => ({
                step_id: s.stepId,
                menu_item_id: s.menuItemId,
                option_id: s.optionId ?? undefined,
                quantity: s.quantity,
                is_substitution: s.isSubstitution || undefined,
              })),
            })),
          ),
        // Discount: only one of these is ever set (mutually exclusive).
        ...(data.discountCode ? { discount_code: data.discountCode } : {}),
        ...(data.manualDiscount ? { manual_discount: data.manualDiscount } : {}),
      });

      // The order now exists server-side: the draft has done its job. Cleared
      // on the success path only (never in `finally`) — a failed create must
      // leave the draft intact, or a network blip destroys the very work this
      // feature exists to protect. `submittedRef` is set BEFORE clearing so no
      // in-flight debounce can write this cart back after the fact.
      submittedRef.current = true;
      forgetDraft();
      setIssues(new Map());
      setDraftRestored(false);
      setRestoredState(null);
      // The cart itself is left alone (the summary screen below replaces the
      // page, and clearing it would flash an empty ticket before the redirect),
      // but the customer sheet is remounted: the next order must not start
      // pre-filled with the customer of the one just sent.
      setCheckoutOpen(false);
      setDrawerResetKey((k) => k + 1);

      if (data.paymentMethod === 'sumit_card' && res.order.receipt_token) {
        setCardOrder({ id: res.order.id, token: res.order.receipt_token });
      } else if (res.checkout_url || res.payment_url) {
        setPaymentUrl(res.checkout_url || res.payment_url || null);
      } else {
        router.push(`/${restaurantId}/orders/all`);
      }
    } catch (err) {
      // Prefer the server's specific reason (e.g. "CAVIAR (250g) is sold out…")
      // over the generic top-level message ("could not create order").
      const msg =
        err instanceof ApiError && err.details
          ? err.details
          : err instanceof Error
            ? err.message
            : String(err);
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function copyPaymentUrl() {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays visible for manual copy */
    }
  }

  if (cardOrder) {
    return <InternalOrderPayment autoOpen restaurantId={restaurantId} orderId={cardOrder.id} receiptToken={cardOrder.token} onOrders={() => router.push(`/${restaurantId}/orders/all`)} />;
  }

  // ─── Post-create payment-link screen ───────────────────────────────────────
  if (paymentUrl) {
    return (
      <div className="flex items-center justify-center py-[var(--s-12)]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-[var(--s-5)] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-[var(--s-8)] text-center duration-150 animate-in fade-in zoom-in-95">
          <span className="flex size-12 items-center justify-center rounded-full bg-[var(--success-50)] text-[var(--success-500)]">
            <CheckIcon className="size-6" />
          </span>
          <div className="flex flex-col items-center gap-[var(--s-2)]">
            <Badge tone="warning" dot>{t('orderCheckoutPaymentPending')}</Badge>
            <h1 className="text-fs-xl font-semibold">{t('paymentLinkReady')}</h1>
            <p className="text-fs-sm text-[var(--fg-muted)]">{t('sumitCustomerLinkHint')}</p>
          </div>
          <p className="w-full break-all select-all rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-start text-fs-xs text-[var(--fg-muted)]">{paymentUrl}</p>
          <Button size="lg" className="w-full" onClick={copyPaymentUrl}>
            {copied ? <CheckIcon /> : <CopyIcon />}{copied ? t('copied') : t('copyLink')}
          </Button>
          <Button variant="secondary" size="lg" className="w-full justify-center" onClick={() => router.push(`/${restaurantId}/orders/all`)}>
            {t('goToOrders')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-col" style={{ height: 'calc(100dvh - var(--topbar-total-h) - 64px)' }}>
      <div className="mb-3 flex shrink-0 gap-2 lg:hidden" role="group" aria-label={t('newOrder')}>
        <Button className="flex-1" variant={mobilePane === 'catalogue' ? 'primary' : 'secondary'} aria-pressed={mobilePane === 'catalogue'} disabled={submitting} onClick={() => { setCheckoutOpen(false); setMobilePane('catalogue'); }}>{t('items')}</Button>
        <Button className="flex-1" variant={mobilePane === 'ticket' ? 'primary' : 'secondary'} aria-pressed={mobilePane === 'ticket'} onClick={() => setMobilePane('ticket')}>{t('orderItems')} · {itemCount}</Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--bg)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,410px)]">
        {/* ─── Catalog ──────────────────────────────────────────────────── */}
        <fieldset disabled={checkoutOpen || submitting} className={cn("min-h-0 min-w-0 flex-col border-[var(--line)] lg:flex lg:border-e", mobilePane === 'catalogue' ? 'flex' : 'hidden')}>
          {/* Header: back + title + carte tabs + search + category chips */}
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] pt-[var(--s-3)]">
            <div className="mb-[var(--s-3)] flex items-center gap-[var(--s-3)]">
              <Button variant="ghost" size="sm" icon onClick={() => router.push(`/${restaurantId}/orders/all`)} aria-label={t('backToOrders')}>
                <ArrowLeftIcon className={direction === 'rtl' ? 'rotate-180' : undefined} />
              </Button>
              <div className="min-w-0">
                <h1 className="text-fs-lg font-semibold leading-tight">{t('newOrder')}</h1>

              </div>
              <Button variant="ghost" size="sm" className="ms-auto hidden lg:inline-flex" aria-pressed={collapsed} onClick={toggleCollapsed}>
                {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}{t('orderCheckoutSaleMode')}
              </Button>
            </div>
            <div className="no-scrollbar -mx-[var(--s-4)] mb-[var(--s-3)] flex gap-[var(--s-1)] overflow-x-auto border-b border-[var(--line)] px-[var(--s-4)]">
              {catalogSources.map((m) => {
                const active = activeMenuId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setActiveMenuId(m.id); setActiveSection('all'); }}
                    aria-pressed={active}
                    className={cn(
                      'relative shrink-0 whitespace-nowrap px-[var(--s-2)] pb-[var(--s-2)] text-fs-sm font-medium transition-colors',
                      active ? 'text-[var(--brand-ink)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
                    )}
                  >
                    {m.name}
                    {active && (
                      <span className="absolute inset-x-[var(--s-2)] -bottom-px h-[2px] rounded-full bg-[var(--brand-500)]" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mb-[var(--s-3)] flex flex-col gap-[var(--s-2)] sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute start-[var(--s-3)] top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchItems')}
                  aria-label={t('searchItems')}
                  className="h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-9 text-fs-sm outline-none transition-shadow placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-ring"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('clearAll')}
                    className="absolute end-[var(--s-2)] top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--fg-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
              {isRotating && cycles.length > 0 && (
                <BatchPicker cycles={cycles} selectedIndex={selectedCycleIndex} onChange={setSelectedCycleIndex} />
              )}
            </div>
            {activeMenuId !== 'library' && sections.length > 0 && (
              <div className="no-scrollbar -mx-[var(--s-4)] flex gap-[var(--s-2)] overflow-x-auto px-[var(--s-4)] pb-[var(--s-3)]">
                <button
                  type="button"
                  onClick={() => setActiveSection('all')}
                  aria-pressed={activeSection === 'all'}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-[var(--s-2)] min-h-9 rounded-r-md border px-[var(--s-3)] py-1.5 text-fs-xs font-semibold transition-colors',
                    activeSection === 'all'
                      ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                      : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)] hover:text-[var(--fg)]',
                  )}
                >
                  <LayoutGridIcon className="size-3.5" />
                  {t('all')}
                </button>
                {sections.map((s) => {
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-[var(--s-2)] min-h-9 rounded-r-md border px-[var(--s-3)] py-1.5 text-fs-xs font-semibold transition-colors',
                        active
                          ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)] hover:text-[var(--fg)]',
                      )}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: sectionColorById.get(s.id) }}
                      />
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scrollable item grid */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-[var(--s-4)]">
            {loading && (
              <div className="grid grid-cols-2 gap-[var(--s-2)] sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[100px] animate-pulse rounded-lg border border-[var(--line)] bg-[var(--surface-2)]" />
                ))}
              </div>
            )}
            {loadError && <div role="alert" className="text-fs-sm text-[var(--danger-500)]"><p>{loadError}</p><Button className="mt-3" onClick={() => setLoadAttempt(n => n + 1)}>{t('retry')}</Button></div>}
            {!loading && !loadError && sections.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-[var(--s-2)] py-[var(--s-12)] text-center">
                <SearchIcon className="size-7 text-[var(--fg-subtle)]" />
                <p className="text-fs-sm text-[var(--fg-muted)]">{t('noItemsFound')}</p>
              </div>
            )}

            {!loading && (
              <div className="flex flex-col gap-[var(--s-6)]">
                {displaySections.map((section) => {
                  const color = sectionColorById.get(section.id);
                  return (
                    <section key={section.id} className="flex flex-col gap-[var(--s-3)]">
                      <div className="flex items-center gap-[var(--s-2)]">
                        <span className="h-[15px] w-[3px] rounded-full" style={{ backgroundColor: color }} />
                        <h2 className="text-fs-sm font-semibold text-[var(--fg)]">{section.name}</h2>
                        <span className="text-fs-xs font-medium text-[var(--fg-subtle)]">{section.items.length}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-[var(--s-2)] sm:grid-cols-3 xl:grid-cols-4">
                        {section.items.map((it) => {
                          const qty = qtyByItem.get(it.id) ?? 0;
                          const selected = qty > 0;
                          const soldOut = isItemSoldOut(it);
                          return (
                            <button
                              key={`${section.id}-${it.id}`}
                              type="button"
                              onClick={() => handleTile(it)}
                              disabled={soldOut}
                              aria-disabled={soldOut}
                              className={cn(
                                'group relative flex min-h-[96px] flex-col gap-3 justify-between overflow-hidden rounded-lg border bg-[var(--surface)] p-[var(--s-3)] text-start transition-colors duration-fast ease-out',
                                soldOut
                                  ? 'cursor-not-allowed border-[var(--line)] opacity-55'
                                  : 'active:scale-[0.97] ' +
                                    (selected
                                      ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)]'
                                      : 'border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'),
                              )}
                            >
                              {soldOut ? null : selected ? (
                                <span className="absolute end-[var(--s-2)] top-[var(--s-2)] flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--action)] px-1.5 text-fs-xs font-bold text-[var(--action-fg)] duration-200 animate-in zoom-in-50">
                                  {qty}
                                </span>
                              ) : (
                                <span className="absolute end-[var(--s-2)] top-[var(--s-2)] flex size-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg-subtle)] opacity-0 transition-opacity group-hover:opacity-100">
                                  <PlusIcon className="size-3.5" />
                                </span>
                              )}
                              <span className="line-clamp-3 pe-6 text-fs-sm font-semibold leading-tight text-[var(--fg)]">{it.name}</span>
                              <div className="flex flex-wrap items-center gap-x-[var(--s-2)] gap-y-1">
                                <span className="tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                                  {money(it.price)}
                                </span>
                                {soldOut ? (
                                  <Badge tone="danger" className="min-h-6 px-1.5 text-fs-xs">
                                    {t('outOfStock')}
                                  </Badge>
                                ) : it.item_type === 'combo' ? (
                                  <Badge tone="brand" className="min-h-6 px-1.5 text-fs-xs">
                                    {t('comboLabel')}
                                  </Badge>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </fieldset>

        {/* ─── Ticket / receipt ─────────────────────────────────────────── */}
        <aside aria-label={t('orderItems')} className={cn("min-h-0 min-w-0 flex-col bg-[var(--surface)] lg:flex", mobilePane === 'ticket' ? 'flex' : 'hidden')}>
          <div className={cn('min-h-0 flex-1 flex-col', checkoutOpen ? 'hidden' : 'flex')}>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--summary-bg)] text-[var(--summary-fg)] px-[var(--s-4)] py-[var(--s-3)]">
            <div className="flex items-center gap-[var(--s-2)]">
              <h2 className="text-fs-md font-semibold">{t('orderItems')}</h2>
              {itemCount > 0 && <Badge tone="brand">{itemCount}</Badge>}
            </div>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => { forgetDraft(); resetOrderComposition(); }}
                className="inline-flex items-center gap-1 rounded-full px-[var(--s-2)] py-1 text-fs-xs font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
              >
                <Trash2Icon className="size-3.5" />
                {t('clearAll')}
              </button>
            )}
          </div>

          {/* Lines */}
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--s-4)]">
            {/* Survives past `draftRestored` going false while any issue is
                still outstanding — otherwise resolving one of several flagged
                lines would drop the "N to check" signal while the others are
                still blocking checkout, right when the staff most needs it.
                Once every flag has been dealt with, an ordinary edit (which
                clears `draftRestored`) collapses it as usual. */}
            {(draftRestored || issues.size > 0) && lines.length > 0 && (
              <DraftRestoredBanner
                itemCount={lines.length}
                issueCount={issues.size}
                onDiscard={() => { forgetDraft(); resetOrderComposition(); }}
              />
            )}
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-[var(--s-3)] py-[var(--s-10)] text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg-subtle)]">
                  <ShoppingBagIcon className="size-6" />
                </span>
                <p className="max-w-[220px] text-fs-sm text-[var(--fg-subtle)]">{t('emptyCartHint')}</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {lines.map((l) => {
                  const issue = issues.get(l.uid);
                  return (
                  <li key={l.uid} className="flex flex-col gap-[var(--s-2)] py-[var(--s-3)] duration-200 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-fs-sm font-semibold">{l.item.name}</p>
                        {l.optionSelections?.map(option => <p key={`${option.option_set_id}@${option.selection_index}`} className="text-fs-xs text-[var(--fg-muted)]">{option.group_name}: {option.name}</p>)}
                        {l.selectedVariantName && (
                          <p className="text-fs-xs text-[var(--fg-muted)]">{l.selectedVariantName}</p>
                        )}
                        {l.comboSelections && l.comboSelections.length > 0 && (
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {l.comboSelections.map((s, i) => (
                              <li key={`${s.stepId}-${s.menuItemId}-${i}`} className="text-fs-xs text-[var(--fg-subtle)]">
                                · {s.quantity > 1 ? `${s.quantity}× ` : ''}{s.menuItemName}
                                {s.priceDelta > 0 ? ` (+${money(s.priceDelta)})` : ''}
                                {s.isSubstitution ? ` · ${t('comboSubstitutionLabel')}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        {l.modifiers.length > 0 && (
                          <p className="text-fs-xs text-[var(--fg-subtle)]">{l.modifiers.map((m) => m.name).join(', ')}</p>
                        )}
                        {l.notes && <p className="text-fs-xs italic text-[var(--fg-subtle)]">“{l.notes}”</p>}
                      </div>
                      <span className="shrink-0 tabular-nums text-fs-sm font-semibold">{money(lineTotal(l))}</span>
                    </div>
                    <div className="flex items-center gap-[var(--s-2)]">
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
                        <button type="button" onClick={() => changeQty(l.uid, -1)} aria-label={t('decrease')} className="flex size-10 items-center justify-center text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
                          <MinusIcon className="size-4" />
                        </button>
                        <span className="w-8 text-center tabular-nums text-fs-sm font-semibold">{l.quantity}</span>
                        <button type="button" onClick={() => changeQty(l.uid, 1)} aria-label={t('increase')} className="flex size-10 items-center justify-center text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
                          <PlusIcon className="size-4" />
                        </button>
                      </div>
                      <span className="text-fs-xs text-[var(--fg-subtle)]">{money(lineUnitPrice(l))}</span>
                      <button type="button" onClick={() => removeLine(l.uid)} aria-label={t('remove')} className="ms-auto flex size-10 items-center justify-center rounded-lg text-[var(--fg-subtle)] transition-colors hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]">
                        <Trash2Icon className="size-4" />
                      </button>
                    </div>
                    {issue && (
                      <div className="flex flex-wrap items-center gap-[var(--s-2)] rounded-r-sm border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-2)] py-[var(--s-2)]">
                        <Badge tone={issueTone(issue)} dot>{issueLabel(issue, t)}</Badge>
                        <div className="flex-1" />
                        {issueCanBeAccepted(issue) && (
                          <Button variant="secondary" size="sm" onClick={() => acceptIssue(l.uid)}>
                            {t('draftIssueAccept')}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => removeLine(l.uid)}>
                          {t('draftIssueRemove')}
                        </Button>
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer: total + checkout (always visible) */}
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
            {removedLine && <div role="status" className="mb-3 flex items-center justify-between gap-2 text-fs-xs"><span>{t('orderCheckoutLineRemoved').replace('{name}', removedLine.line.item.name)}</span><Button variant="ghost" size="sm" onClick={undoRemove}>{t('orderCheckoutUndo')}</Button></div>}
            <div className="mb-[var(--s-3)] flex items-end justify-between">
              <span className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('total')}</span>
              <span className="tabular-nums text-fs-2xl font-bold">{money(subtotal)}</span>
            </div>
            {canManage && (
              <>
                {blockedByIssues && (
                  <p className="mb-[var(--s-2)] text-center text-fs-xs font-medium text-[var(--danger-500)]">
                    {t('draftBlockedSubmit')}
                  </p>
                )}
                <Button
                  ref={continueRef}
                  variant="primary"
                  size="lg"
                  className="h-[52px] w-full text-fs-md font-semibold"
                  disabled={lines.length === 0 || blockedByIssues}
                  onClick={() => { setSubmitError(null); setCheckoutOpen(true); }}
                >
                  {t('orderCheckoutContinue')}
                </Button>
              </>
            )}
          </div>
          </div>
      <NewOrderCheckoutPanel
        sumitCheckoutEnabled={sumitCheckoutEnabled}
        sumitCardEnabled={sumitCheckoutEnabled && hasAnyPermission('payments.manage')}
        key={drawerResetKey}
        open={checkoutOpen}
        onClose={backToItems}
        itemsSummary={<ul className="space-y-3">{lines.map(line => <li key={line.uid} className="text-fs-xs">
          <div className="flex justify-between gap-3"><span>{line.quantity} × {line.item.name}</span><span className="shrink-0 tabular-nums">{money(lineTotal(line))}</span></div>
          {line.optionSelections?.map(option => <p key={`${option.option_set_id}@${option.selection_index}`} className="text-[var(--fg-muted)]">{option.group_name}: {option.name}</p>)}
          {line.selectedVariantName && <p className="text-[var(--fg-muted)]">{line.selectedVariantName}</p>}
          {line.comboSelections?.map((selection, index) => <p key={index} className="text-[var(--fg-muted)]">{selection.quantity} × {selection.menuItemName}</p>)}
          {line.modifiers.length > 0 && <p className="text-[var(--fg-muted)]">{line.modifiers.map(modifier => modifier.name).join(', ')}</p>}
          {line.notes && <p className="text-[var(--fg-muted)]">{line.notes}</p>}
        </li>)}</ul>}

        total={subtotal}
        itemCount={itemCount}
        submitting={submitting}
        error={submitError}
        onConfirm={handleConfirm}
        batchConfig={fulfillmentBatchConfig}
        defaultDate={selectedDay ?? undefined}
        restaurantId={restaurantId}
        discountItems={lines.map((l) => ({
          item_id: l.item.id,
          category_id: l.item.category_id ?? 0,
          line_total: lineTotal(l),
          quantity: l.quantity,
        }))}
        onStateChange={setDrawerState}
        initialState={restoredState ?? undefined}
      />
        </aside>
      </div>

      <NewOrderItemModal
        item={modalItem}
        open={modalItem !== null}
        onClose={() => setModalItem(null)}
        onAdd={addLine}
      />

      <NewOrderComboModal
        combo={comboItem}
        restaurantId={restaurantId}
        itemMap={itemMap}
        serieDate={isRotating ? selectedDay : null}
        open={comboItem !== null}
        onClose={() => setComboItem(null)}
        onAdd={addLine}
      />


    </div>
  );
}
