'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getRecipeDetail, setRecipeSteps, updateRecipeMeta,
  listStockItems,
  RecipeDetail, RecipeStepInput, StockItem,
} from '@/lib/api';
import {
  ArrowLeftIcon,
  PencilIcon,
  PrinterIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import RecipeImportModal from '../../RecipeImportModal';

export default function RecipeDetailPage() {
  const { restaurantId, menuItemId } = useParams();
  const rid = Number(restaurantId);
  const itemId = Number(menuItemId);
  const router = useRouter();
  const { t } = useI18n();

  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // Edit state
  const [editSteps, setEditSteps] = useState<RecipeStepInput[]>([]);
  const [editPrepTime, setEditPrepTime] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await getRecipeDetail(rid, itemId);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [rid, itemId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { listStockItems(rid).then(setStockItems).catch(() => {}); }, [rid]);

  const enterEditMode = () => {
    if (!detail) return;
    setEditSteps(
      detail.steps.length > 0
        ? detail.steps.map(s => ({
            step_number: s.step_number,
            instruction: s.instruction,
            image_url: s.image_url || '',
            duration_mins: s.duration_mins || 0,
          }))
        : [{ step_number: 1, instruction: '', image_url: '', duration_mins: 0 }]
    );
    setEditPrepTime(detail.item.prep_time_mins || 0);
    setEditNotes(detail.item.recipe_notes || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      // Renumber steps sequentially
      const numbered = editSteps.map((s, i) => ({ ...s, step_number: i + 1 }));
      await Promise.all([
        setRecipeSteps(rid, itemId, numbered),
        updateRecipeMeta(rid, itemId, { prep_time_mins: editPrepTime, recipe_notes: editNotes }),
      ]);
      setEditing(false);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    setEditSteps(prev => [...prev, {
      step_number: prev.length + 1,
      instruction: '',
      image_url: '',
      duration_mins: 0,
    }]);
  };

  const removeStep = (idx: number) => {
    setEditSteps(prev => prev.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= editSteps.length) return;
    setEditSteps(prev => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const updateStep = (idx: number, field: keyof RecipeStepInput, value: string | number) => {
    setEditSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-fg-secondary">
        <p>Item not found</p>
      </div>
    );
  }

  const { item, ingredients, steps, category_name } = detail;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => router.push(`/${rid}/kitchen/recipes`)}
          className="flex items-center gap-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {t('backToRecipes')}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border text-brand-500 hover:bg-brand-500/5 transition-colors"
          >
            <SparklesIcon className="h-4 w-4" />
            {t('importRecipe')}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border text-fg-secondary hover:bg-bg-secondary transition-colors"
          >
            <PrinterIcon className="h-4 w-4" />
            {t('printRecipe')}
          </button>
          {!editing && (
            <button
              onClick={enterEditMode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-brand text-white hover:bg-brand/90 transition-colors"
            >
              <PencilIcon className="h-4 w-4" />
              {t('editRecipePage')}
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — item info + ingredients */}
        <div className="lg:col-span-2 space-y-5">
          {/* Item card */}
          <div className="bg-bg-primary rounded-xl border border-border overflow-hidden shadow-sm">
            {item.image_url && (
              <div className="aspect-[16/10] overflow-hidden">
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 space-y-3">
              {category_name && (
                <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-bg-secondary text-fg-secondary uppercase tracking-wide">
                  {category_name}
                </span>
              )}
              <h1 className="text-xl font-bold text-fg-primary">{item.name}</h1>
              {item.description && (
                <p className="text-sm text-fg-secondary">{item.description}</p>
              )}

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-bg-secondary rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wide text-fg-secondary font-medium">{t('prepTime')}</div>
                  <div className="text-lg font-semibold text-fg-primary mt-0.5">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        value={editPrepTime}
                        onChange={e => setEditPrepTime(Number(e.target.value))}
                        className="w-20 px-2 py-1 rounded border border-border bg-bg-primary text-sm"
                      />
                    ) : (
                      item.prep_time_mins ? t('prepTimeMins').replace('{mins}', String(item.prep_time_mins)) : '—'
                    )}
                  </div>
                </div>
                <div className="bg-bg-secondary rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wide text-fg-secondary font-medium">{t('recipePageYield')}</div>
                  <div className="text-lg font-semibold text-fg-primary mt-0.5">
                    {item.recipe_yield ? `${item.recipe_yield} ${item.recipe_yield_unit}` : '—'}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/${rid}/kitchen/food-cost`)}
                  className="bg-bg-secondary rounded-lg p-3 col-span-2 text-left hover:bg-bg-tertiary transition-colors group"
                >
                  <div className="text-[10px] uppercase tracking-wide text-fg-secondary font-medium">{t('recipeCost')}</div>
                  <div className="text-sm font-medium text-brand mt-0.5 group-hover:underline">
                    {t('viewFoodCost')} &rarr;
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="bg-bg-primary rounded-xl border border-border shadow-sm">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-fg-primary text-sm">{t('ingredientsCount').replace('{count}', String(ingredients.length))}</h2>
            </div>
            {ingredients.length === 0 ? (
              <div className="p-5 text-center text-sm text-fg-secondary">{t('noRecipeYet')}</div>
            ) : (
              <div className="divide-y divide-border">
                {ingredients.map(ing => {
                  const name = ing.stock_item?.name || ing.prep_item?.name || '—';
                  const unit = ing.unit || ing.stock_item?.unit || '';
                  return (
                    <div key={ing.id} className="px-5 py-3">
                      <div className="text-sm font-medium text-fg-primary">{name}</div>
                      <div className="text-xs text-fg-secondary">
                        {ing.quantity_needed} {unit}
                        {ing.prep_item && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium">PREP</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column — instructions + notes */}
        <div className="lg:col-span-3 space-y-5">
          {/* Instructions */}
          <div className="bg-bg-primary rounded-xl border border-border shadow-sm">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-fg-primary text-sm">{t('recipeInstructions')}</h2>
            </div>

            {editing ? (
              /* Edit mode */
              <div className="p-5 space-y-3">
                {editSteps.map((step, idx) => (
                  <div key={idx} className="bg-bg-secondary rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                        {t('recipeStepNumber').replace('{n}', String(idx + 1))}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveStep(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-bg-tertiary disabled:opacity-30 transition-colors"
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveStep(idx, 'down')}
                          disabled={idx === editSteps.length - 1}
                          className="p-1 rounded hover:bg-bg-tertiary disabled:opacity-30 transition-colors"
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => removeStep(idx)}
                          className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={step.instruction}
                      onChange={e => updateStep(idx, 'instruction', e.target.value)}
                      placeholder={t('recipeStepInstruction')}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-fg-primary resize-none focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <ClockIcon className="h-4 w-4 text-fg-secondary" />
                        <input
                          type="number"
                          min={0}
                          value={step.duration_mins || ''}
                          onChange={e => updateStep(idx, 'duration_mins', Number(e.target.value))}
                          placeholder={t('recipeStepDuration')}
                          className="w-20 px-2 py-1 rounded border border-border bg-bg-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                        <span className="text-xs text-fg-secondary">min</span>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addStep}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-border text-sm text-fg-secondary hover:border-brand hover:text-brand transition-colors w-full justify-center"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t('addRecipeStep')}
                </button>
              </div>
            ) : (
              /* View mode */
              <div className="p-5">
                {steps.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-fg-secondary text-sm">{t('noRecipeYet')}</p>
                    <p className="text-fg-secondary text-xs mt-1">{t('addRecipeInstructions')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {steps.map((step, idx) => (
                      <div key={step.id} className="flex gap-4">
                        {/* Step number circle */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-fg-primary leading-relaxed whitespace-pre-wrap">
                            {step.instruction}
                          </p>
                          {step.image_url && (
                            <img
                              src={step.image_url}
                              alt={`Step ${idx + 1}`}
                              className="rounded-lg max-h-48 object-cover"
                            />
                          )}
                          {step.duration_mins > 0 && (
                            <div className="flex items-center gap-1 text-xs text-fg-secondary">
                              <ClockIcon className="h-3.5 w-3.5" />
                              {step.duration_mins} min
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chef Notes */}
          <div className="bg-bg-primary rounded-xl border border-border shadow-sm">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-fg-primary text-sm">{t('recipeNotes')}</h2>
            </div>
            <div className="p-5">
              {editing ? (
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder={t('recipeNotesPlaceholder')}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-fg-primary resize-none focus:outline-none focus:ring-2 focus:ring-brand"
                />
              ) : (
                <p className="text-sm text-fg-secondary whitespace-pre-wrap">
                  {item.recipe_notes || t('recipeNotesPlaceholder')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky save/cancel bar */}
      {editing && (
        <div className="sticky bottom-0 bg-bg-primary border-t border-border px-5 py-3 flex items-center justify-end gap-3 -mx-4 sm:-mx-6 print:hidden" style={{ marginBottom: '-1.5rem' }}>
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm border border-border text-fg-secondary hover:bg-bg-secondary transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {saving ? t('saving') : t('saveRecipePage')}
          </button>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          * { color: black !important; border-color: #e5e5e5 !important; }
        }
      `}</style>

      {/* Recipe Import Modal */}
      {showImportModal && detail && (
        <RecipeImportModal
          rid={rid}
          menuItem={detail.item}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
