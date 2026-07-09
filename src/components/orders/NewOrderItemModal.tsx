'use client';

import { useMemo, useState } from 'react';
import { Drawer, Field, Textarea } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { MenuItem, MenuItemModifier } from '@/lib/api';
import { itemSizeOptions, itemSizeGroupLabel, isSizeOrderable, type ItemSizeOption } from '@/lib/item-options';

// ─── Cart line model (shared with the order-builder page) ────────────────────

export interface NewOrderLineModifier {
  id: number;
  name: string;
  price_delta: number;
}

/** One picked sub-item inside a combo line. */
export interface ComboSelection {
  stepId: number;
  stepName: string;
  menuItemId: number;
  menuItemName: string;
  optionId?: number | null;
  quantity: number;
  priceDelta: number;
}

export interface NewOrderLine {
  /** Stable per-line id — distinct lines of the same item must not merge. */
  uid: string;
  item: MenuItem;
  quantity: number;
  notes: string;
  selectedVariantId?: number;
  selectedVariantName?: string;
  selectedVariantPrice?: number;
  modifiers: NewOrderLineModifier[];
  // Present only on combo lines: `item` is the combo, and these are its picks.
  comboItemId?: number;
  comboSelections?: ComboSelection[];
}

/** Per-unit price for display only — the server recomputes the authoritative
 *  total from the menu item, variant, and modifiers at order creation. */
export function lineUnitPrice(
  line: Pick<NewOrderLine, 'item' | 'selectedVariantPrice' | 'modifiers' | 'comboItemId' | 'comboSelections'>,
): number {
  if (line.comboItemId != null) {
    const delta = (line.comboSelections ?? []).reduce((sum, s) => sum + (s.priceDelta || 0) * s.quantity, 0);
    return line.item.price + delta;
  }
  const base = line.selectedVariantPrice ?? line.item.price;
  const mods = line.modifiers.reduce((sum, m) => sum + (m.price_delta || 0), 0);
  return base + mods;
}

export function lineTotal(line: NewOrderLine): number {
  return lineUnitPrice(line) * line.quantity;
}

// Flatten an item's directly-attached modifiers and modifier-set modifiers into
// labelled groups for the picker. Inactive modifiers are dropped.
interface ModifierGroup {
  key: string;
  label?: string;
  modifiers: MenuItemModifier[];
}

function collectModifierGroups(item: MenuItem): ModifierGroup[] {
  const groups: ModifierGroup[] = [];
  const direct = (item.modifiers ?? []).filter((m) => m.is_active);
  if (direct.length > 0) {
    groups.push({ key: 'direct', modifiers: direct });
  }
  for (const set of item.modifier_sets ?? []) {
    const mods = (set.modifiers ?? []).filter((m) => m.is_active);
    if (mods.length > 0) {
      groups.push({ key: `set-${set.id}`, label: set.display_name || set.name, modifiers: mods });
    }
  }
  return groups;
}

interface NewOrderItemModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onAdd: (line: NewOrderLine) => void;
}

export function NewOrderItemModal({ item, open, onClose, onAdd }: NewOrderItemModalProps) {
  const { t } = useI18n();

  // Only the first size group maps to the order's single selected_variant_id.
  const variants = useMemo(() => (item ? itemSizeOptions(item) : []), [item]);
  const modifierGroups = useMemo(() => (item ? collectModifierGroups(item) : []), [item]);

  const [variantId, setVariantId] = useState<number | undefined>(undefined);
  const [checkedMods, setCheckedMods] = useState<Set<number>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Reset local state whenever a new item is opened.
  const [seedItemId, setSeedItemId] = useState<number | null>(null);
  if (item && item.id !== seedItemId) {
    setSeedItemId(item.id);
    // Default to the first orderable size (matches guest apps), not blindly the
    // first — a sold-out lead size would otherwise pre-select an unorderable line.
    setVariantId((variants.find(isSizeOrderable) ?? variants[0])?.id);
    setCheckedMods(
      new Set(
        modifierGroups.flatMap((g) => g.modifiers).filter((m) => m.is_preselected).map((m) => m.id),
      ),
    );
    setQuantity(1);
    setNotes('');
  }

  if (!item) return null;
  const activeItem = item;

  const selectedVariant: ItemSizeOption | undefined = variants.find((v) => v.id === variantId);
  // Block adding a sold-out size — the order-time guard would reject it anyway.
  const selectedSoldOut = !!selectedVariant && !isSizeOrderable(selectedVariant);
  const allMods = modifierGroups.flatMap((g) => g.modifiers);
  const appliedMods: NewOrderLineModifier[] = allMods
    .filter((m) => checkedMods.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, price_delta: m.price_delta || 0 }));

  const previewUnit = lineUnitPrice({
    item: activeItem,
    selectedVariantPrice: selectedVariant?.price,
    modifiers: appliedMods,
  });

  function toggleMod(id: number) {
    setCheckedMods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (selectedSoldOut) return;
    onAdd({
      uid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${activeItem.id}-${Date.now()}`,
      item: activeItem,
      quantity: Math.max(1, quantity),
      notes: notes.trim(),
      selectedVariantId: selectedVariant?.id,
      selectedVariantName: selectedVariant?.name,
      selectedVariantPrice: selectedVariant?.price,
      modifiers: appliedMods,
    });
    setSeedItemId(null); // force a reset on next open
    onClose();
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={item.name}
      subtitle={item.description || undefined}
      width={520}
      onSave={handleAdd}
      saveDisabled={selectedSoldOut}
      saveLabel={
        selectedSoldOut
          ? t('outOfStock')
          : `${t('addToOrder')} · ₪${(previewUnit * Math.max(1, quantity)).toFixed(2)}`
      }
    >
      <div className="flex flex-col gap-[var(--s-5)]">
        {variants.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {itemSizeGroupLabel(activeItem) || t('size')}
            </span>
            <div className="flex flex-col gap-1.5">
              {variants.map((v) => {
                const soldOut = !isSizeOrderable(v);
                return (
                  <label
                    key={v.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-[var(--s-3)] py-2',
                      soldOut ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-[var(--fg-subtle)]',
                    )}
                  >
                    <span className="flex items-center gap-2 text-fs-sm">
                      <input
                        type="radio"
                        name="variant"
                        checked={variantId === v.id}
                        disabled={soldOut}
                        onChange={() => setVariantId(v.id)}
                      />
                      {v.name}
                    </span>
                    {soldOut ? (
                      <span className="text-fs-xs font-medium uppercase tracking-wide text-[var(--danger-500)]">
                        {t('outOfStock')}
                      </span>
                    ) : (
                      <span className="font-mono tabular-nums text-fs-sm">₪{v.price.toFixed(2)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {modifierGroups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            {group.label && (
              <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
                {group.label}
              </span>
            )}
            <div className="flex flex-col gap-1.5">
              {group.modifiers.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-[var(--s-3)] py-2 cursor-pointer hover:border-[var(--fg-subtle)]"
                >
                  <span className="flex items-center gap-2 text-fs-sm">
                    <input
                      type="checkbox"
                      checked={checkedMods.has(m.id)}
                      onChange={() => toggleMod(m.id)}
                    />
                    {m.name}
                  </span>
                  {m.price_delta ? (
                    <span className="font-mono tabular-nums text-fs-sm text-[var(--fg-muted)]">
                      {m.price_delta > 0 ? '+' : ''}₪{m.price_delta.toFixed(2)}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>
        ))}

        <Field label={t('quantity')}>
          <NumberInput
            value={quantity}
            onChange={(n) => setQuantity(Math.max(1, Math.round(n)))}
            integer
            min={1}
            className="h-9 w-28 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-sm"
          />
        </Field>

        <Field label={t('itemNotes')}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('itemNotesPlaceholder')}
          />
        </Field>
      </div>
    </Drawer>
  );
}
