'use client';

import { PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import type { CateringChoiceGroupDraft } from '@/components/catering/CateringFormulaComposer';
import { newChoiceGroupDraft } from '@/components/catering/CateringFormulaComposer';
import { useCurrency } from '@/lib/i18n';

type Props = {
  groups: CateringChoiceGroupDraft[];
  onChange: (groups: CateringChoiceGroupDraft[]) => void;
};

function normalizedGroup(group: CateringChoiceGroupDraft): CateringChoiceGroupDraft {
  return {
    ...group,
    min_selections: 0,
    max_selections: 999,
    max_per_item: 0,
    items: group.items.map((item) => ({ ...item, default_quantity: 0 })),
  };
}

export function newPlateauxGroup(index: number, name = ''): CateringChoiceGroupDraft {
  return normalizedGroup(newChoiceGroupDraft(index, name));
}

export function defaultPlateauxGroups(): CateringChoiceGroupDraft[] {
  return [newPlateauxGroup(0, 'Halavi'), newPlateauxGroup(1, 'Bassari')];
}

export default function CateringPlateauxComposer({ groups, onChange }: Props) {
  const { symbol } = useCurrency();

  const updateGroup = (groupIndex: number, patch: Partial<CateringChoiceGroupDraft>) => {
    onChange(groups.map((group, index) => index === groupIndex ? normalizedGroup({ ...group, ...patch }) : group));
  };

  const removeGroup = (groupIndex: number) => {
    onChange(groups.filter((_, index) => index !== groupIndex));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-500/25 bg-brand-500/5 p-4">
        <h4 className="font-semibold text-fg-primary">Groupes de l’offre</h4>
        <p className="mt-1 text-sm leading-6 text-fg-secondary">
          Créez ici les menus Halavi et Bassari. Chaque groupe contient ses propres plateaux, vendus à l’unité.
        </p>
      </div>

      {groups.map((group, groupIndex) => (
        <section key={group.key} className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg-secondary">Nom du groupe</span>
              <input
                className="input mt-1"
                value={group.name}
                placeholder={groupIndex === 0 ? 'Halavi' : groupIndex === 1 ? 'Bassari' : 'Nom du groupe'}
                onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
              />
            </label>
            <button
              type="button"
              onClick={() => removeGroup(groupIndex)}
              aria-label="Supprimer le groupe"
              className="mb-0.5 rounded-lg p-2.5 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-3 block">
            <span className="block text-sm font-semibold text-fg-secondary">Description (facultative)</span>
            <input
              className="input mt-1"
              value={group.description ?? ''}
              placeholder="Ex. Notre sélection de plateaux lactés"
              onChange={(event) => updateGroup(groupIndex, { description: event.target.value })}
            />
          </label>

          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_9rem_2.5rem] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-fg-tertiary">
              <span>Article / plateau</span>
              <span>Prix à l’unité</span>
              <span />
            </div>
            {group.items.map((item, itemIndex) => (
              <div key={`${group.key}-${itemIndex}`} className="grid gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_9rem_2.5rem] sm:items-start">
                <div className="space-y-2">
                  {item.menu_item_id ? (
                    <div className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm font-medium text-fg-primary">
                      {item.name || `Article #${item.menu_item_id} du catalogue`}
                    </div>
                  ) : (
                    <input
                      className="input"
                      value={item.name ?? ''}
                      placeholder="Nom du plateau"
                      onChange={(event) => updateGroup(groupIndex, {
                        items: group.items.map((candidate, index) => index === itemIndex ? { ...candidate, name: event.target.value } : candidate),
                      })}
                    />
                  )}
                  <input
                    className="input"
                    value={item.description ?? ''}
                    placeholder="Description (facultative)"
                    onChange={(event) => updateGroup(groupIndex, {
                      items: group.items.map((candidate, index) => index === itemIndex ? { ...candidate, description: event.target.value } : candidate),
                    })}
                  />
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm font-semibold text-fg-tertiary">{symbol}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input !ps-8"
                    value={item.price_delta || ''}
                    placeholder="0"
                    aria-label="Prix à l’unité"
                    onChange={(event) => updateGroup(groupIndex, {
                      items: group.items.map((candidate, index) => index === itemIndex ? { ...candidate, price_delta: Number(event.target.value) || 0 } : candidate),
                    })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateGroup(groupIndex, { items: group.items.filter((_, index) => index !== itemIndex) })}
                  aria-label="Supprimer l’article"
                  className="rounded-lg p-2.5 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateGroup(groupIndex, {
                items: [...group.items, { name: '', description: '', price_delta: 0, default_quantity: 0 }],
              })}
            >
              <PlusIcon /> Ajouter un article / plateau
            </Button>
          </div>
        </section>
      ))}

      <Button variant="secondary" size="sm" onClick={() => onChange([...groups, newPlateauxGroup(groups.length)])}>
        <PlusIcon /> Ajouter un groupe
      </Button>
    </div>
  );
}
