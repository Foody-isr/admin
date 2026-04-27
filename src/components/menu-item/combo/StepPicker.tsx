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

  const toggleItem = (sourceItem: MenuItem) => {
    const sourceVariants = getSourceVariants(sourceItem);
    const alreadyIncluded = includedItemIds.has(sourceItem.id);
    if (alreadyIncluded) {
      // Remove all rows for this menu_item_id.
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
    } else {
      // Variant item — include all variants at zero upcharge by default.
      // Operator refines per-variant pricing in the step body afterwards.
      setDraftItems((prev) => [
        ...prev,
        ...sourceVariants.map((sv) => ({
          menu_item_id: sourceItem.id,
          variant_id: sv.id,
          price_delta: 0,
          item_name: `${sourceItem.name} — ${sv.name}`,
          pick_key: `variant:${sourceItem.id}:${sv.id}`,
        })),
      ]);
    }
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
      className="rounded-r-lg overflow-visible relative"
      style={{
        border: '1px solid var(--brand-500)',
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--brand-500) 15%, transparent)',
      }}
    >
      {/* Brand accent bar */}
      <div
        className="absolute start-0 top-0 bottom-0 w-[3px] rounded-s-r-lg"
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
                    const checked = includedItemIds.has(src.id);
                    const sourceVariants = getSourceVariants(src);
                    return (
                      <CatalogRow
                        key={src.id}
                        name={src.name}
                        price={src.price}
                        variantNames={sourceVariants.map((v) => v.name)}
                        variantPrices={sourceVariants.map((v) => v.price)}
                        checked={checked}
                        onToggle={() => toggleItem(src)}
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

          {/* Step rules mini-card */}
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-[var(--s-3)] mb-[var(--s-3)]">
            <div className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)] mb-1.5">
              {t('pickerStepRules')}
            </div>
            <div className="flex items-center justify-between mb-[var(--s-2)]">
              <span className="text-fs-sm">{t('composeRequired')}</span>
              <button
                type="button"
                onClick={() => setMinPicks(minPicks === 0 ? 1 : 0)}
                aria-pressed={minPicks > 0}
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  minPicks > 0 ? 'bg-[var(--success-500)]' : 'bg-[var(--surface-3)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                    minPicks > 0 ? 'right-0.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-[var(--s-2)]">
              <span className="text-fs-sm">{t('composeMin')} — {t('composeMax')}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={minPicks}
                  onChange={(e) => setMinPicks(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-12 h-7 px-1.5 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)]"
                />
                <span className="text-[var(--fg-muted)]">–</span>
                <input
                  type="number"
                  min={Math.max(1, minPicks)}
                  value={maxPicks}
                  onChange={(e) => setMaxPicks(Math.max(minPicks, parseInt(e.target.value) || 0))}
                  className="w-12 h-7 px-1.5 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)]"
                />
              </div>
            </div>
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

function CatalogRow({
  name, price, variantNames, variantPrices, checked, onToggle,
}: {
  name: string;
  price: number;
  variantNames: string[];
  variantPrices: number[];
  checked: boolean;
  onToggle: () => void;
}) {
  const priceLabel = variantPrices.length > 1
    ? `₪${Math.min(...variantPrices).toFixed(0)} – ₪${Math.max(...variantPrices).toFixed(0)}`
    : `₪${(variantPrices[0] ?? price).toFixed(2)}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] border-t border-[var(--line)] first:border-t-0 text-start transition-colors ${
        checked
          ? 'bg-[color-mix(in_oklab,var(--brand-500)_6%,transparent)]'
          : 'hover:bg-[var(--surface-2)]'
      }`}
    >
      <div
        className={`w-[18px] h-[18px] rounded-r-xs flex items-center justify-center shrink-0 ${
          checked
            ? 'bg-[var(--brand-500)] border border-[var(--brand-500)] text-white'
            : 'bg-[var(--surface)] border border-[var(--line-strong)]'
        }`}
        aria-hidden
      >
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{name}</div>
        {variantNames.length > 1 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {variantNames.slice(0, 4).map((v, i) => (
              <span
                key={v}
                className="inline-flex items-center h-[18px] px-1.5 rounded-r-sm text-[10px] bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]"
              >
                {v}{variantPrices[i] != null ? ` ₪${variantPrices[i].toFixed(0)}` : ''}
              </span>
            ))}
            {variantNames.length > 4 && (
              <span className="text-[10px] text-[var(--fg-subtle)]">+{variantNames.length - 4}</span>
            )}
          </div>
        )}
      </div>
      <span className="text-fs-sm text-[var(--fg-muted)] tabular-nums">{priceLabel}</span>
    </button>
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
