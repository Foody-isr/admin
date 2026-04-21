'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { MenuCategory, Menu } from '@/lib/api';
import SearchableListField from '@/components/SearchableListField';

// Figma MenuItemDetails.tsx:156-246 — Détails tab.
// Direct port of the JSX with our real state plugged in.

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
  // Foody-specific: menu attachment (kept below the Figma fields).
  menus: Menu[];
  selectedMenuIds: Set<number>;
  setSelectedMenuIds: (s: Set<number>) => void;
  itemType?: string;
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
}: Props) {
  const { t } = useI18n();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const activeCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t('tabDetails')}
        </h3>
      </div>

      <div className="space-y-6">
        {itemType === 'combo' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('itemType')}
            </span>
            <span className="px-3 py-1 rounded-full text-xs bg-orange-500/15 text-orange-500">
              {t('combo')}
            </span>
          </div>
        )}

        {/* Row 1 — Nom de l'article | Catégorie */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('itemNameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nameRequired')}
              autoFocus
              className="w-full px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('category')}
            </label>
            <div className="relative flex gap-2">
              <input
                type="text"
                readOnly
                value={activeCategory?.name ?? ''}
                placeholder={t('addToCategories')}
                onClick={() => setCategoryOpen((v) => !v)}
                className="flex-1 px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setCategoryOpen((v) => !v)}
                className="px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-[#222222] transition-colors"
                aria-label="Open category menu"
              >
                <ChevronDown size={16} className="text-neutral-600 dark:text-neutral-400" />
              </button>
              {categoryOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(cat.id);
                        setCategoryOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors text-sm ${
                        cat.id === categoryId
                          ? 'text-orange-500 font-medium'
                          : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 — Prix de vente | TVA | Statut */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('sellingPriceLabel')}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 pr-12 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-600 dark:text-neutral-400 text-sm pointer-events-none">
                ₪
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('vat')}
            </label>
            <input
              type="text"
              value={`${vatRate}%`}
              readOnly
              className="w-full px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none cursor-not-allowed"
              title={`${t('vat')} — ${vatRate}%`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {t('status')}
            </label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className="flex items-center gap-3 h-[42px]"
            >
              <div className={`size-2.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-neutral-400'}`} />
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                {isActive ? t('active') : t('unavailable')}
              </span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {t('description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('addDescription')}
            rows={4}
            className="w-full px-4 py-3 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>

        {/* Menus / Cartes — foody-specific; kept below Figma fields. */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {t('menus')}
          </label>
          <SearchableListField
            mode="multi"
            placeholder={t('addToMenus')}
            emptyLabel={t('noMenusAvailable') || 'No menus available'}
            options={menus.map((m) => ({ value: String(m.id), label: m.name }))}
            values={Array.from(selectedMenuIds).map(String)}
            onChange={(vs) => setSelectedMenuIds(new Set(vs.map(Number)))}
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {t('cartesDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
