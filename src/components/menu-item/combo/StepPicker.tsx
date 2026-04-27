'use client';

// Inline 2-column composer for picking items + categories into a step.
// Replaces the old `comboModalOpen` modal-on-modal entirely. Anchored
// inside the StepCard so the operator never loses the context of which
// step they're editing.
//
// Left column = catalog (search + filter + grouped item list with inline
// variant chips). Right column = selected panel + step rules.

import { useMemo, useState } from 'react';
import { Search, X, Check, Plus } from 'lucide-react';
import type { MenuCategory, MenuItem } from '@/lib/api';
import { Button, Chip, InputGroup, Kbd, Select } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { ComboStepDraft, ComboStepDraftItem, ComboOptionView } from './types';
import { buildOptions, getSourceVariants, toDraftItems, promoteDefaultOption } from './types';
import StepRulesPanel from './StepRulesPanel';

interface Props {
  step: ComboStepDraft;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  onCommit: (next: ComboStepDraft) => void;
  onCancel: () => void;
  /** Optional callout — non-null when the step's host card wants to show the
   *  "current step name" inline above the picker. */
  stepNumber?: number;
}

export default function StepPicker({ step, categories, itemsById, onCommit, onCancel, stepNumber }: Props) {
  const { t } = useI18n();
  const [draftItems, setDraftItems] = useState<ComboStepDraftItem[]>(step.items);
  const [name, setName] = useState(step.name);
  const [minPicks, setMinPicks] = useState(step.min_picks);
  const [maxPicks, setMaxPicks] = useState(step.max_picks);
  const [search, setSearch] = useState('');
  // Single source of truth: `null` means "all categories". Chips and the
  // dropdown are two affordances bound to the same state — toggling one
  // updates the other. (Earlier I had two separate filters that AND'd
  // together, which is wrong: selecting "Tout" with a category in the
  // dropdown silently kept the dropdown's filter on.)
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);

  const allItems = useMemo(
    () => categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name, category_id: c.id }))),
    [categories],
  );

  const filteredItems = useMemo(() => {
    return allItems.filter((it) => {
      if (categoryFilter !== null && it.category_id !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!it.name.toLowerCase().includes(q) && !it.category_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allItems, search, categoryFilter]);

  // Group filtered items by category for the catalog list.
  const grouped = useMemo(() => {
    const map = new Map<number, { name: string; items: typeof filteredItems }>();
    for (const it of filteredItems) {
      const existing = map.get(it.category_id);
      if (existing) existing.items.push(it);
      else map.set(it.category_id, { name: it.category_name, items: [it] });
    }
    return Array.from(map.entries()).map(([catId, v]) => ({ catId, ...v }));
  }, [filteredItems]);

  const includedItemIds = useMemo(() => new Set(draftItems.map((d) => d.menu_item_id)), [draftItems]);

  const selectedOptions: ComboOptionView[] = useMemo(
    () => buildOptions(draftItems, itemsById),
    [draftItems, itemsById],
  );

  // Per-variant inclusion lookup: menu_item_id → Set<variantId>.
  const includedVariantsByItem = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const d of draftItems) {
      if (d.variant_id == null) continue;
      const set = m.get(d.menu_item_id) ?? new Set<number>();
      set.add(d.variant_id);
      m.set(d.menu_item_id, set);
    }
    return m;
  }, [draftItems]);

  /** Tri-state inclusion of a source item:
   *    'empty'   — no rows for it
   *    'partial' — some variants included (variant items only)
   *    'full'    — variant-less item included, OR all variants included */
  type ParentState = 'empty' | 'partial' | 'full';
  const parentStateFor = (src: MenuItem): ParentState => {
    const sourceVariants = getSourceVariants(src);
    if (sourceVariants.length === 0) {
      return includedItemIds.has(src.id) ? 'full' : 'empty';
    }
    const included = includedVariantsByItem.get(src.id);
    if (!included || included.size === 0) return 'empty';
    if (included.size === sourceVariants.length) return 'full';
    return 'partial';
  };

  const toggleItem = (sourceItem: MenuItem) => {
    const sourceVariants = getSourceVariants(sourceItem);
    const state = parentStateFor(sourceItem);

    // 'full' → clear (remove all rows for this menu_item_id).
    if (state === 'full') {
      setDraftItems((prev) => prev.filter((d) => d.menu_item_id !== sourceItem.id));
      return;
    }

    if (sourceVariants.length === 0) {
      // Variant-less item — single row at zero upcharge.
      setDraftItems((prev) => [
        ...prev,
        {
          menu_item_id: sourceItem.id,
          price_delta: 0,
          item_name: sourceItem.name,
          pick_key: `item:${sourceItem.id}`,
        },
      ]);
      return;
    }

    // Variant item: 'empty' or 'partial' → fill to 'full' (add the missing
    // variants without disturbing those already included).
    const alreadyIncluded = includedVariantsByItem.get(sourceItem.id) ?? new Set<number>();
    const additions = sourceVariants
      .filter((sv) => !alreadyIncluded.has(sv.id))
      .map((sv) => ({
        menu_item_id: sourceItem.id,
        variant_id: sv.id,
        price_delta: 0,
        item_name: `${sourceItem.name} — ${sv.name}`,
        pick_key: `variant:${sourceItem.id}:${sv.id}`,
      }));
    if (additions.length === 0) return;
    setDraftItems((prev) => [...prev, ...additions]);
  };

  /** Toggle a single variant of a source item independently of its siblings.
   *  Lets the operator pick exactly which variants to include without leaving
   *  the picker. */
  const toggleVariantInPicker = (sourceItem: MenuItem, variantId: number, variantName: string) => {
    const exists = (includedVariantsByItem.get(sourceItem.id) ?? new Set()).has(variantId);
    if (exists) {
      setDraftItems((prev) =>
        prev.filter((d) => !(d.menu_item_id === sourceItem.id && d.variant_id === variantId)),
      );
      return;
    }
    setDraftItems((prev) => [
      ...prev,
      {
        menu_item_id: sourceItem.id,
        variant_id: variantId,
        price_delta: 0,
        item_name: `${sourceItem.name} — ${variantName}`,
        pick_key: `variant:${sourceItem.id}:${variantId}`,
      },
    ]);
  };

  const addAllInCategory = (catId: number) => {
    const sourceItems = (categories.find((c) => c.id === catId)?.items ?? []) as MenuItem[];
    const additions: ComboStepDraftItem[] = [];
    for (const src of sourceItems) {
      if (includedItemIds.has(src.id)) continue;
      const sourceVariants = getSourceVariants(src);
      if (sourceVariants.length === 0) {
        additions.push({
          menu_item_id: src.id,
          price_delta: 0,
          item_name: src.name,
          pick_key: `item:${src.id}`,
        });
      } else {
        for (const sv of sourceVariants) {
          additions.push({
            menu_item_id: src.id,
            variant_id: sv.id,
            price_delta: 0,
            item_name: `${src.name} — ${sv.name}`,
            pick_key: `variant:${src.id}:${sv.id}`,
          });
        }
      }
    }
    if (additions.length === 0) return;
    setDraftItems((prev) => [...prev, ...additions]);
  };

  const removeOption = (menuItemId: number) => {
    setDraftItems((prev) => prev.filter((d) => d.menu_item_id !== menuItemId));
  };

  const promoteToDefault = (menuItemId: number) => {
    // "Default" within a step is the first option (by position). Reorder
    // so the picked option is first; persist on commit via toDraftItems().
    setDraftItems((prev) => {
      const inFirst = prev.filter((d) => d.menu_item_id === menuItemId);
      const rest = prev.filter((d) => d.menu_item_id !== menuItemId);
      return [...inFirst, ...rest];
    });
  };

  const handleCommit = () => {
    // Re-promote default option ordering before committing — keeps the first
    // option of the step as the customer-default downstream.
    const opts = buildOptions(draftItems, itemsById);
    promoteDefaultOption(opts);
    onCommit({
      key: step.key,
      name,
      min_picks: minPicks,
      max_picks: maxPicks,
      items: toDraftItems(opts),
    });
  };

  return (
    <div
      className="rounded-r-lg overflow-hidden relative"
      style={{
        border: '1px solid var(--brand-500)',
        // box-shadow renders outside the border and is unaffected by
        // `overflow: hidden`, so the brand-tinted glow stays visible while
        // the inner panels' backgrounds get clipped at the rounded corners.
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--brand-500) 15%, transparent)',
      }}
    >
      {/* Brand accent bar */}
      <div
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--brand-500)' }}
        aria-hidden
      />

      {/* Header */}
      <div
        className="flex items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]"
        style={{ background: 'color-mix(in oklab, var(--brand-500) 5%, var(--surface))' }}
      >
        {stepNumber != null && (
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-fs-sm shrink-0"
            style={{ background: 'var(--brand-500)' }}
          >
            {stepNumber}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('composeStepDefaultName').replace('{n}', String(stepNumber ?? ''))}
            className="w-full bg-transparent border-none outline-none text-fs-md font-semibold text-[var(--fg)] focus:underline focus:underline-offset-4 decoration-[var(--brand-500)]"
          />
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
            {t('pickerSelectedItems').replace('{n}', String(selectedOptions.length))}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t('pickerCancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={handleCommit}>
          <Check className="w-3.5 h-3.5" /> {t('pickerDone')}
        </Button>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px]">
        {/* Left — catalog */}
        <div className="p-[var(--s-4)] border-b md:border-b-0 md:border-e border-[var(--line)] min-w-0">
          <div className="flex flex-col sm:flex-row gap-[var(--s-2)] mb-[var(--s-3)]">
            <InputGroup
              className="flex-1"
              leading={<Search />}
              inputProps={{
                value: search,
                onChange: (e) => setSearch(e.target.value),
                placeholder: t('pickerSearch'),
              }}
              trailing={<Kbd>⌘K</Kbd>}
            />
            <Select
              value={categoryFilter ?? ''}
              onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
              className="sm:w-52 shrink-0"
            >
              <option value="">{t('pickerAllCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          {/* Quick filter chips — bound to the same `categoryFilter` state as
              the dropdown above, so toggling either one keeps both in sync. */}
          <div className="flex flex-wrap items-center gap-[var(--s-2)] mb-[var(--s-3)]">
            <Chip
              active={categoryFilter === null}
              onClick={() => setCategoryFilter(null)}
            >
              {t('pickerFilterAll')}
            </Chip>
            {categories.slice(0, 4).map((c) => (
              <Chip
                key={c.id}
                active={categoryFilter === c.id}
                onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>

          {/* Grouped catalog list */}
          {grouped.length === 0 && (
            <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-6)] text-center">
              {t('pickerNoResults')}
            </div>
          )}
          <div className="flex flex-col gap-[var(--s-3)]">
            {grouped.map((group) => (
              <div key={group.catId} className="rounded-r-md border border-[var(--line)] overflow-hidden">
                <div className="flex items-center justify-between px-[var(--s-3)] py-[var(--s-2)] bg-[var(--surface-2)] border-b border-[var(--line)]">
                  <span className="text-fs-xs font-bold uppercase tracking-[.06em] text-[var(--fg)]">
                    {group.name}
                    <span className="text-[var(--fg-subtle)] font-normal ms-2">· {group.items.length}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => addAllInCategory(group.catId)}
                    className="inline-flex items-center gap-1 text-fs-xs font-medium text-[var(--brand-500)] hover:underline"
                  >
                    <Plus className="w-3 h-3" /> {t('pickerCategoryAddAll')}
                  </button>
                </div>
                <div>
                  {group.items.map((src) => {
                    const sourceVariants = getSourceVariants(src);
                    const includedVariantIds = includedVariantsByItem.get(src.id) ?? new Set<number>();
                    const state = parentStateFor(src);
                    return (
                      <CatalogRow
                        key={src.id}
                        name={src.name}
                        price={src.price}
                        variants={sourceVariants.map((v) => ({
                          id: v.id,
                          name: v.name,
                          price: v.price,
                          included: includedVariantIds.has(v.id),
                        }))}
                        parentState={state}
                        onToggleParent={() => toggleItem(src)}
                        onToggleVariant={(variantId, variantName) =>
                          toggleVariantInPicker(src, variantId, variantName)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — selected panel + step rules */}
        <div className="p-[var(--s-4)] bg-[var(--surface-2)]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)]">
              {t('pickerSelected')}
            </div>
            {selectedOptions.length > 0 && (
              <button
                type="button"
                onClick={() => setDraftItems([])}
                className="text-fs-xs text-[var(--fg-muted)] hover:text-[var(--fg)] hover:underline"
              >
                {t('pickerClearAll')}
              </button>
            )}
          </div>
          <div className="text-fs-sm font-semibold mb-[var(--s-3)]">
            {t('pickerSelectedItems').replace('{n}', String(selectedOptions.length))}
          </div>

          {/* Step rules mini-card — same component the StepCard "Règles"
              popover uses, so the two surfaces can't drift. */}
          <div className="mb-[var(--s-3)]">
            <StepRulesPanel
              minPicks={minPicks}
              maxPicks={maxPicks}
              onChange={({ minPicks: m, maxPicks: M }) => {
                setMinPicks(m);
                setMaxPicks(M);
              }}
            />
          </div>

          {/* Selected list */}
          <div className="flex flex-col gap-[var(--s-2)]">
            {selectedOptions.map((opt) => (
              <SelectedRow
                key={opt.key}
                name={opt.itemName}
                imageUrl={opt.imageUrl}
                isDefault={opt.isDefault}
                onRemove={() => removeOption(opt.menuItemId)}
                onSetDefault={() => promoteToDefault(opt.menuItemId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Local row components ─────────────────────────────────────────────────

interface CatalogVariantInfo {
  id: number;
  name: string;
  price: number;
  included: boolean;
}

function CatalogRow({
  name, price, variants, parentState, onToggleParent, onToggleVariant,
}: {
  name: string;
  price: number;
  variants: CatalogVariantInfo[];
  parentState: 'empty' | 'partial' | 'full';
  onToggleParent: () => void;
  onToggleVariant: (variantId: number, variantName: string) => void;
}) {
  const hasVariants = variants.length > 1;
  const variantPrices = variants.map((v) => v.price);
  const priceLabel = hasVariants
    ? `₪${Math.min(...variantPrices).toFixed(0)} – ₪${Math.max(...variantPrices).toFixed(0)}`
    : `₪${(variantPrices[0] ?? price).toFixed(2)}`;

  // Row is a div (not a button) so it can host nested interactive chips.
  // Clicking the parent area (checkbox + name + price) triggers onToggleParent;
  // chips have their own onClick + stopPropagation.
  return (
    <div
      className={`flex items-start gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] border-t border-[var(--line)] first:border-t-0 transition-colors ${
        parentState !== 'empty'
          ? 'bg-[color-mix(in_oklab,var(--brand-500)_6%,transparent)]'
          : 'hover:bg-[var(--surface-2)]'
      }`}
    >
      {/* Parent click target — checkbox + name + price */}
      <button
        type="button"
        onClick={onToggleParent}
        className="flex items-start gap-[var(--s-3)] flex-1 min-w-0 text-start"
        aria-pressed={parentState === 'full'}
        aria-label={name}
      >
        <ParentCheckbox state={parentState} />
        <div className="flex-1 min-w-0">
          <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</div>
        </div>
        <span className="text-fs-sm text-[var(--fg-muted)] tabular-nums shrink-0">{priceLabel}</span>
      </button>

      {/* Variant chips — independent click targets. Rendered below the name
          on a new flex row to avoid getting clipped by parent's flex gap. */}
      {hasVariants && (
        <div
          className="basis-full flex flex-wrap gap-1 ps-[calc(18px+var(--s-3))]"
          // The ps-[...] hangs the chips under the name (past the checkbox column).
        >
          {variants.slice(0, 6).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVariant(v.id, v.name);
              }}
              aria-pressed={v.included}
              className={`inline-flex items-center h-[20px] px-1.5 rounded-r-sm text-[10px] font-medium transition-colors ${
                v.included
                  ? 'bg-[var(--brand-500)] text-white border border-[var(--brand-500)]'
                  : 'bg-[var(--surface)] text-[var(--fg-muted)] border border-[var(--line-strong)] hover:border-[var(--fg-subtle)] hover:text-[var(--fg)]'
              }`}
            >
              {v.name}
              {v.price != null ? ` ₪${v.price.toFixed(0)}` : ''}
            </button>
          ))}
          {variants.length > 6 && (
            <span className="text-[10px] text-[var(--fg-subtle)] self-center">+{variants.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Tri-state checkbox: empty / dash (partial) / check (full). Pure visual —
 *  the parent click target handles the toggle. */
function ParentCheckbox({ state }: { state: 'empty' | 'partial' | 'full' }) {
  const filled = state !== 'empty';
  return (
    <div
      className={`w-[18px] h-[18px] rounded-r-xs flex items-center justify-center shrink-0 mt-0.5 ${
        filled
          ? 'bg-[var(--brand-500)] border border-[var(--brand-500)] text-white'
          : 'bg-[var(--surface)] border border-[var(--line-strong)]'
      }`}
      aria-hidden
    >
      {state === 'full' && <Check className="w-3 h-3" strokeWidth={3} />}
      {state === 'partial' && <span className="block w-2 h-0.5 bg-white" />}
    </div>
  );
}

function SelectedRow({
  name, imageUrl, isDefault, onRemove, onSetDefault,
}: {
  name: string;
  imageUrl?: string;
  isDefault: boolean;
  onRemove: () => void;
  onSetDefault: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md">
      <Thumb url={imageUrl} />
      <div className="flex-1 min-w-0">
        <div className="text-fs-sm font-medium truncate">{name}</div>
        {isDefault ? (
          <div className="text-fs-xs text-[var(--info-500)] dark:text-[#60a5fa]">{t('composeDefaultBadge')}</div>
        ) : (
          <button
            type="button"
            onClick={onSetDefault}
            className="text-fs-xs text-[var(--brand-500)] hover:underline"
          >
            {t('composeSetDefault')}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger-500)]"
        aria-label="Remove"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={url} alt="" className="w-7 h-7 rounded-r-sm object-cover bg-[var(--surface-2)]" />;
  }
  return (
    <div
      className="w-7 h-7 rounded-r-sm shrink-0"
      style={{
        background: 'var(--surface-2)',
        backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--fg) 12%, transparent) 0 4px, transparent 4px 8px)',
      }}
      aria-hidden
    />
  );
}
