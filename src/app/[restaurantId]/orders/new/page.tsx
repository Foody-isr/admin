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
import { useI18n } from '@/lib/i18n';
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
} from 'lucide-react';

interface Section { id: number; name: string; items: MenuItem[] }

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}-${Math.random()}`;
}

// An item opens the config modal only when it actually has choices to make;
// otherwise it adds instantly (POS speed).
function hasOptions(it: MenuItem): boolean {
  const variants = (it.variant_groups ?? []).some((g) => (g.variants ?? []).some((v) => v.is_active));
  const mods =
    (it.modifiers ?? []).some((m) => m.is_active) ||
    (it.modifier_sets ?? []).some((s) => (s.modifiers ?? []).some((m) => m.is_active));
  return variants || mods;
}

export default function NewOrderPage() {
  const { t } = useI18n();
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
    for (const group of activeMenu.groups ?? []) {
      if (group.is_hidden || group.pos_enabled === false) continue;
      const memberByItem =
        isRotating && selectedDay
          ? new Map((membershipsByGroup.get(group.id) ?? []).map((m) => [m.menu_item_id, m] as const))
          : null;
      const items = (group.items ?? [])
        .map((gi) => itemMap.get(gi.id) ?? gi)
        .filter((it) => it.is_active)
        .filter((it) => {
          if (!memberByItem) return true;
          const m = memberByItem.get(it.id);
          // Items with no membership row default to active (legacy/defensive).
          return !m || isMembershipActiveOn(m, selectedDay as string);
        })
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
      <div className="mx-auto flex max-w-lg flex-col items-center gap-[var(--s-5)] py-[var(--s-10)] text-center">
        <Badge tone="success" dot>{t('orderCreated')}</Badge>
        <h1 className="text-fs-lg font-semibold">{t('paymentLinkReady')}</h1>
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('paymentLinkHint')}</p>
        <div className="flex w-full items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-3)]">
          <span className="flex-1 truncate text-start font-mono text-fs-xs">{paymentUrl}</span>
          <Button variant="secondary" size="sm" onClick={copyPaymentUrl}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t('copied') : t('copyLink')}
          </Button>
        </div>
        <Button variant="primary" size="md" onClick={() => router.push(`/${restaurantId}/orders/all`)}>
          {t('goToOrders')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-[var(--line)] lg:grid-cols-[1fr_minmax(340px,400px)]">
        {/* ─── Catalog ──────────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col border-[var(--line)] lg:border-e">
          {/* Header: back + title + search + category pills */}
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg)] px-[var(--s-4)] pt-[var(--s-3)]">
            <div className="mb-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" icon onClick={() => router.push(`/${restaurantId}/orders/all`)} aria-label={t('backToOrders')}>
                <ArrowLeftIcon />
              </Button>
              <h1 className="text-fs-md font-semibold">{t('newOrder')}</h1>
            </div>
            {cartes.length > 1 && (
              <div className="-mx-[var(--s-4)] mb-2 flex gap-1 overflow-x-auto border-b border-[var(--line)] px-[var(--s-4)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {cartes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMenuId(m.id)}
                    className={cn(
                      'relative shrink-0 whitespace-nowrap px-[var(--s-2)] pb-2 text-fs-sm font-medium transition-colors',
                      activeMenuId === m.id ? 'text-[var(--brand-600)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
                    )}
                  >
                    {m.name}
                    {activeMenuId === m.id && (
                      <span className="absolute inset-x-[var(--s-2)] -bottom-px h-0.5 rounded-full bg-[var(--brand-500)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="relative mb-2">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchItems')}
                className="h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 text-fs-sm outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:shadow-ring"
              />
            </div>
            {isRotating && cycles.length > 0 && (
              <div className="mb-2">
                <BatchPicker cycles={cycles} selectedIndex={selectedCycleIndex} onChange={setSelectedCycleIndex} />
              </div>
            )}
            {sections.length > 0 && (
              <div className="-mx-[var(--s-4)] flex gap-1.5 overflow-x-auto px-[var(--s-4)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[{ id: 'all' as const, name: t('all') }, ...sections].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    className={cn(
                      'shrink-0 rounded-full border px-[var(--s-3)] py-1.5 text-fs-xs font-medium transition-colors',
                      activeSection === s.id
                        ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white'
                        : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)]',
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable item grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-[var(--s-4)]">
            {loading && <p className="text-fs-sm text-[var(--fg-muted)]">{t('loading')}…</p>}
            {loadError && <p className="text-fs-sm text-[var(--danger-500)]">{loadError}</p>}
            {!loading && !loadError && sections.length === 0 && (
              <p className="text-fs-sm text-[var(--fg-muted)]">{t('noItemsFound')}</p>
            )}

            <div className="flex flex-col gap-[var(--s-5)]">
              {displaySections.map((section) => (
                <div
                  key={section.id}
                  className="flex flex-col gap-2"
                >
                  <h2 className="text-fs-sm font-semibold text-[var(--fg)]">{section.name}</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {section.items.map((it) => {
                      const qty = qtyByItem.get(it.id) ?? 0;
                      return (
                        <button
                          key={`${section.id}-${it.id}`}
                          type="button"
                          onClick={() => handleTile(it)}
                          className={cn(
                            'relative flex h-[88px] flex-col justify-between rounded-lg border bg-[var(--surface)] p-[var(--s-3)] text-start transition-all active:scale-[0.98]',
                            qty > 0
                              ? 'border-[var(--brand-500)] shadow-1'
                              : 'border-[var(--line)] hover:border-[var(--brand-500)] hover:shadow-1',
                          )}
                        >
                          {qty > 0 && (
                            <span className="absolute end-2 top-2 flex min-w-5 items-center justify-center rounded-full bg-[var(--brand-500)] px-1.5 text-fs-xs font-semibold text-white">
                              {qty}
                            </span>
                          )}
                          <span className="line-clamp-2 pe-6 text-fs-sm font-medium leading-tight">{it.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono tabular-nums text-fs-xs text-[var(--fg-muted)]">
                              ₪{it.price.toFixed(2)}
                            </span>
                            {it.item_type === 'combo' && (
                              <span className="rounded-full bg-[var(--brand-500)]/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-600)]">
                                {t('comboLabel')}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Ticket / receipt ─────────────────────────────────────────── */}
        <aside className="flex min-h-0 min-w-0 flex-col bg-[var(--surface)]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)]">
            <div className="flex items-center gap-2">
              <ShoppingBagIcon className="size-4 text-[var(--fg-muted)]" />
              <h2 className="text-fs-sm font-semibold">{t('orderItems')}</h2>
              {itemCount > 0 && <Badge tone="neutral">{itemCount}</Badge>}
            </div>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setLines([])}
                className="flex items-center gap-1 text-fs-xs text-[var(--fg-muted)] hover:text-[var(--danger-500)]"
              >
                <XIcon className="size-3.5" />
                {t('clearAll')}
              </button>
            )}
          </div>

          {/* Lines */}
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--s-4)]">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-[var(--s-10)] text-center">
                <ShoppingBagIcon className="size-8 text-[var(--fg-subtle)]" />
                <p className="max-w-[220px] text-fs-sm text-[var(--fg-subtle)]">{t('emptyCartHint')}</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {lines.map((l) => (
                  <li key={l.uid} className="flex flex-col gap-1.5 py-[var(--s-3)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-fs-sm font-medium">{l.item.name}</p>
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
                      <span className="shrink-0 font-mono tabular-nums text-fs-sm font-medium">₪{lineTotal(l).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md border border-[var(--line-strong)]">
                        <button type="button" onClick={() => changeQty(l.uid, -1)} aria-label={t('decrease')} className="flex size-7 items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg)]">
                          <MinusIcon className="size-4" />
                        </button>
                        <span className="w-7 text-center font-mono tabular-nums text-fs-sm">{l.quantity}</span>
                        <button type="button" onClick={() => changeQty(l.uid, 1)} aria-label={t('increase')} className="flex size-7 items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg)]">
                          <PlusIcon className="size-4" />
                        </button>
                      </div>
                      <span className="text-fs-xs text-[var(--fg-subtle)]">₪{lineUnitPrice(l).toFixed(2)}</span>
                      <button type="button" onClick={() => removeLine(l.uid)} aria-label={t('remove')} className="ms-auto flex size-7 items-center justify-center text-[var(--fg-subtle)] hover:text-[var(--danger-500)]">
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
            <div className="mb-3 flex items-center justify-between">
              <span className="text-fs-sm font-medium text-[var(--fg-muted)]">{t('total')}</span>
              <span className="font-mono tabular-nums text-fs-lg font-semibold">₪{subtotal.toFixed(2)}</span>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="h-12 w-full justify-center text-fs-md"
              disabled={lines.length === 0}
              onClick={() => { setSubmitError(null); setCheckoutOpen(true); }}
            >
              {t('checkout')}
            </Button>
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
      />
    </div>
  );
}
