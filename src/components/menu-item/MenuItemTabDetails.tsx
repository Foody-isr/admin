'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { MenuCategory, Menu, ItemType } from '@/lib/api';
import SearchableListField from '@/components/SearchableListField';
import { Field, Input, Select, Textarea } from '@/components/ds';

// Aligned to design-reference/design/screens/item-editor.jsx:274-316 (DetailsTab).
// Flat 2-col and 3-col grids with Field + Input primitives; status uses dot-pulse.

interface Props {
  name: string;
  setName: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  categoryId: number;
  setCategoryId: (v: number) => void;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  vatRate: number;
  categories: MenuCategory[];
  // Foody-specific: menu attachment (kept below the reference fields).
  menus: Menu[];
  selectedMenuIds: Set<number>;
  setSelectedMenuIds: (s: Set<number>) => void;
  itemType: ItemType;
  setItemType: (v: ItemType) => void;
}

export default function MenuItemTabDetails({
  name, setName,
  price, setPrice,
  description, setDescription,
  categoryId, setCategoryId,
  isActive, setIsActive,
  vatRate,
  categories,
  menus,
  selectedMenuIds,
  setSelectedMenuIds,
  itemType,
  setItemType,
}: Props) {
  const { t } = useI18n();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const activeCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="max-w-4xl">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabDetails')}</h3>
      </div>

      <div className="flex flex-col gap-[var(--s-5)]">
        {/* Type d'article */}
        <Field label={t('itemType') || "Type d'article"}>
          <Select
            value={itemType}
            onChange={(e) => setItemType(e.target.value as ItemType)}
            className="md:w-72"
          >
            <option value="food_and_beverage">{t('foodAndBeverage') || 'Nourriture et boisson'}</option>
            <option value="combo">{t('combo') || 'Menu combo'}</option>
          </Select>
        </Field>

        {/* Row 1 — Nom | Catégorie */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s-4)]">
          <Field label={t('itemNameLabel') || "Nom de l'article"}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nameRequired') || 'Nom *'}
              autoFocus
            />
          </Field>

          <Field label={t('category') || 'Catégorie'}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen((v) => !v)}
                className="flex items-center justify-between w-full h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
              >
                <span className={activeCategory ? 'text-[var(--fg)]' : 'text-[var(--fg-subtle)]'}>
                  {activeCategory?.name ?? (t('addToCategories') || 'Ajouter à une catégorie')}
                </span>
                <ChevronDown className="w-4 h-4 text-[var(--fg-muted)]" />
              </button>
              {categoryOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-r-md shadow-3 z-20 max-h-64 overflow-y-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(cat.id);
                        setCategoryOpen(false);
                      }}
                      className={`w-full text-start px-[var(--s-3)] py-2 hover:bg-[var(--surface-2)] transition-colors text-fs-sm ${
                        cat.id === categoryId
                          ? 'text-[var(--brand-500)] font-medium'
                          : 'text-[var(--fg)]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>

        {/* Row 2 — Prix | TVA | Statut */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)]">
          <Field label={t('sellingPriceLabel') || 'Prix de vente'}>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="pr-8 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                ₪
              </span>
            </div>
          </Field>

          <Field label={t('vat') || 'TVA'}>
            <div className="relative">
              <Input
                type="text"
                value={`${vatRate}`}
                readOnly
                className="pr-8 cursor-not-allowed font-mono"
                title={`${t('vat')} — ${vatRate}%`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                %
              </span>
            </div>
          </Field>

          <Field label={t('status') || 'Statut'}>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className="flex items-center gap-[var(--s-2)] h-9 text-start"
              aria-pressed={isActive}
            >
              <span
                className="relative inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: isActive ? 'var(--success-500)' : 'var(--fg-subtle)' }}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-full opacity-60 animate-ping"
                    style={{ background: 'var(--success-500)' }}
                  />
                )}
              </span>
              <span className="text-fs-sm font-medium text-[var(--fg)]">
                {isActive ? (t('active') || 'Actif') : (t('unavailable') || 'Indisponible')}
              </span>
            </button>
          </Field>
        </div>

        {/* Description */}
        <Field label={t('description') || 'Description'}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('addDescription') || 'Ajouter une description'}
            rows={4}
          />
        </Field>

        {/* Menus / Cartes — foody-specific; below reference fields. */}
        <Field label={t('menus') || 'Cartes'} hint={t('cartesDescription') || "Cartes où cet article apparaît"}>
          <SearchableListField
            mode="multi"
            placeholder={t('addToMenus') || 'Ajouter à des cartes'}
            emptyLabel={t('noMenusAvailable') || 'Aucune carte disponible'}
            options={menus.map((m) => ({ value: String(m.id), label: m.name }))}
            values={Array.from(selectedMenuIds).map(String)}
            onChange={(vs) => setSelectedMenuIds(new Set(vs.map(Number)))}
          />
        </Field>
      </div>
    </div>
  );
}
