'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getRecipeDetail, setRecipeSteps, updateRecipeMeta,
  listStockItems,
  RecipeDetail, RecipeStepInput, StockItem,
} from '@/lib/api';
import {
  PrinterIcon, ClockIcon, PlusIcon, TrashIcon,
  ChevronUpIcon, ChevronDownIcon, SparklesIcon, PhotoIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import FormModal from '@/components/FormModal';
import FormSection from '@/components/FormSection';
import RecipeImportModal from '../../RecipeImportModal';

export default function RecipeDetailPage() {
  const { restaurantId, menuItemId } = useParams();
  const rid = Number(restaurantId);
  const itemId = Number(menuItemId);
  const router = useRouter();
  const { t } = useI18n();

  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // Edit state (always editable — mirrors Stock item modal)
  const [editSteps, setEditSteps] = useState<RecipeStepInput[]>([]);
  const [editPrepTime, setEditPrepTime] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await getRecipeDetail(rid, itemId);
      setDetail(data);
      setEditSteps(
        data.steps.length > 0
          ? data.steps.map((s) => ({
              step_number: s.step_number,
              instruction: s.instruction,
              image_url: s.image_url || '',
              duration_mins: s.duration_mins || 0,
            }))
          : [{ step_number: 1, instruction: '', image_url: '', duration_mins: 0 }],
      );
      setEditPrepTime(data.item.prep_time_mins || 0);
      setEditNotes(data.item.recipe_notes || '');
    } finally {
      setLoading(false);
    }
  }, [rid, itemId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { listStockItems(rid).then(setStockItems).catch(() => {}); }, [rid]);

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const numbered = editSteps.map((s, i) => ({ ...s, step_number: i + 1 }));
      await Promise.all([
        setRecipeSteps(rid, itemId, numbered),
        updateRecipeMeta(rid, itemId, { prep_time_mins: editPrepTime, recipe_notes: editNotes }),
      ]);
      await reload();
      router.push(`/${rid}/kitchen/recipes`);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    router.push(`/${rid}/kitchen/recipes`);
  };

  const addStep = () => {
    setEditSteps((prev) => [
      ...prev,
      { step_number: prev.length + 1, instruction: '', image_url: '', duration_mins: 0 },
    ]);
  };
  const removeStep = (idx: number) => setEditSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= editSteps.length) return;
    setEditSteps((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };
  const updateStep = (idx: number, field: keyof RecipeStepInput, value: string | number) => {
    setEditSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--surface)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--surface)] flex items-center justify-center text-fg-secondary">
        <p>Item not found</p>
      </div>
    );
  }

  const { item, ingredients, category_name } = detail;

  const sidebar = (
    <>
      <FormSection>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-fg-primary">{t('category')}</h3>
          <span className="text-sm text-fg-secondary">{category_name || '—'}</span>
        </div>
      </FormSection>

      <FormSection title={t('prepTime')}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={editPrepTime || ''}
            onChange={(e) => setEditPrepTime(Number(e.target.value))}
            className="input text-sm flex-1"
          />
          <span className="text-xs text-fg-secondary">min</span>
        </div>
      </FormSection>

      <FormSection title={t('recipePageYield')}>
        <p className="text-sm text-fg-primary">
          {item.recipe_yield ? `${item.recipe_yield} ${item.recipe_yield_unit}` : '—'}
        </p>
      </FormSection>

      <FormSection title={t('recipeCost')}>
        <button
          onClick={() => router.push(`/${rid}/kitchen/food-cost`)}
          className="text-sm text-brand-500 hover:underline"
        >
          {t('viewFoodCost')} &rarr;
        </button>
      </FormSection>

      <FormSection title={t('recipeNotes')}>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder={t('recipeNotesPlaceholder')}
          rows={4}
          className="input text-sm w-full resize-none"
        />
      </FormSection>

      <FormSection>
        <div className="space-y-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--divider)] text-brand-500 hover:bg-brand-500/5 transition-colors"
          >
            <SparklesIcon className="h-4 w-4" />
            {t('importRecipe')}
          </button>
          <button
            onClick={() => window.print()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--divider)] text-fg-secondary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <PrinterIcon className="h-4 w-4" />
            {t('printRecipe')}
          </button>
        </div>
      </FormSection>
    </>
  );

  return (
    <>
      <FormModal
        title={item.name}
        onClose={close}
        onSave={save}
        saveLabel={t('saveRecipePage')}
        saving={saving}
        sidebar={sidebar}
      >
        {/* Name (read-only, from menu item) */}
        <input
          className="input w-full text-base"
          value={item.name}
          readOnly
          disabled
        />

        {/* Image */}
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="relative rounded-xl overflow-hidden border-2 border-[var(--divider)] bg-[var(--surface-subtle)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt={item.name} className="w-full h-52 object-contain" />
          </div>
        ) : (
          <div className="border-2 border-dashed border-[var(--divider)] rounded-xl p-10 flex flex-col items-center gap-3 text-fg-tertiary">
            <PhotoIcon className="w-10 h-10" />
            <p className="text-sm">{t('noRecipeYet')}</p>
          </div>
        )}

        {/* Ingredients (read-only — managed via menu item) */}
        <FormSection title={t('ingredientsCount').replace('{count}', String(ingredients.length))}>
          {ingredients.length === 0 ? (
            <p className="text-sm text-fg-secondary text-center py-3">{t('noRecipeYet')}</p>
          ) : (
            <div className="divide-y divide-[var(--divider)] -my-2">
              {ingredients.map((ing) => {
                const name = ing.stock_item?.name || ing.prep_item?.name || '—';
                const unit = ing.unit || ing.stock_item?.unit || '';
                return (
                  <div key={ing.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-fg-primary">{name}</div>
                      <div className="text-xs text-fg-secondary font-mono">
                        {ing.quantity_needed} {unit}
                        {ing.prep_item && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-medium">
                            PREP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FormSection>

        {/* Instructions / steps */}
        <FormSection title={t('recipeInstructions')}>
          <div className="space-y-3">
            {editSteps.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-[var(--divider)] bg-[var(--surface-subtle)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                    {t('recipeStepNumber').replace('{n}', String(idx + 1))}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveStep(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
                    >
                      <ChevronUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveStep(idx, 'down')}
                      disabled={idx === editSteps.length - 1}
                      className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeStep(idx)}
                      className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <textarea
                  value={step.instruction}
                  onChange={(e) => updateStep(idx, 'instruction', e.target.value)}
                  placeholder={t('recipeStepInstruction')}
                  rows={3}
                  className="input w-full text-sm resize-none"
                />
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-fg-secondary" />
                  <input
                    type="number"
                    min={0}
                    value={step.duration_mins || ''}
                    onChange={(e) => updateStep(idx, 'duration_mins', Number(e.target.value))}
                    placeholder={t('recipeStepDuration')}
                    className="input w-24 text-sm"
                  />
                  <span className="text-xs text-fg-secondary">min</span>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addStep}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-[var(--divider)] text-sm text-fg-secondary hover:border-brand-500 hover:text-brand-500 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              {t('addRecipeStep')}
            </button>
          </div>
        </FormSection>
      </FormModal>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          * { color: black !important; border-color: #e5e5e5 !important; }
        }
      `}</style>

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
    </>
  );
}
