'use client';

import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type {
  MenuItem,
  ModifierSet,
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
  attachedOptionSets: OptionSet[];
  itemOptionOverrides: ItemOptionOverride[];
  onAddModifierSet: () => void;
  onDetachModifierSet: (id: number) => void;
  onDeleteModifier: (id: number) => void;
  onAddVariantGroup: () => void;
  onEditVariantGroup: (id: number) => void;
  onDeleteVariantGroup: (id: number) => void;
  onAddOptionSet: () => void;
  onEditOptionSet: (id: number) => void;
  onDetachOptionSet: (id: number) => void;
}

export default function MenuItemTabOptions({
  item,
  attachedModifierSets,
  attachedOptionSets,
  itemOptionOverrides,
  onAddModifierSet,
  onDetachModifierSet,
  onDeleteModifier,
  onAddVariantGroup,
  onEditVariantGroup,
  onDeleteVariantGroup,
  onAddOptionSet,
  onEditOptionSet,
  onDetachOptionSet,
}: Props) {
  const { t } = useI18n();
  const modifiers = item.modifiers ?? [];
  const variantGroups = item.variant_groups ?? [];

  const overrideFor = (optionId: number): ItemOptionOverride | undefined =>
    itemOptionOverrides.find((ov) => ov.option_id === optionId);

  const formatValueSubtitle = (
    portionSize?: number | null,
    portionUnit?: string | null,
    sku?: string | null,
  ): string | null => {
    const bits: string[] = [];
    if (portionSize != null && portionSize > 0) {
      bits.push(`${portionSize} ${portionUnit || 'g'}`);
    }
    if (sku && sku.trim()) bits.push(sku.trim());
    return bits.length > 0 ? bits.join(' • ') : null;
  };

  return (
    <div className="max-w-4xl">
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">
          {t('tabModifiers') || 'Modificateurs et variantes'}
        </h3>
      </div>

      {/* Modificateurs */}
      <div className="mb-[var(--s-6)]">
        <div className="flex items-center justify-between mb-[var(--s-3)]">
          <div>
            <h4 className="text-fs-sm font-semibold text-[var(--fg)]">
              {t('modifiers') || 'Modificateurs'}
            </h4>
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('modifiersDesc') ||
                'Options ajoutées à la commande (sans coriandre, sauce à part…).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onAddModifierSet}
            className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('add') || 'Ajouter'}
          </button>
        </div>

        {attachedModifierSets.length > 0 && (
          <div className="flex flex-col gap-[var(--s-2)] mb-[var(--s-3)]">
            {attachedModifierSets.map((set) => {
              const meta =
                set.is_required || (set.min_selections ?? 0) > 0 || (set.max_selections ?? 0) > 0
                  ? `${set.is_required ? `${t('required') || 'Obligatoire'} · ` : ''}min ${set.min_selections ?? 0} · max ${set.max_selections ?? 0}`
                  : null;
              return (
                <div
                  key={set.id}
                  className="bg-[var(--surface)] rounded-r-md border border-[var(--line)] shadow-1 p-[var(--s-3)_var(--s-4)] flex items-center gap-[var(--s-3)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-fs-sm font-medium text-[var(--fg)]">
                      {set.name}
                    </div>
                    {meta && (
                      <div className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
                        {meta}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDetachModifierSet(set.id)}
                    className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                  >
                    {t('detach') || 'Détacher'}
                  </button>
                </div>
              );
            })}
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
                <button
                  type="button"
                  onClick={() => onDeleteModifier(mod.id)}
                  className="px-[var(--s-3)] h-7 rounded-r-md text-fs-xs font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                >
                  {t('delete') || 'Supprimer'}
                </button>
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
          <button
            type="button"
            onClick={onAddVariantGroup}
            className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('add') || 'Ajouter'}
          </button>
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
              </div>
              <div className="flex flex-col gap-[var(--s-2)]">
                {(group.variants ?? []).map((v) => {
                  const subtitle = formatValueSubtitle(
                    v.portion_size,
                    v.portion_size_unit,
                    v.sku,
                  );
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
              </div>
              <div className="flex flex-col gap-[var(--s-2)]">
                {(set.options ?? []).map((o) => {
                  const ov = overrideFor(o.id);
                  const subtitle = formatValueSubtitle(
                    ov?.portion_size,
                    ov?.portion_size_unit,
                    ov?.sku || o.sku,
                  );
                  const displayPrice = ov?.price ?? o.price ?? 0;
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-[var(--s-3)] bg-[var(--surface-2)] rounded-r-md"
                    >
                      <div className="min-w-0">
                        <div className="text-fs-sm font-medium text-[var(--fg)]">{o.name}</div>
                        {subtitle && (
                          <div className="text-fs-xs text-[var(--fg-muted)] font-mono tabular-nums">
                            {subtitle}
                          </div>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-fs-sm font-semibold text-[var(--fg)]">
                        ₪{displayPrice.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {variantGroups.length === 0 && attachedOptionSets.length === 0 && (
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
      </section>
    </div>
  );
}
