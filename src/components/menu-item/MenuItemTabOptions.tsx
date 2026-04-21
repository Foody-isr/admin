'use client';

import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type {
  MenuItem,
  ModifierSet,
  OptionSet,
  ItemOptionOverride,
} from '@/lib/api';

// Figma MenuItemDetails.tsx:248-321 — Options (Modificateurs + Variantes).
// Direct port with real data plugged in.

interface Props {
  item: MenuItem;
  /** Modifier sets attached to this item. */
  attachedModifierSets: ModifierSet[];
  /** Option sets (new variant system) attached to this item. */
  attachedOptionSets: OptionSet[];
  /** Per-variant price overrides. */
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

  const overridePriceFor = (optionId: number): number | undefined => {
    const o = itemOptionOverrides.find((ov) => ov.option_id === optionId);
    return o?.price ?? undefined;
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t('tabModifiers')}
        </h3>
      </div>

      {/* Modificateurs section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-1">
              {t('modifiers')}
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('modifiersDesc') || 'Autorisez des personnalisations, comme les suppléments ou les demandes spéciales.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onAddModifierSet}
            className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            {t('add') || 'Ajouter'}
          </button>
        </div>

        {/* Attached modifier sets */}
        {attachedModifierSets.length > 0 && (
          <div className="space-y-3 mb-3">
            {attachedModifierSets.map((set) => (
              <div
                key={set.id}
                className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium text-neutral-900 dark:text-white">
                      {set.name}
                    </h5>
                    {(set.is_required || (set.min_selections ?? 0) > 0 || (set.max_selections ?? 0) > 0) && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        {set.is_required ? `${t('required')} · ` : ''}
                        min {set.min_selections ?? 0} · max {set.max_selections ?? 0}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDetachModifierSet(set.id)}
                    className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('detach') || 'Supprimer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Individual modifiers */}
        {modifiers.length > 0 && (
          <div className="space-y-2">
            {modifiers.map((mod) => (
              <div
                key={mod.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <div>
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {mod.name}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                    ({mod.action})
                    {mod.category ? ` · ${mod.category}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {mod.price_delta !== 0 && (
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      {mod.price_delta > 0 ? '+' : ''}
                      {mod.price_delta.toFixed(2)} ₪
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteModifier(mod.id)}
                    className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('delete') || 'Supprimer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variantes section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-1">
              {t('variants')}
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('variantsDesc') || 'Ajoutez des options comme les tailles ou les saveurs, puis définissez les prix, les SKU et les stocks.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onAddVariantGroup}
            className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            {t('add') || 'Ajouter'}
          </button>
        </div>

        {/* Legacy variant_groups */}
        <div className="space-y-4">
          {variantGroups.map((group) => (
            <div
              key={group.id}
              className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h5 className="font-medium text-neutral-900 dark:text-white">
                  {group.title}
                </h5>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEditVariantGroup(group.id)}
                    className="px-3 py-1.5 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('edit') || 'Modifier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteVariantGroup(group.id)}
                    className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('delete') || 'Supprimer'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(group.variants ?? []).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div>
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {v.name}
                      </span>
                      {v.portion_size != null && (
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {v.portion_size} {v.portion_size_unit}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {(v.price ?? 0).toFixed(2)} ₪
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Option sets (new variant system) */}
          {attachedOptionSets.map((set) => (
            <div
              key={`os-${set.id}`}
              className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h5 className="font-medium text-neutral-900 dark:text-white">
                  {set.name}
                </h5>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEditOptionSet(set.id)}
                    className="px-3 py-1.5 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('edit') || 'Modifier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDetachOptionSet(set.id)}
                    className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                  >
                    {t('detach') || 'Supprimer'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(set.options ?? []).map((o) => {
                  const override = overridePriceFor(o.id);
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700"
                    >
                      <div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {o.name}
                        </span>
                        {o.sku && (
                          <p className="text-xs text-neutral-600 dark:text-neutral-400">
                            {o.sku}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {(override ?? o.price ?? 0).toFixed(2)} ₪
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {attachedOptionSets.length === 0 && (
            <button
              type="button"
              onClick={onAddOptionSet}
              className="w-full p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all flex items-center justify-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">
                {t('attachOptionSet') || 'Attacher un groupe d\'options existant'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
