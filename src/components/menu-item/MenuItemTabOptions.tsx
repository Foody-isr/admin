'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type {
  MenuItem,
  ModifierSet,
  ModifierSetItemOverrideRow,
  ModifierSetItemOverridesInput,
  OptionSet,
  ItemOptionOverride,
} from '@/lib/api';
import { Badge } from '@/components/ds';

// Aligned to design-reference/design/screens/item-editor.jsx:318-355 (ModsTab).
// Section head with 3px brand accent; cards use --surface + --line; actions are
// ghost-style "Modifier / Détacher" buttons on the right.

interface Props {
  item: MenuItem;
  attachedModifierSets: ModifierSet[];
  /** Reference list of ALL modifier sets in the restaurant — used to look up
   *  the unmodified set defaults so the override editor can show "Inherit (N)"
   *  next to each override field. */
  allModifierSets?: ModifierSet[];
  attachedOptionSets: OptionSet[];
  itemOptionOverrides: ItemOptionOverride[];
  onAddModifierSet: () => void;
  onDetachModifierSet: (id: number) => void;
  onSaveModifierSetOverrides?: (setId: number, input: ModifierSetItemOverridesInput) => Promise<void> | void;
  onDeleteModifier: (id: number) => void;
  onAddVariantGroup: () => void;
  onEditVariantGroup: (id: number) => void;
  onDeleteVariantGroup: (id: number) => void;
  onAddOptionSet: () => void;
  onEditOptionSet: (id: number) => void;
  onDetachOptionSet: (id: number) => void;
  /** When true, suppress the Variants section. Callers rendering an inline
   *  VariantsEditor handle variants themselves and only want this tab to
   *  show modifiers. */
  hideVariantsSection?: boolean;
}

export default function MenuItemTabOptions({
  item,
  attachedModifierSets,
  allModifierSets,
  attachedOptionSets,
  itemOptionOverrides,
  onAddModifierSet,
  onDetachModifierSet,
  onSaveModifierSetOverrides,
  onDeleteModifier,
  onAddVariantGroup,
  onEditVariantGroup,
  onDeleteVariantGroup,
  onAddOptionSet,
  onEditOptionSet,
  onDetachOptionSet,
  hideVariantsSection = false,
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const modifiers = item.modifiers ?? [];
  const variantGroups = item.variant_groups ?? [];
  const modSetOverrideRows: ModifierSetItemOverrideRow[] = item.modifier_set_overrides ?? [];
  const modSetOverrideFor = (setId: number): ModifierSetItemOverrideRow | undefined =>
    modSetOverrideRows.find((r) => r.modifier_set_id === setId);
  const modSetDefaults = (setId: number): ModifierSet | undefined =>
    (allModifierSets ?? []).find((s) => s.id === setId);

  const overrideFor = (optionId: number): ItemOptionOverride | undefined =>
    itemOptionOverrides.find((ov) => ov.option_id === optionId);

  const formatValueSubtitle = (sku?: string | null): string | null => {
    if (sku && sku.trim()) return sku.trim();
    return null;
  };

  return (
    <div className="max-w-4xl">
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">
          {t('modifiers') || 'Modificateurs'}
        </h3>
      </div>

      {/* Modificateurs */}
      <div className="mb-[var(--s-6)]">
        <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-3)]">
          <p className="text-fs-xs text-[var(--fg-muted)]">
            {t('modifiersDesc') ||
              'Options ajoutées à la commande (sans coriandre, sauce à part…).'}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={onAddModifierSet}
              className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('add') || 'Ajouter'}
            </button>
          )}
        </div>

        {attachedModifierSets.length > 0 && (
          <div className="flex flex-col gap-[var(--s-2)] mb-[var(--s-3)]">
            {attachedModifierSets.map((set) => (
              <ModifierSetCard
                key={set.id}
                set={set}
                overrideRow={modSetOverrideFor(set.id)}
                setDefaults={modSetDefaults(set.id)}
                canEditOverrides={!!onSaveModifierSetOverrides}
                onSaveOverrides={
                  onSaveModifierSetOverrides
                    ? (input) => onSaveModifierSetOverrides(set.id, input)
                    : undefined
                }
                onDetach={() => onDetachModifierSet(set.id)}
              />
            ))}
          </div>
        )}

        {modifiers.length > 0 && (
          <div className="flex flex-col gap-[var(--s-2)]">
            {modifiers.map((mod) => (
              <div
                key={mod.id}
                className="bg-[var(--surface)] rounded-r-md border border-[var(--line)] shadow-1 p-[var(--s-3)_var(--s-4)] flex items-center gap-[var(--s-3)]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-fs-sm font-medium text-[var(--fg)]">{mod.name}</span>
                  <span className="text-fs-xs text-[var(--fg-muted)] ms-[var(--s-2)]">
                    ({mod.action}){mod.category ? ` · ${mod.category}` : ''}
                  </span>
                </div>
                {mod.price_delta !== 0 && (
                  <span className="font-mono tabular-nums text-fs-sm text-[var(--fg)]">
                    {mod.price_delta > 0 ? '+' : ''}
                    ₪{mod.price_delta.toFixed(2)}
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onDeleteModifier(mod.id)}
                    className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                  >
                    {t('delete') || 'Supprimer'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {attachedModifierSets.length === 0 && modifiers.length === 0 && (
          <p className="text-fs-xs text-[var(--fg-subtle)] italic">
            {t('noModifiersForItem') || 'Aucun modificateur pour cet article.'}
          </p>
        )}
      </div>

      {/* Variantes */}
      {!hideVariantsSection && (
      <div>
        <div className="flex items-center justify-between mb-[var(--s-3)]">
          <div>
            <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
              {t('variants') || 'Variantes'}
            </h4>
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('variantsDesc') ||
                'Tailles ou options liées (Normal, Grand…). Le prix du variant remplace le prix de base.'}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onAddVariantGroup}
              className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('add') || 'Ajouter'}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-[var(--s-4)]">
          {/* Legacy variant groups */}
          {variantGroups.map((group) => (
            <div
              key={group.id}
              className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] shadow-1 p-[var(--s-4)]"
            >
              <div className="flex items-center justify-between mb-[var(--s-3)]">
                <div>
                  <div className="text-fs-sm font-semibold text-[var(--fg)]">{group.title}</div>
                  <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
                    {(group.variants ?? []).length} {t('options') || 'options'}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-[var(--s-2)]">
                    <button
                      type="button"
                      onClick={() => onEditVariantGroup(group.id)}
                      className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors"
                    >
                      {t('edit') || 'Modifier'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteVariantGroup(group.id)}
                      className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                    >
                      {t('delete') || 'Supprimer'}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-[var(--s-2)]">
                {(group.variants ?? []).map((v) => {
                  const subtitle = formatValueSubtitle(v.sku);
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-[var(--s-3)] bg-[var(--surface-2)] rounded-r-md"
                    >
                      <div className="min-w-0">
                        <div className="text-fs-sm font-medium text-[var(--fg)]">{v.name}</div>
                        {subtitle && (
                          <div className="text-fs-xs text-[var(--fg-muted)] font-mono tabular-nums">
                            {subtitle}
                          </div>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                        ₪{(v.price ?? 0).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Option sets (new variant system) */}
          {attachedOptionSets.map((set) => (
            <div
              key={`os-${set.id}`}
              className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] shadow-1 p-[var(--s-4)]"
            >
              <div className="flex items-center justify-between mb-[var(--s-3)]">
                <div>
                  <div className="flex items-center gap-[var(--s-2)]">
                    <span className="text-fs-sm font-semibold text-[var(--fg)]">{set.name}</span>
                    <Badge tone="brand">{t('optionSet') || 'Groupe d\'options'}</Badge>
                  </div>
                  <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
                    {(set.options ?? []).length} {t('options') || 'options'}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-[var(--s-2)]">
                    <button
                      type="button"
                      onClick={() => onEditOptionSet(set.id)}
                      className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors"
                    >
                      {t('edit') || 'Modifier'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDetachOptionSet(set.id)}
                      className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                    >
                      {t('detach') || 'Détacher'}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-[var(--s-2)]">
                {(set.options ?? []).map((o) => {
                  const ov = overrideFor(o.id);
                  const subtitle = formatValueSubtitle(ov?.sku || o.sku);
                  const displayPrice = ov?.price ?? o.price ?? 0;
                  const isComboOnly = ov?.is_combo_only ?? o.is_combo_only ?? false;
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-[var(--s-3)] bg-[var(--surface-2)] rounded-r-md"
                    >
                      <div className="min-w-0 flex items-center gap-[var(--s-2)]">
                        <div className="text-fs-sm font-medium text-[var(--fg)]">{o.name}</div>
                        {isComboOnly && (
                          <Badge tone="neutral">{t('comboOnlyBadge') || 'Combo seul'}</Badge>
                        )}
                        {subtitle && (
                          <div className="text-fs-xs text-[var(--fg-muted)] font-mono tabular-nums">
                            {subtitle}
                          </div>
                        )}
                      </div>
                      {isComboOnly ? (
                        <span className="text-fs-xs italic text-[var(--fg-muted)]">
                          {t('comboOnlyPriceLabel') || 'Tarif inclus dans le combo'}
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                          ₪{displayPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {canEdit && variantGroups.length === 0 && attachedOptionSets.length === 0 && (
            <button
              type="button"
              onClick={onAddOptionSet}
              className="w-full py-[var(--s-4)] rounded-r-lg border-2 border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_6%,transparent)] transition-colors flex items-center justify-center gap-[var(--s-2)]"
            >
              <Plus className="w-4 h-4" />
              {t('attachOptionSet') || "Attacher un groupe d'options existant"}
            </button>
          )}
        </div>
      </div>
      )}
      </section>
    </div>
  );
}

// ─── Modifier set card with inline per-item override editor ────────────────
// Effective values shown on the card are what the server stamped onto the
// item (set defaults with overrides applied). The expandable editor lets the
// operator pin min/max/required for THIS item or reset to inherit.
interface ModifierSetCardProps {
  set: ModifierSet;
  overrideRow: ModifierSetItemOverrideRow | undefined;
  setDefaults: ModifierSet | undefined;
  canEditOverrides: boolean;
  onSaveOverrides?: (input: ModifierSetItemOverridesInput) => Promise<void> | void;
  onDetach: () => void;
}

function ModifierSetCard({
  set,
  overrideRow,
  setDefaults,
  canEditOverrides,
  onSaveOverrides,
  onDetach,
}: ModifierSetCardProps) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track which fields are currently overridden (null = inherit, value = pinned).
  const [minOverride, setMinOverride] = useState<number | null>(
    overrideRow?.min_selections_override ?? null,
  );
  const [maxOverride, setMaxOverride] = useState<number | null>(
    overrideRow?.max_selections_override ?? null,
  );
  const [requiredOverride, setRequiredOverride] = useState<boolean | null>(
    overrideRow?.is_required_override ?? null,
  );

  const isOverridden =
    (overrideRow?.min_selections_override ?? null) !== null ||
    (overrideRow?.max_selections_override ?? null) !== null ||
    (overrideRow?.is_required_override ?? null) !== null;

  // Effective values shown in the subtitle — server already substituted these.
  const effectiveMeta =
    set.is_required || (set.min_selections ?? 0) > 0 || (set.max_selections ?? 0) > 0
      ? `${set.is_required ? `${t('required') || 'Obligatoire'} · ` : ''}min ${set.min_selections ?? 0} · max ${set.max_selections ?? 0}`
      : null;

  const defaultsLabel = (n: number | undefined) =>
    `${t('inherit') || 'Inherit'}${n !== undefined ? ` (${n})` : ''}`;

  const save = async () => {
    if (!onSaveOverrides) return;
    setSaving(true);
    try {
      await onSaveOverrides({
        min_selections: minOverride,
        max_selections: maxOverride,
        is_required: requiredOverride,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setMinOverride(null);
    setMaxOverride(null);
    setRequiredOverride(null);
  };

  return (
    <div className="bg-[var(--surface)] rounded-r-md border border-[var(--line)] shadow-1">
      <div className="p-[var(--s-3)_var(--s-4)] flex items-center gap-[var(--s-3)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[var(--s-2)]">
            <span className="text-fs-sm font-medium text-[var(--fg)]">{set.name}</span>
            {isOverridden && (
              <Badge tone="brand">{t('overridden') || 'Overridden'}</Badge>
            )}
          </div>
          {effectiveMeta && (
            <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">{effectiveMeta}</div>
          )}
        </div>
        {canEdit && canEditOverrides && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors inline-flex items-center gap-1"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {t('override') || 'Override'}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onDetach}
            className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
          >
            {t('detach') || 'Détacher'}
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-[var(--line)] p-[var(--s-3)_var(--s-4)] bg-[var(--surface-2)] grid grid-cols-1 sm:grid-cols-3 gap-[var(--s-3)]">
          <label className="flex flex-col gap-1">
            <span className="text-fs-xs font-medium text-[var(--fg-muted)]">
              {t('minSelections') || 'Min'}
            </span>
            <input
              type="number"
              min={0}
              value={minOverride ?? ''}
              onChange={(e) =>
                setMinOverride(e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder={defaultsLabel(setDefaults?.min_selections)}
              className="h-8 rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-2)] text-fs-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fs-xs font-medium text-[var(--fg-muted)]">
              {t('maxSelections') || 'Max'}
            </span>
            <input
              type="number"
              min={0}
              value={maxOverride ?? ''}
              onChange={(e) =>
                setMaxOverride(e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder={defaultsLabel(setDefaults?.max_selections)}
              className="h-8 rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-2)] text-fs-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-fs-xs font-medium text-[var(--fg-muted)]">
              {t('required') || 'Required'}
            </span>
            <select
              value={requiredOverride === null ? '' : requiredOverride ? 'yes' : 'no'}
              onChange={(e) => {
                const v = e.target.value;
                setRequiredOverride(v === '' ? null : v === 'yes');
              }}
              className="h-8 rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-2)] text-fs-sm"
            >
              <option value="">
                {defaultsLabel(undefined)}
                {setDefaults ? ` (${setDefaults.is_required ? (t('yes') || 'Yes') : (t('no') || 'No')})` : ''}
              </option>
              <option value="yes">{t('yes') || 'Yes'}</option>
              <option value="no">{t('no') || 'No'}</option>
            </select>
          </label>
          <div className="sm:col-span-3 flex items-center justify-end gap-[var(--s-2)] pt-[var(--s-1)]">
            <button
              type="button"
              onClick={reset}
              className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] transition-colors"
            >
              {t('resetToInherit') || 'Reset to inherit'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-[var(--s-4)] h-7 rounded-r-md text-fs-xs font-semibold bg-[var(--brand-500)] text-white hover:bg-[var(--brand-600)] disabled:opacity-60 transition-colors"
            >
              {saving ? (t('saving') || 'Saving…') : (t('save') || 'Save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
