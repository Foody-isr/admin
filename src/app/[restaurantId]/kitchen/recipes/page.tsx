'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listRecipeItems, RecipeCardItem } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  ClockIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

type StatusFilter = 'all' | 'complete' | 'partial' | 'none';

export default function RecipesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [items, setItems] = useState<RecipeCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const reload = useCallback(async () => {
    try {
      const data = await listRecipeItems(rid);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Derive unique categories
  const categories = Array.from(new Set(items.map(i => i.category_name).filter(Boolean))).sort();

  // Filter items
  const filtered = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && item.category_name !== categoryFilter) return false;
    if (statusFilter === 'complete' && !(item.has_steps && item.has_ingredients)) return false;
    if (statusFilter === 'partial' && !((item.has_steps || item.has_ingredients) && !(item.has_steps && item.has_ingredients))) return false;
    if (statusFilter === 'none' && (item.has_steps || item.has_ingredients)) return false;
    return true;
  });

  const getStatusColor = (item: RecipeCardItem) => {
    if (item.has_steps && item.has_ingredients) return 'bg-emerald-500';
    if (item.has_steps || item.has_ingredients) return 'bg-amber-500';
    return 'bg-gray-300';
  };

  const getStatusLabel = (item: RecipeCardItem) => {
    if (item.has_steps && item.has_ingredients) return t('completeRecipe');
    if (item.has_steps || item.has_ingredients) return t('partialRecipe');
    return t('noRecipe');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-fg-primary">{t('recipes')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-secondary" />
            <input
              type="text"
              placeholder={t('search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-border bg-bg-primary text-fg-primary text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-bg-primary text-fg-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">{t('allItems')}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2">
        {(['all', 'complete', 'partial', 'none'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-brand text-white'
                : 'bg-bg-secondary text-fg-secondary hover:bg-bg-tertiary'
            }`}
          >
            {s === 'all' && t('allItems')}
            {s === 'complete' && t('completeRecipe')}
            {s === 'partial' && t('partialRecipe')}
            {s === 'none' && t('noRecipe')}
            {' '}
            <span className="opacity-70">
              ({s === 'all' ? items.length : items.filter(item => {
                if (s === 'complete') return item.has_steps && item.has_ingredients;
                if (s === 'partial') return (item.has_steps || item.has_ingredients) && !(item.has_steps && item.has_ingredients);
                return !item.has_steps && !item.has_ingredients;
              }).length})
            </span>
          </button>
        ))}
      </div>

      {/* Recipe Cards Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-fg-secondary">
          <ListBulletIcon className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">{t('noRecipeYet')}</p>
          <p className="text-sm mt-1">{t('addRecipeInstructions')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => router.push(`/${rid}/kitchen/recipes/${item.id}`)}
              className="group bg-bg-primary rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md hover:border-brand/40 transition-all duration-200 text-left"
            >
              {/* Image */}
              <div className="relative aspect-[16/10] bg-bg-secondary overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl opacity-20">
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Status dot */}
                <div className="absolute top-3 right-3">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(item)} ring-2 ring-white/80`} title={getStatusLabel(item)} />
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-2">
                {/* Category chip */}
                {item.category_name && (
                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-bg-secondary text-fg-secondary uppercase tracking-wide">
                    {item.category_name}
                  </span>
                )}

                {/* Name */}
                <h3 className="font-semibold text-fg-primary text-sm leading-tight line-clamp-2 group-hover:text-brand transition-colors">
                  {item.name}
                </h3>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-[11px] text-fg-secondary">
                  {item.prep_time_mins > 0 && (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {t('prepTimeMins').replace('{mins}', String(item.prep_time_mins))}
                    </span>
                  )}
                  {item.ingredient_count > 0 && (
                    <span className="flex items-center gap-1">
                      <ListBulletIcon className="h-3.5 w-3.5" />
                      {t('ingredientsCount').replace('{count}', String(item.ingredient_count))}
                    </span>
                  )}
                  {item.step_count > 0 && (
                    <span className="flex items-center gap-1">
                      {t('stepsCount').replace('{count}', String(item.step_count))}
                    </span>
                  )}
                </div>

                {/* Yield row */}
                {item.recipe_yield > 0 && (
                  <div className="text-[11px] text-fg-secondary">
                    {t('recipePageYield')}: {item.recipe_yield} {item.recipe_yield_unit}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
