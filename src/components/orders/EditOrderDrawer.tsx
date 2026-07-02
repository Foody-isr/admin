'use client';

// Edit an existing order's line items (quantity, notes, add, remove) from the
// staff order drawer. Backed by the existing per-item endpoints
// (POST/PUT/DELETE /orders/.../items) — no bulk endpoint exists, so on save we
// diff the working copy against the original and fire the minimal set of calls.
// The server re-resolves prices, recomputes the total, and broadcasts
// `order.updated`, which refreshes the board.
//
// Scope: regular items are fully editable; combos (multi-line meal deals) can be
// removed as a whole but not edited here — editing a combo's contents means
// recreating it from a new order.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Trash2, Search } from 'lucide-react';
import { Drawer, Field, Input } from '@/components/ds';
import {
  listAllItems,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  updateOrderFulfillment,
  getBatchFulfillmentConfig,
  type Order,
  type OrderItem,
  type MenuItem,
  type CreateOrderItemInput,
  type BatchFulfillmentConfigResponse,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FulfillmentSection } from './FulfillmentSection';
import type { FulfillmentValue } from '@/lib/orders/fulfillment';
import { NewOrderItemModal, type NewOrderLine, lineUnitPrice } from './NewOrderItemModal';

// ─── Working-copy model ──────────────────────────────────────────────────────

interface EditModifier {
  modifier_id: number;
  name: string;
  price_delta: number;
}

interface EditLine {
  uid: string;
  /** Set for lines that already exist on the order; undefined for newly added. */
  orderItemId?: number;
  menuItemId: number;
  name: string;
  variantName?: string;
  selectedVariantId?: number;
  unitPrice: number;
  quantity: number;
  notes: string;
  modifiers: EditModifier[];
}

interface ComboBlock {
  group: string;
  name: string;
  items: OrderItem[];
  price: number;
}

function lineToInput(line: EditLine): CreateOrderItemInput {
  return {
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    selected_variant_id: line.selectedVariantId,
    notes: line.notes || undefined,
    // The server replaces modifiers wholesale, so we resend the full set. Only
    // modifiers that map back to a menu modifier id can be re-resolved.
    modifiers: line.modifiers.map((m) => ({ modifier_id: m.modifier_id, applied: true })),
  };
}

function orderItemToLine(item: OrderItem): EditLine {
  const modifiers: EditModifier[] = (item.modifiers ?? [])
    .filter((m) => m.menu_item_modifier_id)
    .map((m) => ({ modifier_id: m.menu_item_modifier_id, name: m.name, price_delta: m.price_delta || 0 }));
  return {
    uid: `existing-${item.id}`,
    orderItemId: item.id,
    menuItemId: item.menu_item_id,
    name: item.name,
    variantName: item.selected_variant_name || undefined,
    selectedVariantId: item.selected_variant_id,
    unitPrice: item.selected_variant_price || item.price,
    quantity: item.quantity,
    notes: item.notes ?? '',
    modifiers,
  };
}

function newLineToEditLine(nl: NewOrderLine): EditLine {
  return {
    uid: nl.uid,
    menuItemId: nl.item.id,
    name: nl.item.name,
    variantName: nl.selectedVariantName,
    selectedVariantId: nl.selectedVariantId,
    unitPrice: lineUnitPrice(nl),
    quantity: nl.quantity,
    notes: nl.notes,
    modifiers: nl.modifiers.map((m) => ({ modifier_id: m.id, name: m.name, price_delta: m.price_delta })),
  };
}

interface EditOrderDrawerProps {
  open: boolean;
  order: Order | null;
  restaurantId: number;
  onClose: () => void;
  /** Called after a successful save so the parent can refetch the board. */
  onSaved: () => void;
}

export function EditOrderDrawer({ open, order, restaurantId, onClose, onSaved }: EditOrderDrawerProps) {
  const { t } = useI18n();

  const [lines, setLines] = useState<EditLine[]>([]);
  const [combos, setCombos] = useState<ComboBlock[]>([]);
  const [removedCombos, setRemovedCombos] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apt, setApt] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentValue>({ timing: 'immediate' });
  const [batchConfig, setBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);

  // Add-item picker state.
  const [catalog, setCatalog] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);

  // Seed the working copy from the order whenever the drawer opens for an order.
  useEffect(() => {
    if (!open || !order) return;
    const all = order.items ?? [];
    setLines(all.filter((i) => !i.combo_group).map(orderItemToLine));

    const map = new Map<string, OrderItem[]>();
    for (const it of all) {
      if (it.combo_group) {
        const g = map.get(it.combo_group) ?? [];
        g.push(it);
        map.set(it.combo_group, g);
      }
    }
    setCombos(
      Array.from(map.entries()).map(([group, items]) => ({
        group,
        name: items[0]?.combo_name || t('comboMenuFallback') || 'Combo',
        items,
        price: items[0]?.combo_price || items.reduce((s, i) => s + i.price * i.quantity, 0),
      })),
    );
    setRemovedCombos(new Set());
    setError(null);
    setSearch('');

    setOrderType((order.order_type as 'pickup' | 'delivery') ?? 'pickup');
    setAddress(order.delivery_address ?? '');
    setCity(order.delivery_city ?? '');
    setFloor(order.delivery_floor ?? '');
    setApt(order.delivery_apt ?? '');
    setFulfillment(
      order.is_scheduled && order.scheduled_for
        ? {
            timing: 'scheduled',
            scheduledFor: order.scheduled_for.slice(0, 10),
            windowStart: order.scheduled_pickup_window_start ?? undefined,
            windowEnd: order.scheduled_pickup_window_end ?? undefined,
          }
        : { timing: 'immediate' },
    );
  }, [open, order, t]);

  // Load the item catalog once for the add picker.
  useEffect(() => {
    if (!open || catalog.length > 0) return;
    listAllItems(restaurantId)
      .then((items) => setCatalog(items.filter((i) => i.is_active && i.item_type !== 'combo')))
      .catch(() => setCatalog([]));
  }, [open, restaurantId, catalog.length]);

  // Load batch fulfillment config on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getBatchFulfillmentConfig(restaurantId)
      .then((cfg) => { if (!cancelled) setBatchConfig(cfg); })
      .catch(() => { if (!cancelled) setBatchConfig(null); });
    return () => { cancelled = true; };
  }, [open, restaurantId]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.slice(0, 30);
    return catalog.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 30);
  }, [catalog, search]);

  const liveTotal = useMemo(() => {
    const itemsTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const combosTotal = combos
      .filter((c) => !removedCombos.has(c.group))
      .reduce((s, c) => s + c.price, 0);
    return itemsTotal + combosTotal;
  }, [lines, combos, removedCombos]);

  const remainingCount =
    lines.length + combos.filter((c) => !removedCombos.has(c.group)).length;

  function changeQty(uid: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    );
  }

  function setNotes(uid: string, notes: string) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, notes } : l)));
  }

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  }

  function toggleCombo(group: string) {
    setRemovedCombos((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function handleAddFromPicker(nl: NewOrderLine) {
    setLines((prev) => [...prev, newLineToEditLine(nl)]);
  }

  async function handleSave() {
    if (!order) return;
    if (remainingCount === 0) {
      setError(t('emptyOrderError') || 'An order must keep at least one item.');
      return;
    }
    setSaving(true);
    setError(null);

    const original = (order.items ?? []).filter((i) => !i.combo_group);
    const keptIds = new Set(lines.filter((l) => l.orderItemId).map((l) => l.orderItemId!));

    try {
      // 1) Removed regular lines.
      for (const it of original) {
        if (!keptIds.has(it.id)) {
          await removeOrderItem(restaurantId, order.id, it.id);
        }
      }
      // 2) Removed combos — drop every child line in the group.
      for (const combo of combos) {
        if (removedCombos.has(combo.group)) {
          for (const it of combo.items) {
            await removeOrderItem(restaurantId, order.id, it.id);
          }
        }
      }
      // 3) Updated existing lines (quantity / notes changed).
      for (const line of lines) {
        if (!line.orderItemId) continue;
        const orig = original.find((o) => o.id === line.orderItemId);
        if (orig && (orig.quantity !== line.quantity || (orig.notes ?? '') !== line.notes)) {
          await updateOrderItem(restaurantId, line.orderItemId, lineToInput(line));
        }
      }
      // 4) Newly added lines.
      for (const line of lines) {
        if (!line.orderItemId) {
          await addOrderItem(restaurantId, order.id, lineToInput(line));
        }
      }

      // 5) Update fulfillment (type, address, schedule).
      await updateOrderFulfillment(restaurantId, order.id, {
        order_type: orderType,
        is_scheduled: fulfillment.timing === 'scheduled',
        scheduled_for: fulfillment.timing === 'scheduled' ? fulfillment.scheduledFor : undefined,
        scheduled_pickup_window_start: fulfillment.timing === 'scheduled' ? fulfillment.windowStart : undefined,
        scheduled_pickup_window_end: fulfillment.timing === 'scheduled' ? fulfillment.windowEnd : undefined,
        ...(orderType === 'delivery'
          ? { delivery_address: address, delivery_city: city, delivery_floor: floor, delivery_apt: apt }
          : {}),
      });

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={t('editOrder') || 'Modifier la commande'}
        subtitle={order ? t('orderNumber').replace('{id}', String(order.id)) : undefined}
        width={560}
        onSave={handleSave}
        saveLabel={saving ? t('savingChanges') || 'Saving…' : `${t('saveChanges')} · ₪${liveTotal.toFixed(2)}`}
        saveDisabled={saving}
      >
        <div className="flex flex-col gap-[var(--s-5)]">
          {error && (
            <div className="rounded-md border border-[var(--danger-300)] bg-[var(--danger-50)] px-[var(--s-3)] py-2 text-fs-sm text-[var(--danger-600)]">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {t('orderType')}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOrderType('pickup')}
                className={cn('flex-1 rounded-md border p-[var(--s-3)] text-fs-sm font-medium',
                  orderType === 'pickup' ? 'border-[var(--brand-500)] ring-1 ring-[var(--brand-500)]' : 'border-[var(--line-strong)]')}>
                {t('pickup')}
              </button>
              <button type="button" onClick={() => setOrderType('delivery')}
                className={cn('flex-1 rounded-md border p-[var(--s-3)] text-fs-sm font-medium',
                  orderType === 'delivery' ? 'border-[var(--brand-500)] ring-1 ring-[var(--brand-500)]' : 'border-[var(--line-strong)]')}>
                {t('delivery')}
              </button>
            </div>
          </div>

          {orderType === 'delivery' && (
            <div className="flex flex-col gap-[var(--s-3)]">
              <Field label={t('deliveryAddress')}>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t('city')}><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
                <Field label={t('floor')}><Input value={floor} onChange={(e) => setFloor(e.target.value)} /></Field>
                <Field label={t('apt')}><Input value={apt} onChange={(e) => setApt(e.target.value)} /></Field>
              </div>
            </div>
          )}

          <FulfillmentSection
            orderType={orderType}
            batchConfig={batchConfig}
            value={fulfillment}
            onChange={setFulfillment}
          />

          {/* Existing + added regular lines */}
          <div className="flex flex-col gap-[var(--s-3)]">
            {lines.map((line) => (
              <div key={line.uid} className="rounded-md border border-[var(--line)] p-[var(--s-3)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-fs-sm font-medium truncate">
                      {line.name}
                      {line.variantName ? <span className="text-[var(--fg-muted)]"> — {line.variantName}</span> : null}
                    </div>
                    {line.modifiers.length > 0 && (
                      <div className="text-fs-xs text-[var(--fg-muted)] truncate">
                        {line.modifiers.map((m) => m.name).join(' · ')}
                      </div>
                    )}
                    <div className="text-fs-xs text-[var(--fg-subtle)] font-mono">₪{line.unitPrice.toFixed(2)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.uid)}
                    aria-label={t('remove')}
                    className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--danger-600)] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => changeQty(line.uid, -1)}
                      disabled={line.quantity <= 1}
                      aria-label="-"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-strong)] disabled:opacity-40"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-fs-sm tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(line.uid, 1)}
                      aria-label="+"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-strong)]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="ms-auto text-fs-sm font-medium tabular-nums">
                    ₪{(line.unitPrice * line.quantity).toFixed(2)}
                  </span>
                </div>

                <input
                  type="text"
                  value={line.notes}
                  onChange={(e) => setNotes(line.uid, e.target.value)}
                  placeholder={t('itemNotesPlaceholder')}
                  className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-1.5 text-fs-xs"
                />
              </div>
            ))}

            {/* Combos — removable, not editable */}
            {combos.map((combo) => {
              const removed = removedCombos.has(combo.group);
              return (
                <div
                  key={combo.group}
                  className={`rounded-md border border-[var(--line)] p-[var(--s-3)] ${removed ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-fs-sm font-medium truncate">🍱 {combo.name}</div>
                      <div className="text-fs-xs text-[var(--fg-muted)]">
                        {combo.items.map((i) => i.name).join(' · ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCombo(combo.group)}
                      className="shrink-0 text-fs-xs text-[var(--fg-subtle)] hover:text-[var(--fg)] underline"
                    >
                      {removed ? t('cancel') : t('remove')}
                    </button>
                  </div>
                </div>
              );
            })}

            {combos.length > 0 && (
              <p className="text-fs-xs text-[var(--fg-subtle)]">{t('combosNotEditable')}</p>
            )}
          </div>

          {/* Add-item picker */}
          <Field label={t('addItem')}>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchItems')}
                className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 py-2 text-fs-sm"
              />
            </div>
            <div className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--line)]">
              {filteredCatalog.length === 0 ? (
                <p className="px-[var(--s-3)] py-3 text-fs-sm text-[var(--fg-subtle)]">{t('noItemsFound')}</p>
              ) : (
                filteredCatalog.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setPickerItem(it)}
                    className="flex w-full items-center justify-between gap-3 px-[var(--s-3)] py-2 text-start hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    <span className="text-fs-sm truncate">{it.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-fs-xs text-[var(--fg-muted)]">
                      ₪{it.price.toFixed(2)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Field>
        </div>
      </Drawer>

      {/* Variant/modifier picker for the item being added */}
      <NewOrderItemModal
        item={pickerItem}
        open={pickerItem != null}
        onClose={() => setPickerItem(null)}
        onAdd={handleAddFromPicker}
      />
    </>
  );
}
