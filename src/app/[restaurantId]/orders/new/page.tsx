'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMenu, listAllItems, createOrder,
  getBatchFulfillmentConfig, listGroupMemberships,
  type Menu, type MenuItem, type PaymentStatus,
  type BatchFulfillmentConfigResponse, type MenuGroupMembership,
} from '@/lib/api';
import { isMembershipActiveOn } from '@/lib/membership';
import { itemSizeOptions } from '@/lib/item-options';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button } from '@/components/ds';
import { BatchPicker } from '@/components/menu/BatchPicker';
import { cn } from '@/lib/utils';
import {
  NewOrderItemModal, lineUnitPrice, lineTotal, type NewOrderLine,
} from '@/components/orders/NewOrderItemModal';
import {
  NewOrderCheckoutDrawer, type CheckoutData,
} from '@/components/orders/NewOrderCheckoutDrawer';
import { NewOrderComboModal } from '@/components/orders/NewOrderComboModal';
import {
  ArrowLeftIcon, SearchIcon, PlusIcon, MinusIcon, Trash2Icon,
  CopyIcon, CheckIcon, ShoppingBagIcon, XIcon,
  LayoutGridIcon, CreditCardIcon,
} from 'lucide-react';

interface Section { id: number; name: string; items: MenuItem[] }

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}-${Math.random()}`;
}

// Categorical palette (from design tokens) used to colour-code sections in the
// grid — colour the section header, the per-tile accent edge and the chip dot
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
  const variants = itemSizeOptions(it).length > 0;
  const mods =
    (it.modifiers ?? []).some((m) => m.is_active) ||
    (it.modifier_sets ?? []).some((s) => (s.modifiers ?? []).some((m) => m.is_active));
  return variants || mods;
}

export default function NewOrderPage() {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  const params = useParams();
  const router = useRouter();
  const restaurantId = Number(params.restaurantId);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [itemMap, setItemMap] = useState<Map<number, MenuItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [comboItem, setComboItem] = useState<MenuItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Category filter: 'all' shows every section, otherwise a single group id.
  const [activeSection, setActiveSection] = useState<number | 'all'>('all');
  // Selected carte (menu). null until menus load.
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  // Weekly-rotating carte state (only populated when the active carte rotates).
  const [batchConfig, setBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState(0);
  const [membershipsByGroup, setMembershipsByGroup] = useState<Map<number, MenuGroupMembership[]>>(new Map());
  // Batch config loaded unconditionally so the checkout drawer has it regardless
  // of whether the active carte is rotating. This is independent of the rotating
  // carte batchConfig above (which drives item filtering and may be null).
  const [fulfillmentBatchConfig, setFulfillmentBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBatchFulfillmentConfig(restaurantId)
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
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)[0] ?? menuList[0];
        setActiveMenuId((prev) => prev ?? firstCarte?.id ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  // POS-orderable cartes (menus), in the same order as the Cartes page
  // (sort_order, set via "Réorganiser"). Drives the carte selector.
  const cartes = useMemo(
    () =>
      menus
        .filter((m) => m.pos_enabled !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id),
    [menus],
  );
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

  // When the active carte rotates, load its batch cycles + per-group memberships
  // so items can be filtered to the selected week. Mirrors the carte detail page.
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
        getBatchFulfillmentConfig(restaurantId).catch(() => null),
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
  }, [activeMenu, itemMap, search, isRotating, selectedDay, membershipsByGroup]);

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

  // Per-item quantity in the ticket, for the tile badge.
  const qtyByItem = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of lines) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  function handleTile(it: MenuItem) {
    const full = itemMap.get(it.id) ?? it;
    if (full.item_type === 'combo') {
      setComboItem(full);
      return;
    }
    if (hasOptions(full)) {
      setModalItem(full);
      return;
    }
    // Quick add — merge into an existing plain line for the same item.
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
    setLines((prev) => [...prev, line]);
  }

  function changeQty(lineUid: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.uid === lineUid ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(lineUid: string) {
    setLines((prev) => prev.filter((l) => l.uid !== lineUid));
  }

  async function handleConfirm(data: CheckoutData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const paymentMethod =
        data.payment === 'cash_paid' ? 'cash' : data.payment === 'card_paid' ? 'card' : '';
      const paymentStatus: PaymentStatus | undefined =
        data.payment === 'cash_paid' || data.payment === 'card_paid' ? 'paid' : undefined;

      const res = await createOrder(restaurantId, {
        order_type: data.orderType,
        customer_name: data.customerName.trim(),
        customer_phone: data.customerPhone.trim(),
        payment_method: paymentMethod || undefined,
        payment_status: paymentStatus,
        payment_required: data.payment === 'link',
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
            }
          : {}),
        items: lines
          .filter((l) => l.comboItemId == null)
          .map((l) => ({
            menu_item_id: l.item.id,
            quantity: l.quantity,
            selected_variant_id: l.selectedVariantId,
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
              })),
            })),
          ),
      });

      if (res.payment_url) {
        setCheckoutOpen(false);
        setPaymentUrl(res.payment_url);
      } else {
        router.push(`/${restaurantId}/orders/all`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
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

  // ─── Post-create payment-link screen ───────────────────────────────────────
  if (paymentUrl) {
    return (
      <div className="flex items-center justify-center py-[var(--s-12)]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-[var(--s-5)] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-[var(--s-8)] text-center shadow-2 duration-300 animate-in fade-in zoom-in-95">
          <span className="flex size-12 items-center justify-center rounded-full bg-[var(--success-50)] text-[var(--success-500)]">
            <CheckIcon className="size-6" />
          </span>
          <div className="flex flex-col items-center gap-[var(--s-2)]">
            <Badge tone="success" dot>{t('orderCreated')}</Badge>
            <h1 className="text-fs-xl font-semibold">{t('paymentLinkReady')}</h1>
            <p className="text-fs-sm text-[var(--fg-muted)]">{t('paymentLinkHint')}</p>
          </div>
          <div className="flex w-full items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-2)] p-[var(--s-2)] ps-[var(--s-3)]">
            <span className="flex-1 truncate text-start font-mono text-fs-xs text-[var(--fg-muted)]">{paymentUrl}</span>
            <Button variant="secondary" size="sm" onClick={copyPaymentUrl}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? t('copied') : t('copyLink')}
            </Button>
          </div>
          <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => router.push(`/${restaurantId}/orders/all`)}>
            {t('goToOrders')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg)] shadow-1 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* ─── Catalog ──────────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col border-[var(--line)] lg:border-e">
          {/* Header: back + title + carte tabs + search + category chips */}
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] pt-[var(--s-3)]">
            <div className="mb-[var(--s-3)] flex items-center gap-[var(--s-3)]">
              <Button variant="ghost" size="sm" icon onClick={() => router.push(`/${restaurantId}/orders/all`)} aria-label={t('backToOrders')}>
                <ArrowLeftIcon />
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-fs-lg font-semibold leading-tight">{t('newOrder')}</h1>
                {activeMenu && (
                  <p className="truncate text-fs-xs text-[var(--fg-muted)]">{activeMenu.name}</p>
                )}
              </div>
            </div>
            {cartes.length > 1 && (
              <div className="no-scrollbar -mx-[var(--s-4)] mb-[var(--s-3)] flex gap-[var(--s-1)] overflow-x-auto border-b border-[var(--line)] px-[var(--s-4)]">
                {cartes.map((m) => {
                  const active = activeMenuId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveMenuId(m.id)}
                      className={cn(
                        'relative shrink-0 whitespace-nowrap px-[var(--s-2)] pb-[var(--s-2)] text-fs-sm font-medium transition-colors',
                        active ? 'text-[var(--brand-600)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
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
            )}
            <div className="mb-[var(--s-3)] flex flex-col gap-[var(--s-2)] sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute start-[var(--s-3)] top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchItems')}
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
            {sections.length > 0 && (
              <div className="no-scrollbar -mx-[var(--s-4)] flex gap-[var(--s-2)] overflow-x-auto px-[var(--s-4)] pb-[var(--s-3)]">
                <button
                  type="button"
                  onClick={() => setActiveSection('all')}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-[var(--s-2)] rounded-full border px-[var(--s-3)] py-1.5 text-fs-xs font-semibold transition-colors',
                    activeSection === 'all'
                      ? 'border-transparent bg-[var(--brand-500)] text-white shadow-1'
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
                      className={cn(
                        'inline-flex shrink-0 items-center gap-[var(--s-2)] rounded-full border px-[var(--s-3)] py-1.5 text-fs-xs font-semibold transition-colors',
                        active
                          ? 'border-transparent bg-[var(--brand-500)] text-white shadow-1'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)] hover:text-[var(--fg)]',
                      )}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: active ? 'rgba(255,255,255,.85)' : sectionColorById.get(s.id) }}
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
            {loadError && <p className="text-fs-sm text-[var(--danger-500)]">{loadError}</p>}
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
                          return (
                            <button
                              key={`${section.id}-${it.id}`}
                              type="button"
                              onClick={() => handleTile(it)}
                              className={cn(
                                'group relative flex h-[100px] flex-col justify-between overflow-hidden rounded-lg border bg-[var(--surface)] p-[var(--s-3)] ps-[var(--s-4)] text-start transition-all duration-fast ease-out active:scale-[0.97]',
                                selected
                                  ? 'border-[var(--brand-500)] shadow-1 ring-1 ring-[var(--brand-500)]'
                                  : 'border-[var(--line)] hover:-translate-y-px hover:border-[var(--brand-300)] hover:shadow-2',
                              )}
                            >
                              {/* category accent edge */}
                              <span
                                className="absolute inset-y-[var(--s-2)] start-0 w-[3px] rounded-full"
                                style={{ backgroundColor: selected ? 'var(--brand-500)' : color }}
                              />
                              {selected ? (
                                <span className="absolute end-[var(--s-2)] top-[var(--s-2)] flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-500)] px-1.5 text-fs-xs font-bold text-white duration-200 animate-in zoom-in-50">
                                  {qty}
                                </span>
                              ) : (
                                <span className="absolute end-[var(--s-2)] top-[var(--s-2)] flex size-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg-subtle)] opacity-0 transition-opacity group-hover:opacity-100">
                                  <PlusIcon className="size-3.5" />
                                </span>
                              )}
                              <span className="line-clamp-2 pe-6 text-fs-sm font-semibold leading-tight text-[var(--fg)]">{it.name}</span>
                              <div className="flex flex-wrap items-center gap-x-[var(--s-2)] gap-y-1">
                                <span className="font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                                  ₪{it.price.toFixed(2)}
                                </span>
                                {it.item_type === 'combo' && (
                                  <Badge tone="brand" className="h-[18px] px-1.5 text-[10px] uppercase tracking-wide">
                                    {t('comboLabel')}
                                  </Badge>
                                )}
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
        </div>

        {/* ─── Ticket / receipt ─────────────────────────────────────────── */}
        <aside className="flex min-h-0 min-w-0 flex-col bg-[var(--surface)]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)]">
            <div className="flex items-center gap-[var(--s-2)]">
              <h2 className="text-fs-md font-semibold">{t('orderItems')}</h2>
              {itemCount > 0 && <Badge tone="brand">{itemCount}</Badge>}
            </div>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setLines([])}
                className="inline-flex items-center gap-1 rounded-full px-[var(--s-2)] py-1 text-fs-xs font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
              >
                <Trash2Icon className="size-3.5" />
                {t('clearAll')}
              </button>
            )}
          </div>

          {/* Lines */}
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--s-4)]">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-[var(--s-3)] py-[var(--s-10)] text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg-subtle)]">
                  <ShoppingBagIcon className="size-6" />
                </span>
                <p className="max-w-[220px] text-fs-sm text-[var(--fg-subtle)]">{t('emptyCartHint')}</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {lines.map((l) => (
                  <li key={l.uid} className="flex flex-col gap-[var(--s-2)] py-[var(--s-3)] duration-200 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-fs-sm font-semibold">{l.item.name}</p>
                        {l.selectedVariantName && (
                          <p className="text-fs-xs text-[var(--fg-muted)]">{l.selectedVariantName}</p>
                        )}
                        {l.comboSelections && l.comboSelections.length > 0 && (
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {l.comboSelections.map((s, i) => (
                              <li key={`${s.stepId}-${s.menuItemId}-${i}`} className="text-fs-xs text-[var(--fg-subtle)]">
                                · {s.quantity > 1 ? `${s.quantity}× ` : ''}{s.menuItemName}
                                {s.priceDelta > 0 ? ` (+₪${s.priceDelta.toFixed(2)})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        {l.modifiers.length > 0 && (
                          <p className="text-fs-xs text-[var(--fg-subtle)]">{l.modifiers.map((m) => m.name).join(', ')}</p>
                        )}
                        {l.notes && <p className="text-fs-xs italic text-[var(--fg-subtle)]">“{l.notes}”</p>}
                      </div>
                      <span className="shrink-0 font-mono tabular-nums text-fs-sm font-semibold">₪{lineTotal(l).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-[var(--s-2)]">
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--line-strong)]">
                        <button type="button" onClick={() => changeQty(l.uid, -1)} aria-label={t('decrease')} className="flex size-8 items-center justify-center text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
                          <MinusIcon className="size-4" />
                        </button>
                        <span className="w-8 text-center font-mono tabular-nums text-fs-sm font-semibold">{l.quantity}</span>
                        <button type="button" onClick={() => changeQty(l.uid, 1)} aria-label={t('increase')} className="flex size-8 items-center justify-center text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
                          <PlusIcon className="size-4" />
                        </button>
                      </div>
                      <span className="text-fs-xs text-[var(--fg-subtle)]">₪{lineUnitPrice(l).toFixed(2)}</span>
                      <button type="button" onClick={() => removeLine(l.uid)} aria-label={t('remove')} className="ms-auto flex size-8 items-center justify-center rounded-lg text-[var(--fg-subtle)] transition-colors hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]">
                        <Trash2Icon className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer: total + checkout (always visible) */}
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
            <div className="mb-[var(--s-3)] flex items-end justify-between">
              <span className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('total')}</span>
              <span className="font-mono tabular-nums text-fs-2xl font-bold">₪{subtotal.toFixed(2)}</span>
            </div>
            {canManage && (
              <Button
                variant="primary"
                size="lg"
                className="h-[52px] w-full text-fs-md font-semibold"
                disabled={lines.length === 0}
                onClick={() => { setSubmitError(null); setCheckoutOpen(true); }}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="inline-flex items-center gap-[var(--s-2)]">
                    <CreditCardIcon />
                    {t('checkout')}
                  </span>
                  <span className="font-mono tabular-nums">₪{subtotal.toFixed(2)}</span>
                </span>
              </Button>
            )}
          </div>
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
        open={comboItem !== null}
        onClose={() => setComboItem(null)}
        onAdd={addLine}
      />

      <NewOrderCheckoutDrawer
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        total={subtotal}
        itemCount={itemCount}
        submitting={submitting}
        error={submitError}
        onConfirm={handleConfirm}
        batchConfig={fulfillmentBatchConfig}
        defaultDate={selectedDay ?? undefined}
      />
    </div>
  );
}
