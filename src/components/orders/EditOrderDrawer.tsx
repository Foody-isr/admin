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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Search, Pencil } from 'lucide-react';
import { Drawer, Field, Input } from '@/components/ds';
import {
  listAllItems,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  replaceOrderCombo,
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
import { itemSizeOptions } from '@/lib/item-options';
import { FulfillmentSection } from './FulfillmentSection';
import type { FulfillmentValue } from '@/lib/orders/fulfillment';
import { NewOrderItemModal, type NewOrderLine, type ComboSelection, lineUnitPrice } from './NewOrderItemModal';
import { NewOrderComboModal } from './NewOrderComboModal';

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
  /** Soft-delete: existing lines stay visible (struck through, restorable)
   *  until save, so staff can review removals — same pattern as combos. */
  removed?: boolean;
}

// An item with no size options and no active modifiers can be added with one
// click — no picker modal needed. Mirrors NewOrderItemModal's own field reads.
// Sizes come from itemSizeOptions (option sets — NOT the dead legacy
// variant_groups): reading the legacy tables here made every option-set item
// look "simple", so staff quick-adds created size-less lines the production
// sheet could not weigh.
function isSimpleItem(it: MenuItem): boolean {
  const hasVariants = itemSizeOptions(it).length > 0;
  const hasDirectMods = (it.modifiers ?? []).some((m) => m.is_active);
  const hasSetMods = (it.modifier_sets ?? []).some((s) => (s.modifiers ?? []).some((m) => m.is_active));
  return !hasVariants && !hasDirectMods && !hasSetMods;
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

// A combo whose composition has been edited but not yet saved. `price` is the
// display price (frozen base + new upcharges); `labels` are the new component
// labels for the collapsed combo row.
interface StagedCombo {
  selections: ComboSelection[];
  price: number;
  labels: string[];
}

// Which combo step a picked line came from. Prefer the snapshotted combo_step_id
// (set on every row created after this feature shipped); for pre-feature rows,
// best-effort match the item against an explicit step's item list, else fall back
// to the first step. Group steps resolve async in the picker, so we can't match
// them here — the admin can adjust the pre-filled selection if it lands wrong.
function deriveComboStepId(item: OrderItem, comboMenuItem: MenuItem): number {
  if (item.combo_step_id != null) return item.combo_step_id;
  const steps = comboMenuItem.combo_steps ?? [];
  for (const s of steps) {
    if (s.source_type !== 'group' && (s.items ?? []).some((si) => si.menu_item_id === item.menu_item_id)) {
      return (s.id as number) ?? 0;
    }
  }
  return (steps[0]?.id as number) ?? 0;
}

// Map a combo instance's existing OrderItem children to picker selections, so the
// edit flow opens pre-filled. priceDelta carries the stored per-pick upcharge
// (combo child Price); the picker re-derives it from the menu on save.
function comboItemsToSelections(items: OrderItem[], comboMenuItem: MenuItem): ComboSelection[] {
  return items.map((it) => ({
    stepId: deriveComboStepId(it, comboMenuItem),
    stepName: '',
    menuItemId: it.menu_item_id,
    menuItemName: it.name,
    optionId: it.selected_variant_id ?? null,
    quantity: it.quantity,
    priceDelta: it.price,
  }));
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
  // Staged combo re-compositions: group UUID → new selections (persisted on save).
  const [comboEdits, setComboEdits] = useState<Record<string, StagedCombo>>({});
  // The combo instance currently open in the composition picker, if any. `key`
  // is unique per open (group + nonce) so the picker always re-seeds from
  // `initial`, even when reopening the same combo after closing without saving.
  const [editingCombo, setEditingCombo] = useState<{ group: string; combo: MenuItem; initial: ComboSelection[]; key: string } | null>(null);
  const comboEditNonce = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apt, setApt] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentValue>({ timing: 'immediate' });
  const [batchConfig, setBatchConfig] = useState<BatchFulfillmentConfigResponse | null>(null);

  // Add-item picker state. Results render only while a query is typed; the
  // highlight index drives ArrowUp/ArrowDown + Enter keyboard selection.
  const [catalog, setCatalog] = useState<MenuItem[]>([]);
  // Full catalog by id (INCLUDING combos) — used to resolve a combo's step
  // definition when opening the composition picker, and passed to it for
  // group-step resolution.
  const [itemMap, setItemMap] = useState<Map<number, MenuItem>>(new Map());
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);

  // Which line's notes editor is open (notes collapse behind a pencil affordance).
  const [editingNotesUid, setEditingNotesUid] = useState<string | null>(null);

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
    setComboEdits({});
    setEditingCombo(null);
    setError(null);
    setSearch('');
    setHighlightIdx(0);
    setEditingNotesUid(null);

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

  // Load the item catalog once: `catalog` (active non-combos) feeds the add
  // picker; `itemMap` (everything, combos included) resolves a combo's step
  // definition for the composition picker.
  useEffect(() => {
    if (!open || itemMap.size > 0) return;
    listAllItems(restaurantId)
      .then((items) => {
        setItemMap(new Map(items.map((i) => [i.id, i])));
        setCatalog(items.filter((i) => i.is_active && i.item_type !== 'combo'));
      })
      .catch(() => { setItemMap(new Map()); setCatalog([]); });
  }, [open, restaurantId, itemMap.size]);

  // Load batch fulfillment config on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getBatchFulfillmentConfig(restaurantId)
      .then((cfg) => { if (!cancelled) setBatchConfig(cfg); })
      .catch(() => { if (!cancelled) setBatchConfig(null); });
    return () => { cancelled = true; };
  }, [open, restaurantId]);

  // Search results — only while typing, capped at 8 for keyboard navigation.
  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog, search]);

  // Original per-line snapshot, for the "qty changed" marker and dirty checks.
  const origById = useMemo(() => {
    const m = new Map<number, { quantity: number; notes: string }>();
    for (const it of order?.items ?? []) {
      if (!it.combo_group) m.set(it.id, { quantity: it.quantity, notes: it.notes ?? '' });
    }
    return m;
  }, [order]);

  const activeLines = useMemo(() => lines.filter((l) => !l.removed), [lines]);

  const liveTotal = useMemo(() => {
    const itemsTotal = activeLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const combosTotal = combos
      .filter((c) => !removedCombos.has(c.group))
      .reduce((s, c) => s + (comboEdits[c.group]?.price ?? c.price), 0);
    return itemsTotal + combosTotal;
  }, [activeLines, combos, removedCombos, comboEdits]);

  const remainingCount =
    activeLines.length + combos.filter((c) => !removedCombos.has(c.group)).length;

  // Fulfillment/type/address dirty — gates both the PUT on save and the
  // discard-confirm on close.
  const fulfillmentDirty = useMemo(() => {
    if (!order) return false;
    if (orderType !== order.order_type) return true;
    if (
      orderType === 'delivery' &&
      (address !== (order.delivery_address ?? '') ||
        city !== (order.delivery_city ?? '') ||
        floor !== (order.delivery_floor ?? '') ||
        apt !== (order.delivery_apt ?? ''))
    ) {
      return true;
    }
    const wasScheduled = !!(order.is_scheduled && order.scheduled_for);
    if ((fulfillment.timing === 'scheduled') !== wasScheduled) return true;
    if (fulfillment.timing === 'scheduled') {
      return (
        fulfillment.scheduledFor !== order.scheduled_for?.slice(0, 10) ||
        (fulfillment.windowStart ?? undefined) !== (order.scheduled_pickup_window_start ?? undefined) ||
        (fulfillment.windowEnd ?? undefined) !== (order.scheduled_pickup_window_end ?? undefined)
      );
    }
    return false;
  }, [order, orderType, address, city, floor, apt, fulfillment]);

  const linesDirty = useMemo(
    () =>
      removedCombos.size > 0 ||
      Object.keys(comboEdits).length > 0 ||
      lines.some((l) => {
        if (l.removed || !l.orderItemId) return true; // removal or brand-new line
        const orig = origById.get(l.orderItemId);
        return !!orig && (orig.quantity !== l.quantity || orig.notes !== l.notes);
      }),
    [lines, removedCombos, comboEdits, origById],
  );

  const isDirty = linesDirty || fulfillmentDirty;

  function changeQty(uid: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    );
  }

  function setNotes(uid: string, notes: string) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, notes } : l)));
  }

  function removeLine(uid: string) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.uid !== uid) return [l];
        // Existing lines soft-delete (struck through + restorable) so the
        // removal is reviewable before save; just-added lines simply go away.
        return l.orderItemId ? [{ ...l, removed: true }] : [];
      }),
    );
    if (editingNotesUid === uid) setEditingNotesUid(null);
  }

  function restoreLine(uid: string) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, removed: false } : l)));
  }

  function toggleCombo(group: string) {
    setRemovedCombos((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  // Open the composition picker for a combo instance, pre-filled with its current
  // (or already-staged) selections. Needs the combo's step definition from the
  // catalog; if it isn't loaded/available, surface a note rather than a broken UI.
  function openComboEditor(combo: ComboBlock) {
    const comboItemId = combo.items[0]?.combo_item_id;
    const comboMenuItem = comboItemId != null ? itemMap.get(comboItemId) : undefined;
    if (!comboMenuItem) {
      setError(t('comboNotEditableNow'));
      return;
    }
    const staged = comboEdits[combo.group];
    const initial = staged ? staged.selections : comboItemsToSelections(combo.items, comboMenuItem);
    comboEditNonce.current += 1;
    setEditingCombo({ group: combo.group, combo: comboMenuItem, initial, key: `${combo.group}#${comboEditNonce.current}` });
  }

  // Stage a re-composed combo from the picker. The display price keeps the
  // frozen base (the combo_price snapshot on the order) and adds the new
  // upcharges; the server enforces the same on save.
  function handleComboEdited(nl: NewOrderLine) {
    if (!editingCombo) return;
    const group = editingCombo.group;
    const selections = nl.comboSelections ?? [];
    const base = combos.find((c) => c.group === group)?.price ?? nl.item.price;
    const upcharge = selections.reduce((s, sel) => s + (sel.priceDelta || 0) * sel.quantity, 0);
    setComboEdits((prev) => ({
      ...prev,
      [group]: { selections, price: base + upcharge, labels: selections.map((s) => s.menuItemName) },
    }));
    setEditingCombo(null);
  }

  function handleAddFromPicker(nl: NewOrderLine) {
    setLines((prev) => [...prev, newLineToEditLine(nl)]);
  }

  // Picking a search result: simple items (no variants/modifiers) add in one
  // click — merging into an identical existing line instead of duplicating it;
  // items with options open the picker modal.
  function pickCatalogItem(it: MenuItem) {
    if (isSimpleItem(it)) {
      const existing = lines.find(
        (l) => !l.removed && l.menuItemId === it.id && !l.selectedVariantId && l.modifiers.length === 0,
      );
      if (existing) {
        changeQty(existing.uid, 1);
      } else {
        setLines((prev) => [
          ...prev,
          {
            uid: `new-${it.id}-${Date.now()}`,
            menuItemId: it.id,
            name: it.name,
            unitPrice: it.price,
            quantity: 1,
            notes: '',
            modifiers: [],
          },
        ]);
      }
    } else {
      setPickerItem(it);
    }
    setSearch('');
    setHighlightIdx(0);
  }

  // "+1" quick action on a search result — bumps the one matching line without
  // closing the search, for rapid repeat additions. Shown only when the match
  // is unambiguous (exactly one active line for that item).
  function quickAddMatch(it: MenuItem): EditLine | undefined {
    const matches = activeLines.filter((l) => l.menuItemId === it.id);
    return matches.length === 1 ? matches[0] : undefined;
  }

  async function handleSave() {
    if (!order) return;
    if (remainingCount === 0) {
      setError(t('emptyOrderError') || 'An order must keep at least one item.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // 1) Soft-deleted regular lines.
      for (const line of lines) {
        if (line.removed && line.orderItemId) {
          await removeOrderItem(restaurantId, order.id, line.orderItemId);
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
        if (line.removed || !line.orderItemId) continue;
        const orig = origById.get(line.orderItemId);
        if (orig && (orig.quantity !== line.quantity || orig.notes !== line.notes)) {
          await updateOrderItem(restaurantId, line.orderItemId, lineToInput(line));
        }
      }
      // 4) Newly added lines.
      for (const line of lines) {
        if (!line.removed && !line.orderItemId) {
          await addOrderItem(restaurantId, order.id, lineToInput(line));
        }
      }
      // 4b) Re-composed combos — one atomic replace per edited group. Skip any
      // group that was also removed (removal wins). The server preserves the
      // base-price snapshot and recomputes the total.
      for (const [group, staged] of Object.entries(comboEdits)) {
        if (removedCombos.has(group)) continue;
        const comboItemId = combos.find((c) => c.group === group)?.items[0]?.combo_item_id;
        if (comboItemId == null) continue;
        await replaceOrderCombo(restaurantId, order.id, group, {
          combo_item_id: comboItemId,
          selections: staged.selections.map((s) => ({
            step_id: s.stepId,
            menu_item_id: s.menuItemId,
            option_id: s.optionId ?? undefined,
            quantity: s.quantity,
          })),
          serie_date: order.scheduled_for ? order.scheduled_for.slice(0, 10) : undefined,
        });
      }

      // 5) Fulfillment (type, address, schedule) — only when actually changed,
      // so a pure item edit never touches the order's status/schedule.
      if (fulfillmentDirty) {
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
      }

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
        onOpenChange={(o) => {
          if (o) return;
          // Guard against silently losing edits on Escape / overlay click.
          if (isDirty && !window.confirm(t('discardUnsavedChanges'))) return;
          onClose();
        }}
        title={t('editOrder') || 'Modifier la commande'}
        subtitle={order ? t('orderNumber').replace('{id}', String(order.id)) : undefined}
        width={560}
        onSave={handleSave}
        saveLabel={saving ? t('savingChanges') || 'Saving…' : `${t('saveChanges')} · ₪${liveTotal.toFixed(2)}`}
        saveDisabled={saving || !isDirty}
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

          {/* Add-item search — at the TOP of the items area so adding never
              requires scrolling past the whole order. Results render as an
              overlay only while typing (max 8, keyboard-navigable). */}
          <Field label={t('addItem')}>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
                onKeyDown={(e) => {
                  if (filteredCatalog.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIdx((i) => Math.min(i + 1, filteredCatalog.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    pickCatalogItem(filteredCatalog[Math.min(highlightIdx, filteredCatalog.length - 1)]);
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    setSearch('');
                  }
                }}
                placeholder={t('searchItems')}
                className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] ps-9 pe-3 py-2 text-fs-sm"
              />
              {search.trim() !== '' && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-[var(--line-strong)] bg-[var(--surface)] shadow-lg">
                  {filteredCatalog.length === 0 ? (
                    <p className="px-[var(--s-3)] py-3 text-fs-sm text-[var(--fg-subtle)]">{t('noItemsFound')}</p>
                  ) : (
                    filteredCatalog.map((it, idx) => {
                      const variantCount = (it.variant_groups?.[0]?.variants ?? []).filter((v) => v.is_active).length;
                      const match = quickAddMatch(it);
                      return (
                        <div
                          key={it.id}
                          className={cn(
                            'flex w-full items-center gap-2 px-[var(--s-3)] py-2',
                            idx === highlightIdx && 'bg-[var(--surface-2)]',
                          )}
                          onMouseEnter={() => setHighlightIdx(idx)}
                        >
                          <button
                            type="button"
                            onClick={() => pickCatalogItem(it)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-start"
                          >
                            <span className="text-fs-sm truncate">{it.name}</span>
                            {variantCount > 0 && (
                              <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
                                {(t('nOptions') || '{n} options').replace('{n}', String(variantCount))}
                              </span>
                            )}
                            <span className="ms-auto shrink-0 font-mono tabular-nums text-fs-xs text-[var(--fg-muted)]">
                              ₪{it.price.toFixed(2)}
                            </span>
                          </button>
                          {match && (
                            <button
                              type="button"
                              onClick={() => changeQty(match.uid, 1)}
                              title={t('alreadyAdded')}
                              className="shrink-0 rounded-md border border-[var(--line-strong)] px-2 py-0.5 text-fs-xs font-medium text-[var(--brand-600)] hover:bg-[var(--surface-2)]"
                            >
                              +1
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </Field>

          {/* Lines + combos — one compact, reviewable list. Soft-deleted rows
              stay visible (struck through + restorable) so staff can audit
              every change before saving. */}
          <div className="flex flex-col gap-[var(--s-2)]">
            <div className="rounded-md border border-[var(--line)] divide-y divide-[var(--line)]">
              {lines.map((line) => {
                const orig = line.orderItemId ? origById.get(line.orderItemId) : undefined;
                const qtyChanged = !!orig && orig.quantity !== line.quantity;
                const isNew = !line.orderItemId;
                const editingNotes = editingNotesUid === line.uid;
                return (
                  <div key={line.uid} className="px-[var(--s-3)] py-[var(--s-2)]">
                    <div className="flex items-center gap-[var(--s-3)]">
                      {/* Stepper pill (hidden for removed rows) */}
                      {line.removed ? (
                        <span className="w-[76px] shrink-0" aria-hidden />
                      ) : (
                        <div className="flex shrink-0 items-center rounded-md border border-[var(--line-strong)]">
                          <button
                            type="button"
                            onClick={() => changeQty(line.uid, -1)}
                            disabled={line.quantity <= 1}
                            aria-label="-"
                            className="flex h-7 w-6 items-center justify-center disabled:opacity-40"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span
                            className={cn(
                              'w-7 text-center text-fs-sm tabular-nums',
                              qtyChanged && 'font-semibold text-[var(--brand-600)]',
                            )}
                            title={qtyChanged ? `${orig!.quantity} → ${line.quantity}` : undefined}
                          >
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQty(line.uid, 1)}
                            aria-label="+"
                            className="flex h-7 w-6 items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Name + chips */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'text-fs-sm font-medium truncate',
                              line.removed && 'line-through text-[var(--fg-muted)]',
                            )}
                          >
                            {line.name}
                          </span>
                          {isNew && !line.removed && (
                            <span
                              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                              style={{
                                background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                                color: 'var(--brand-500)',
                              }}
                            >
                              {t('badgeNew')}
                            </span>
                          )}
                        </div>
                        {(line.variantName || line.modifiers.length > 0 || line.notes) && !line.removed && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {line.variantName && (
                              <span
                                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                style={{
                                  background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                                  color: 'var(--brand-500)',
                                }}
                              >
                                {line.variantName}
                              </span>
                            )}
                            {line.modifiers.map((m) => (
                              <span
                                key={m.modifier_id}
                                className="inline-flex items-center rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]"
                              >
                                {m.name}
                              </span>
                            ))}
                            {line.notes && !editingNotes && (
                              <button
                                type="button"
                                onClick={() => setEditingNotesUid(line.uid)}
                                className="inline-flex items-center gap-1 text-[11px] italic text-[var(--fg-muted)] hover:text-[var(--fg)]"
                              >
                                <Pencil className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate max-w-[180px]">&ldquo;{line.notes}&rdquo;</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Note affordance (only when no note yet) */}
                      {!line.removed && !line.notes && !editingNotes && (
                        <button
                          type="button"
                          onClick={() => setEditingNotesUid(line.uid)}
                          aria-label={t('addNote')}
                          title={t('addNote')}
                          className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Line total */}
                      <span
                        className={cn(
                          'shrink-0 text-fs-sm font-medium tabular-nums text-end min-w-[64px]',
                          line.removed && 'line-through text-[var(--fg-muted)]',
                        )}
                      >
                        ₪{(line.unitPrice * line.quantity).toFixed(2)}
                      </span>

                      {/* Remove / restore */}
                      {line.removed ? (
                        <button
                          type="button"
                          onClick={() => restoreLine(line.uid)}
                          className="shrink-0 text-fs-xs font-medium text-[var(--brand-600)] hover:underline"
                        >
                          {t('restore')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeLine(line.uid)}
                          aria-label={t('remove')}
                          className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--danger-600)] transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* On-demand notes editor */}
                    {editingNotes && !line.removed && (
                      <input
                        type="text"
                        autoFocus
                        value={line.notes}
                        onChange={(e) => setNotes(line.uid, e.target.value)}
                        onBlur={() => setEditingNotesUid(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingNotesUid(null);
                          }
                        }}
                        placeholder={t('itemNotesPlaceholder')}
                        className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-1.5 text-fs-xs"
                      />
                    )}
                  </div>
                );
              })}

              {/* Combos — editable in place (composition) or removable as a whole */}
              {combos.map((combo) => {
                const removed = removedCombos.has(combo.group);
                const edited = comboEdits[combo.group];
                const labels = edited ? edited.labels : combo.items.map((i) => i.name);
                const price = edited ? edited.price : combo.price;
                return (
                  <div key={combo.group} className="flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'text-fs-sm font-medium truncate',
                            removed && 'line-through text-[var(--fg-muted)]',
                          )}
                        >
                          {combo.name}
                        </span>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                          style={{
                            background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                            color: 'var(--brand-500)',
                          }}
                        >
                          {t('combo') || 'Combo'}
                        </span>
                        {edited && !removed && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                            style={{
                              background: 'color-mix(in oklab, var(--warning-500) 16%, transparent)',
                              color: 'var(--warning-600)',
                            }}
                          >
                            {t('modified')}
                          </span>
                        )}
                      </div>
                      <div className={cn('text-fs-xs text-[var(--fg-muted)] truncate', removed && 'line-through')}>
                        {labels.join(' · ')}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-fs-sm font-medium tabular-nums text-end min-w-[64px]',
                        removed && 'line-through text-[var(--fg-muted)]',
                      )}
                    >
                      ₪{price.toFixed(2)}
                    </span>
                    {!removed && (
                      <button
                        type="button"
                        onClick={() => openComboEditor(combo)}
                        aria-label={t('editCombo')}
                        title={t('editCombo')}
                        className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {removed ? (
                      <button
                        type="button"
                        onClick={() => toggleCombo(combo.group)}
                        className="shrink-0 text-fs-xs font-medium text-[var(--brand-600)] hover:underline"
                      >
                        {t('restore')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCombo(combo.group)}
                        aria-label={t('remove')}
                        className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--danger-600)] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {combos.length > 0 && (
              <p className="text-fs-xs text-[var(--fg-subtle)]">{t('combosEditHint')}</p>
            )}
          </div>
        </div>
      </Drawer>

      {/* Variant/modifier picker for the item being added */}
      <NewOrderItemModal
        item={pickerItem}
        open={pickerItem != null}
        onClose={() => setPickerItem(null)}
        onAdd={handleAddFromPicker}
      />

      {/* Composition picker for editing an existing combo instance in place */}
      <NewOrderComboModal
        combo={editingCombo?.combo ?? null}
        restaurantId={restaurantId}
        itemMap={itemMap}
        serieDate={order?.scheduled_for ? order.scheduled_for.slice(0, 10) : null}
        open={editingCombo != null}
        onClose={() => setEditingCombo(null)}
        onAdd={handleComboEdited}
        initialSelections={editingCombo?.initial}
        editKey={editingCombo?.key}
      />
    </>
  );
}
