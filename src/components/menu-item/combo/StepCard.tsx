'use client';

import { SelectionIndicator } from '@/components/ds/Selection';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Menu, MenuItem } from '@/lib/api';
import { comboSizeKey } from '@/lib/combo-size';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
import type { ComboStepDraft, ComboOptionView, VariantView } from './types';
import { buildOptions, toDraftItems, promoteDefaultOption, promoteDefaultVariant, getSourceVariants } from './types';
import type { StepPreview } from './useComboStepPreviews';
import OptionRow from './OptionRow';
import OptionRowWithVariants from './OptionRowWithVariants';

/** True for steps whose options are auto-resolved by the server (group mode)
 *  rather than listed explicitly. */
function isDynamicStep(s: Pick<ComboStepDraft, 'source_type'>): boolean {
  return s.source_type === 'group';
}

/** Flat menu-group list for the group-source dropdown, grouped by menu. */
function groupOptions(menus: Menu[]): { menuId: number; menuName: string; groups: { id: number; name: string }[] }[] {
  return menus.map((m) => ({
    menuId: m.id,
    menuName: m.name,
    groups: (m.groups ?? []).map((g) => ({ id: g.id, name: g.name })),
  })).filter((m) => m.groups.length > 0);
}

/** Item ids that are members of a given menu group, from the loaded menus. */
function groupItemIds(menus: Menu[], groupId: number): Set<number> {
  const ids = new Set<number>();
  for (const m of menus) {
    for (const g of m.groups ?? []) {
      if (g.id === groupId) for (const it of g.items ?? []) ids.add(it.id);
    }
  }
  return ids;
}

/** Human label for a group-sourced step's bound menu group. */
function dynamicSourceName(step: ComboStepDraft, menus: Menu[]): string | null {
  if (step.source_type === 'group' && step.source_group_id != null) {
    for (const m of menus) {
      const g = (m.groups ?? []).find((gr) => gr.id === step.source_group_id);
      if (g) return `${g.name} · ${m.name}`;
    }
    return '…';
  }
  return null;
}

// ── Inline helpers ─────────────────────────────────────────────────────────

function EditableField({
  value, onChange, placeholder, label, variant,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  variant: 'title' | 'description';
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm text-fg-secondary">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`min-h-11 w-full min-w-0 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] placeholder:text-[var(--fg-subtle)] ${variant === 'title' ? 'text-base font-semibold' : 'text-sm'}`}
      />
    </label>
  );
}

function InlineRules({
  minPicks, maxPicks, onChange,
}: {
  minPicks: number;
  maxPicks: number;
  onChange: (next: { minPicks: number; maxPicks: number }) => void;
}) {
  const { t } = useI18n();
  const setMin = (raw: number) => {
    const next = Math.max(0, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks: next, maxPicks: Math.max(next, maxPicks) });
  };
  const setMax = (raw: number) => {
    const next = Math.max(minPicks, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks, maxPicks: next });
  };
  const inputClass = 'min-h-11 w-full rounded-r-sm border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-fs-sm text-[var(--fg)]';
  return (
    <div className="grid max-w-sm grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
        {t('composeStepPickMinimum')}
        <NumberInput integer min={0} value={minPicks} onChange={setMin} className={inputClass} aria-label={t('composeMin')} />
      </label>
      <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
        {t('composeStepPickMaximum')}
        <NumberInput integer min={Math.max(1, minPicks)} value={maxPicks} onChange={setMax} className={inputClass} aria-label={t('composeMax')} />
      </label>
    </div>
  );
}

// Compact one-line summary of a step's rule, for the closed/summary state.
// "Choisir 2 sur 4" / "Toujours ×3" / "Optionnel jusqu'à 2 sur 4". Stays
// readable at a glance without taking on the full InlineRules controls.
function ruleSummary(step: ComboStepDraft, optionsCount: number, t: (k: string) => string): string {
  const min = step.min_picks;
  const max = step.max_picks;
  if (max === 0) return t('composeStepSummaryEmpty');
  if (min === max) {
    if (!isDynamicStep(step) && step.items.length === 1 && step.items[0].force_off_carte !== false && min === 1) {
      return t('composeStepSummaryAll').replace('{n}', String(min));
    }
    return t('composeStepSummaryExact')
      .replace('{n}', String(min))
      .replace('{total}', String(optionsCount));
  }
  if (min === 0) {
    return t('composeStepSummaryUpTo')
      .replace('{max}', String(max))
      .replace('{total}', String(optionsCount));
  }
  return t('composeStepSummaryRange')
    .replace('{min}', String(min))
    .replace('{max}', String(max))
    .replace('{total}', String(optionsCount));
}

// ── Step card ──────────────────────────────────────────────────────────────

interface Props {
  step: ComboStepDraft;
  index: number;
  basePrice: number;
  menus: Menu[];
  itemsById: Map<number, MenuItem>;
  anyCarteItemIds: Set<number>;
  catalog?: ReactNode;
  /** Server-resolved preview for this step (group steps only). */
  preview?: StepPreview;
  isActive: boolean;
  onActivate: () => void;
  onChange: (next: ComboStepDraft) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export default function StepCard({
  step, index, basePrice, menus, itemsById, anyCarteItemIds, preview,
  isActive, catalog, onActivate, onChange, onRemove, onMoveUp, onMoveDown,
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [nextSource, setNextSource] = useState<ComboStepDraft['source_type'] | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showItemLimits, setShowItemLimits] = useState(() => !!step.max_per_item || !!step.item_limits?.length);

  const options = useMemo<ComboOptionView[]>(() => {
    const opts = buildOptions(step.items, itemsById);
    promoteDefaultOption(opts);
    for (const o of opts) if (o.hasVariants) promoteDefaultVariant(o.variants);
    return opts;
  }, [step.items, itemsById]);

  // For dynamic steps the authoritative option count is the server resolver's
  // result (preview). Explicit steps count their listed options.
  const dynamic = isDynamicStep(step);
  const dynamicAvailableCount = preview?.items.filter(item =>
    item.availability_state !== 'sold_out' && item.availability_state !== 'hidden'
  ).length ?? 0;
  const previewReady = preview && !preview.loading && !preview.error;
  const requiredGroupEmpty = dynamic && previewReady && dynamicAvailableCount === 0 && step.min_picks > 0;
  const stepName = step.name || t('composeStepDefaultName').replace('{n}', String(index + 1));
  const optionsCount = dynamic ? dynamicAvailableCount : options.length;

  // Distinct items available in this step, for per-item limit overrides.
  // Group steps read the server preview; explicit steps read their own options.
  const perItemChoices = useMemo<{ id: number; name: string }[]>(() => {
    if (dynamic) {
      const seen = new Map<number, string>();
      for (const it of preview?.items ?? []) {
        if (!seen.has(it.menu_item_id)) {
          seen.set(it.menu_item_id, itemsById.get(it.menu_item_id)?.name ?? it.name);
        }
      }
      return Array.from(seen, ([id, name]) => ({ id, name }));
    }
    return options.map((o) => ({ id: o.menuItemId, name: o.itemName }));
  }, [dynamic, preview, options, itemsById]);

  // ── Mutation helpers ─────────────────────────────────────────────────

  const setMaxPerItem = (v: number) => onChange({ ...step, max_per_item: v > 0 ? v : 0 });
  const addItemLimit = (menuItemId: number) => {
    if (!menuItemId) return;
    const cur = step.item_limits ?? [];
    if (cur.some((l) => l.menu_item_id === menuItemId)) return;
    const name = perItemChoices.find((c) => c.id === menuItemId)?.name;
    onChange({ ...step, item_limits: [...cur, { menu_item_id: menuItemId, max_qty: 1, item_name: name }] });
  };
  const setItemLimitMax = (menuItemId: number, max: number) =>
    onChange({
      ...step,
      item_limits: (step.item_limits ?? []).map((l) =>
        l.menu_item_id === menuItemId ? { ...l, max_qty: Math.max(0, max) } : l,
      ),
    });
  const removeItemLimit = (menuItemId: number) =>
    onChange({ ...step, item_limits: (step.item_limits ?? []).filter((l) => l.menu_item_id !== menuItemId) });

  const setOptions = (nextOptions: ComboOptionView[]) => {
    onChange({ ...step, items: toDraftItems(nextOptions) });
  };
  const handleOptionUpchargeChange = (menuItemId: number, next: number) => {
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, upcharge: next } : o)));
  };
  const handleSetDefaultOption = (menuItemId: number) => {
    const target = options.find((o) => o.menuItemId === menuItemId);
    if (!target) return;
    const rest = options.filter((o) => o.menuItemId !== menuItemId);
    setOptions([target, ...rest]);
  };
  const handleRemoveOption = (menuItemId: number) => {
    setOptions(options.filter((o) => o.menuItemId !== menuItemId));
  };
  const handleVariantsChange = (menuItemId: number, variants: VariantView[]) => {
    promoteDefaultVariant(variants);
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, variants } : o)));
  };
  const handleForceOffCarteToggle = (menuItemId: number, next: boolean) => {
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, forceOffCarte: next } : o)));
  };

  const changeSource = (sourceType: ComboStepDraft['source_type']) => {
    onChange({
      ...step,
      source_type: sourceType,
      source_group_id: undefined,
      source_variant_label: undefined,
      source_size_id: undefined,
      variant_rules: [],
      items: [],
      item_limits: [],
    });
    setNextSource(null);
    setCatalogOpen(false);
  };

  const requestSource = (sourceType: ComboStepDraft['source_type']) => {
    if (step.source_type === sourceType) return;
    if (step.items.length > 0 || step.source_group_id || step.item_limits?.length) {
      setNextSource(sourceType);
    } else {
      changeSource(sourceType);
    }
  };

  if (!isActive) {
    const sourceName = dynamicSourceName(step, menus);
    return (
      <button
        aria-expanded={false}
        aria-label={stepName}
        type="button"
        onClick={onActivate}
        className="flex min-h-16 w-full items-center gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-start transition-colors hover:bg-[var(--surface-2)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-fs-sm font-semibold text-[var(--fg)]">
          {index + 1}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="break-words text-fs-md font-semibold text-[var(--fg)]">{stepName}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-xs text-[var(--fg-muted)]">
            <span>
              {dynamic
                ? [sourceName, step.source_variant_label].filter(Boolean).join(' · ') || t('composeStepGroupPlaceholder')
                : t('composeStepModeExplicit')}
            </span>
            {dynamic && preview?.error && <span>· {t('composeStepPreviewError')}</span>}
            {dynamic && preview?.loading && <span>· {t('composeStepPreviewLoading')}</span>}
            {requiredGroupEmpty && (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--warning-500)]">
                <AlertTriangle aria-hidden="true" className="size-4" />
                {t('composeStepRequiredEmpty')}
              </span>
            )}
            {!requiredGroupEmpty && (!dynamic || previewReady) && (
              <span>· {optionsCount > 0 ? ruleSummary(step, optionsCount, t) : t('composeStepSummaryItemCount').replace('{n}', '0')}</span>
            )}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-[var(--fg-muted)]" />
      </button>
    );
  }

  return (
    <>
    <section aria-label={stepName}
      className="min-w-0 overflow-hidden rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-1">
        <button
          type="button"
          aria-expanded={true}
          onClick={onActivate}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start text-fs-sm font-semibold text-[var(--fg)]"
        >
          <ChevronUp aria-hidden="true" className="size-4 shrink-0 text-[var(--fg-muted)]" />
          <span className="break-words">{index + 1}. {stepName}</span>
        </button>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" icon onClick={onMoveUp} disabled={!onMoveUp} aria-label={t('composeStepMoveUp')}>
              <ArrowUp aria-hidden="true" className="size-4" />
            </Button>
            <Button type="button" variant="ghost" icon onClick={onMoveDown} disabled={!onMoveDown} aria-label={t('composeStepMoveDown')}>
              <ArrowDown aria-hidden="true" className="size-4" />
            </Button>
            <Button type="button" variant="ghost" icon onClick={onRemove} aria-label={t('composeStepDelete')}>
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-5 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EditableField
            label={t('composeStepFieldName')} value={step.name}
            onChange={(name) => onChange({ ...step, name })}
            placeholder={t('composeStepDefaultName').replace('{n}', String(index + 1))}
            variant="title"
          />
          <EditableField
            label={t('description')} value={step.description ?? ''}
            onChange={(description) => onChange({ ...step, description })}
            placeholder={t('composeStepDescriptionPlaceholder')}
            variant="description"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-fs-sm font-semibold text-[var(--fg)]">{t('composeStepFieldSource')}</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SourceSeg
              active={!dynamic}
              onClick={() => requestSource('explicit')}
              label={t('composeStepModeExplicit')}
              description={t('composeStepModeExplicitHelp')}
            />
            <SourceSeg
              active={dynamic}
              onClick={() => requestSource('group')}
              label={t('composeStepModeGroup')}
              description={t('composeStepModeGroupHelp')}
            />
          </div>
        </div>

        {!dynamic && canEdit && (
          <div className="flex flex-col items-start gap-3">
            <Button type="button" variant="secondary" aria-expanded={catalogOpen} onClick={() => setCatalogOpen(!catalogOpen)}>
              {catalogOpen ? <ChevronUp aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
              {t(catalogOpen ? 'composeCloseCatalog' : 'composeOpenCatalog')}
            </Button>
            {catalogOpen && (
              <div className="w-full min-w-0 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
                {catalog}
              </div>
            )}
          </div>
        )}

        {/* Content — items list (explicit) or the group source panel */}
        {dynamic ? (
          <DynamicModePanel
            step={step}
            menus={menus}
            itemsById={itemsById}
            preview={preview}
            onChange={onChange}
          />
        ) : options.length === 0 ? (
          <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-4)] text-center border border-dashed border-[var(--line)] rounded-r-md">
            {t('composeStepEmptyHint')}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-2)]">
            {options.map((opt) => {
              const comboOnly = !anyCarteItemIds.has(opt.menuItemId);
              return opt.hasVariants ? (
                <OptionRowWithVariants
                  key={opt.key}
                  option={opt}
                  basePrice={basePrice}
                  comboOnly={comboOnly}
                  onChange={(variants) => handleVariantsChange(opt.menuItemId, variants)}
                  onForceOffCarteToggle={(next) => handleForceOffCarteToggle(opt.menuItemId, next)}
                  onRemove={() => handleRemoveOption(opt.menuItemId)}
                />
              ) : (
                <OptionRow
                  key={opt.key}
                  option={opt}
                  comboOnly={comboOnly}
                  onUpchargeChange={(next) => handleOptionUpchargeChange(opt.menuItemId, next)}
                  onForceOffCarteToggle={(next) => handleForceOffCarteToggle(opt.menuItemId, next)}
                  onRemove={() => handleRemoveOption(opt.menuItemId)}
                  onSetDefault={() => handleSetDefaultOption(opt.menuItemId)}
                />
              );
            })}
          </div>
        )}
        {/* Step and per-item limits */}
        <div className="flex flex-col gap-1.5">
          <span className="text-fs-sm font-medium text-[var(--fg-muted)]">
            {t('composeStepFieldRules')}
          </span>
          <InlineRules
            minPicks={step.min_picks}
            maxPicks={step.max_picks}
            onChange={({ minPicks, maxPicks }) =>
              onChange({ ...step, min_picks: minPicks, max_picks: maxPicks })
            }
          />
        </div>

        <details
          open={showItemLimits}
          onToggle={event => setShowItemLimits(event.currentTarget.open)}
          className="rounded-r-md border border-[var(--line)] px-3"
        >
          <summary className="cursor-pointer py-3 text-fs-sm font-medium text-[var(--fg)]">
            {t('composeStepPerItemTitle')}
          </summary>
          <div className="flex flex-col gap-2 pb-3">
            <label className="inline-flex items-center gap-2 self-start">
              <span className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepMaxPerItem')}</span>
              <input
                type="number"
                min={0}
                value={step.max_per_item || ''}
                placeholder="∞"
                onChange={(e) => setMaxPerItem(Math.max(0, Number(e.target.value) || 0))}
                className="min-h-11 w-16 px-2 text-center rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
              />
            </label>
            {(step.item_limits ?? []).length > 0 && (
              <div className="flex flex-col gap-1.5">
                {(step.item_limits ?? []).map((l) => (
                  <div key={l.menu_item_id} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-fs-sm text-[var(--fg)] truncate">
                      {perItemChoices.find((c) => c.id === l.menu_item_id)?.name ?? l.item_name ?? `#${l.menu_item_id}`}
                    </span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${t('composeStepMaxPerItem')} — ${perItemChoices.find(c => c.id === l.menu_item_id)?.name ?? l.item_name ?? l.menu_item_id}`}
                      value={l.max_qty || ''}
                      placeholder="∞"
                      onChange={(e) => setItemLimitMax(l.menu_item_id, Number(e.target.value) || 0)}
                      className="min-h-11 w-16 px-2 text-center rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemLimit(l.menu_item_id)}
                      className="text-fs-sm text-[var(--fg-muted)] hover:text-[var(--danger-500)] px-1"
                      aria-label={t('composeStepRemoveItemLimit')}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {perItemChoices.some((c) => !(step.item_limits ?? []).some((l) => l.menu_item_id === c.id)) && (
              <select aria-label={t('composeStepAddItemLimit')}
                value=""
                onChange={(e) => {
                  addItemLimit(Number(e.target.value));
                  e.currentTarget.value = '';
                }}
                className="min-h-11 px-2 self-start rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg-muted)]"
              >
                <option value="">{t('composeStepAddItemLimit')}</option>
                {perItemChoices
                  .filter((c) => !(step.item_limits ?? []).some((l) => l.menu_item_id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            )}
          </div>
        </details>
      </fieldset>
      {dynamic && preview?.error && <div className="px-4 pb-4"><Button type="button" variant="secondary" size="lg" onClick={preview.retry}>{t('retry')}</Button></div>}
    </section>
    <ConfirmDialog
      open={nextSource !== null}
      onOpenChange={open => { if (!open) setNextSource(null); }}
      title={t(nextSource === 'group' ? 'composeStepModeGroup' : 'composeStepModeExplicit')}
      description={t('composeStepModeSwitchConfirm')}
      confirmLabel={t('confirm')}
      cancelLabel={t('cancel')}
      onConfirm={() => { if (nextSource) changeSource(nextSource); }}
    />
    </>
  );
}

function SourceSeg({ active, onClick, label, description }: {
  active: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex min-h-16 items-start justify-between gap-2 rounded-r-md border px-3 py-2.5 text-start ${
        active ? 'border-[var(--fg)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-fs-sm font-semibold text-[var(--fg)]">{label}</span>
        <span className="text-fs-xs text-[var(--fg-muted)]">{description}</span>
      </span>
      <SelectionIndicator checked={active} />
    </button>
  );
}

// ── Group-source sub-panel ────────────────────────────────────────────────

function DynamicModePanel({
  step,
  menus,
  itemsById,
  preview,
  onChange,
}: {
  step: ComboStepDraft;
  menus: Menu[];
  itemsById: Map<number, MenuItem>;
  preview?: StepPreview;
  onChange: (next: ComboStepDraft) => void;
}) {
  const { t } = useI18n();
  const selectedId = step.source_group_id ?? 0;
  const [showSizeLimits, setShowSizeLimits] = useState(() => !!step.variant_rules?.length);

  // Candidate items for the size-label dropdown: every item in the chosen group
  // (regardless of any current size pin), looked up in the global item library
  // so variant info is available.
  const candidateItems = useMemo(() => {
    if (!selectedId) return [] as MenuItem[];
    return Array.from(groupItemIds(menus, selectedId))
      .map((id) => itemsById.get(id))
      .filter((it): it is MenuItem => !!it && it.is_active);
  }, [selectedId, menus, itemsById]);

  const sizes = useMemo(() => {
    const result = new Map<number, string>();
    for (const item of candidateItems) {
      for (const variant of getSourceVariants(item)) {
        if (variant.sizeId != null) result.set(variant.sizeId, variant.name);
      }
    }
    return Array.from(result, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [candidateItems]);

  const storedLabel = step.source_variant_label?.trim() ?? '';
  const selectedSize = step.source_size_id != null ? String(step.source_size_id) : storedLabel ? 'legacy' : '';
  const selectedAvailable = sizes.some(size => size.id === step.source_size_id);
  const groups = useMemo(() => groupOptions(menus), [menus]);
  const availableNames = preview?.items
    .filter(item => item.availability_state !== 'sold_out' && item.availability_state !== 'hidden')
    .map(item => item.name) ?? [];

  const rulesBySize = new Map((step.variant_rules ?? []).map(rule => [comboSizeKey(rule.size_id, rule.variant_label), rule]));
  const ruleSizes = new Map<string, { id?: number; name: string }>();
  rulesBySize.forEach((rule, key) => ruleSizes.set(key, { id: rule.size_id, name: rule.variant_label }));
  for (const size of sizes) ruleSizes.set(comboSizeKey(size.id, size.name), size);

  const setRule = (key: string, patch: { min?: number; max?: number }) => {
    const rules = Array.from(ruleSizes, ([sizeKey, size]) => ({
      size_id: size.id,
      variant_label: size.name,
      min_picks: (sizeKey === key ? patch.min : undefined) ?? rulesBySize.get(sizeKey)?.min_picks ?? 0,
      max_picks: (sizeKey === key ? patch.max : undefined) ?? rulesBySize.get(sizeKey)?.max_picks ?? 0,
    }));
    onChange({
      ...step,
      variant_rules: rules.some(rule => rule.min_picks > 0 || rule.max_picks > 0) ? rules : [],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <select aria-label={t('composeStepGroupPlaceholder')}
        value={selectedId}
        onChange={event => onChange({ ...step, source_group_id: Number(event.target.value) || undefined })}
        className="min-h-11 px-2 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
      >
        <option value={0}>{t('composeStepGroupPlaceholder')}</option>
        {selectedId > 0 && !groups.some(menu => menu.groups.some(group => group.id === selectedId)) && (
          <option value={selectedId}>{t('composeStepGroupUnavailable')}</option>
        )}
        {groups.map((m) => (
          <optgroup key={m.menuId} label={m.menuName}>
            {m.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} · {m.menuName}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {selectedId > 0 && (sizes.length > 0 || selectedSize || ruleSizes.size > 0) && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepSizeLabel')}</span>
            <select
              value={selectedSize}
              onChange={event => {
                if (event.target.value === 'legacy') return;
                const size = sizes.find(choice => String(choice.id) === event.target.value);
                onChange({ ...step, source_size_id: size?.id, source_variant_label: size?.name, variant_rules: [] });
              }}
              className="min-h-11 px-2 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
            >
              <option value="">{t('composeStepSizeAll')}</option>
              {selectedSize && !selectedAvailable && <option value={selectedSize}>{storedLabel || t('composeStepSizeEmptyHint')}</option>}
              {sizes.map(size => (
                <option key={size.id} value={size.id}>{size.name}</option>
              ))}
            </select>
          </label>

          {!selectedSize && ruleSizes.size > 0 && (
            <details
              open={showSizeLimits}
              onToggle={event => setShowSizeLimits(event.currentTarget.open)}
              className="rounded-r-md border border-[var(--line)] px-3"
            >
              <summary className="cursor-pointer py-3 text-fs-sm font-medium text-[var(--fg)]">
                {t('composeStepSizeRulesLabel')}
              </summary>
              <div className="flex flex-col gap-2 pb-3">
                <p className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepSizeRulesHint')}</p>
                <div className="grid grid-cols-[1fr_4rem_4rem] gap-2 text-fs-xs text-[var(--fg-muted)]">
                  <span>{t('composeStepSizeCol')}</span>
                  <span className="text-center">{t('composeStepMinCol')}</span>
                  <span className="text-center">{t('composeStepMaxCol')}</span>
                </div>
                {Array.from(ruleSizes, ([key, { name }]) => {
                  const rule = rulesBySize.get(key);
                  return (
                    <div key={key} className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2">
                      <span className="text-fs-sm text-[var(--fg)]">{name}</span>
                      <NumberInput integer min={0}
                        aria-label={`${t('composeMin')} — ${name}`}
                        value={rule?.min_picks || null}
                        placeholder="0"
                        onChange={value => setRule(key, { min: Math.max(0, value || 0) })}
                        className="min-h-11 w-16 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] px-2 text-center text-fs-sm"
                      />
                      <NumberInput integer min={0}
                        aria-label={`${t('composeMax')} — ${name}`}
                        value={rule?.max_picks || null}
                        placeholder="∞"
                        onChange={value => setRule(key, { max: Math.max(0, value || 0) })}
                        className="min-h-11 w-16 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] px-2 text-center text-fs-sm"
                      />
                    </div>
                  );
                })}
                {rulesBySize.size > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...step, variant_rules: [] })}
                    className="self-start text-fs-xs text-[var(--fg-muted)] underline hover:text-[var(--fg)]"
                  >
                    {t('composeStepSizeRulesClear')}
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {selectedId > 0 && preview?.loading && (
        <div className="inline-flex items-center gap-1.5 text-fs-xs text-[var(--fg-muted)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('composeStepPreviewLoading') || 'Calcul des articles disponibles…'}
        </div>
      )}

      {selectedId > 0 && !preview?.loading && preview?.error && (
        <div className="space-y-2 text-sm text-[var(--danger-500)]" role="alert">
          <p>{t('composeStepPreviewError')}</p>
        </div>
      )}

      {selectedId > 0 && preview && !preview.loading && !preview.error && availableNames.length === 0 && (
        <CategoryZone
          tone="warn"
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          title={t(step.min_picks > 0 ? 'composeStepRequiredEmpty' : 'composeStepCategoryEmpty')}
          subtitle={t(selectedSize ? 'composeStepSizeEmptyHint' : 'composeStepGroupEmptyHint')}
          items={[]}
        />
      )}

      {selectedId > 0 && preview && !preview.loading && !preview.error && availableNames.length > 0 && (
        <CategoryZone
          tone="ok"
          icon={<Check className="w-3.5 h-3.5" />}
          title={t(availableNames.length === 1 ? 'composeStepOneChoiceAvailable' : 'composeStepCategoryAvailable').replace('{n}', String(availableNames.length))}
          items={availableNames}
        />
      )}
    </div>
  );
}

function CategoryZone({
  tone, icon, title, subtitle, items,
}: {
  tone: 'ok' | 'warn';
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  items: string[];
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const PEEK = 5;
  const shown = expanded ? items : items.slice(0, PEEK);
  const hidden = items.length - shown.length;
  const accent = tone === 'ok' ? 'var(--success-500)' : 'var(--warning-500)';

  return (
    <div
      className="rounded-r-md px-[var(--s-3)] py-[var(--s-2)] border"
      style={{
        background: `color-mix(in oklab, ${accent} 8%, transparent)`,
        borderColor: `color-mix(in oklab, ${accent} 26%, transparent)`,
        color: accent,
      }}
    >
      <div className="flex items-center gap-1.5 text-fs-xs font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {subtitle && (
        <div className="text-fs-xs opacity-80 mt-0.5 ms-5">{subtitle}</div>
      )}
      {items.length > 0 && (
        <div className="text-fs-xs text-[var(--fg-muted)] mt-1 ms-5 leading-relaxed">
          {shown.join(', ')}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ms-1.5 underline hover:no-underline"
              style={{ color: accent }}
            >
              {t('composeStepCategoryShowMore').replace('{n}', String(hidden))}
            </button>
          )}
          {expanded && items.length > PEEK && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ms-1.5 underline hover:no-underline"
              style={{ color: accent }}
            >
              {t('composeStepCategoryShowLess')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
