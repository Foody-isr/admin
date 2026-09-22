'use client';

import { useState } from 'react';
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChefHatIcon,
  ChevronDownIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { labGenerateDrafts } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { MenuItemPicker } from './MenuItemPicker';
import type { RecipeBrief, RecipeObjective } from '../types';

const OBJECTIVES: {
  value: RecipeObjective;
  icon: typeof TrendingUpIcon;
  labelKey: string;
  descriptionKey: string;
}[] = [
  { value: 'optimize_profit', icon: TrendingUpIcon, labelKey: 'labObjectiveProfit', descriptionKey: 'labObjectiveProfitHelp' },
  { value: 'refresh_menu', icon: RefreshCwIcon, labelKey: 'labObjectiveRefresh', descriptionKey: 'labObjectiveRefreshHelp' },
  { value: 'seasonal', icon: CalendarDaysIcon, labelKey: 'labObjectiveSeasonal', descriptionKey: 'labObjectiveSeasonalHelp' },
  { value: 'use_stock', icon: PackageOpenIcon, labelKey: 'labObjectiveStock', descriptionKey: 'labObjectiveStockHelp' },
  { value: 'signature', icon: ChefHatIcon, labelKey: 'labObjectiveSignature', descriptionKey: 'labObjectiveSignatureHelp' },
];

/** Guided brief builder for a new recipe or an existing menu item. */
export function DraftInputRail({
  restaurantId,
  onAfterGenerate,
  canManage,
}: {
  restaurantId: number;
  onAfterGenerate?: () => void;
  canManage: boolean;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brief, setBrief] = useState<RecipeBrief>({
    objective: 'refresh_menu',
    stock_policy: 'prefer_existing',
    creativity: 45,
    max_prep_time_mins: 30,
    season: '',
    dietary: [],
    must_use: [],
    exclude: [],
    notes: '',
  });

  const parseDishNames = (raw: string): string[] =>
    raw.split('\n').map((line) => line.trim()).filter(Boolean);

  const handleGenerate = async () => {
    const dishNames = parseDishNames(text);
    if (dishNames.length === 0) return;
    setSubmitting(true);
    try {
      await labGenerateDrafts(restaurantId, { dish_names: dishNames, locale, brief });
      setText('');
      onAfterGenerate?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickConfirm = async (ids: number[]) => {
    setPickerOpen(false);
    setSubmitting(true);
    try {
      await labGenerateDrafts(restaurantId, { menu_item_ids: ids.map(String), locale, brief });
      onAfterGenerate?.();
    } finally {
      setSubmitting(false);
    }
  };

  const canGenerate = parseDishNames(text).length > 0 && !submitting;

  return (
    <>
      <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
        <div className="border-b border-[var(--line)] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start gap-4">
            <StepNumber value="1" />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--fg)]">{t('labIntentTitle')}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">{t('labIntentHelp')}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {OBJECTIVES.map(({ value, icon: Icon, labelKey, descriptionKey }) => {
              const active = brief.objective === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBrief((current) => ({ ...current, objective: value }))}
                  className={`group flex min-h-[92px] items-start gap-3 rounded-[12px] border p-4 text-start transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_8%,var(--surface))] shadow-[inset_3px_0_0_var(--brand-500)]' : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'}`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${active ? 'bg-[var(--brand-500)] text-white' : 'bg-[var(--surface-2)] text-[var(--fg-muted)] group-hover:text-[var(--fg)]'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--fg)]">{t(labelKey)}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">{t(descriptionKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start gap-4">
            <StepNumber value="2" />
            <div className="min-w-0 flex-1">
              <label htmlFor="lab-dish-ideas" className="text-base font-semibold text-[var(--fg)]">{t('labDescribeDish')}</label>
              <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{t('labDescribeDishHelp')}</p>
              <textarea
                id="lab-dish-ideas"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('labDishNamesPlaceholder')}
                rows={3}
                disabled={submitting}
                className="mt-4 w-full resize-none rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-base leading-6 text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--brand-500)] focus:outline-none focus:shadow-[var(--focus-ring)] disabled:opacity-50"
              />

              {canManage && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button size="lg" className="min-h-11 w-full sm:w-auto sm:min-w-56" onClick={handleGenerate} disabled={!canGenerate}>
                    <SparklesIcon />
                    {submitting ? t('labLoading') : t('labCreateProposals')}
                  </Button>
                  <span className="px-1 text-center text-xs text-[var(--fg-subtle)]">{t('labOr')}</span>
                  <Button variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto" onClick={() => setPickerOpen(true)} disabled={submitting}>
                    <BookOpenIcon />
                    {t('labStartFromMenu')}
                  </Button>
                </div>
              )}

              <details className="group mt-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
                  <span>
                    {t('labOptionalSettings')}
                    <span className="ms-2 font-normal text-[var(--fg-muted)]">{t('labOptionalSettingsHelp')}</span>
                  </span>
                  <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--fg-muted)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t border-[var(--line)] p-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[var(--fg-muted)]">
                    {t('labStockPolicy')}
                    <select
                      value={brief.stock_policy}
                      onChange={(event) => setBrief((current) => ({ ...current, stock_policy: event.target.value as RecipeBrief['stock_policy'] }))}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
                    >
                      <option value="existing_only">{t('labStockOnly')}</option>
                      <option value="prefer_existing">{t('labStockPrefer')}</option>
                      <option value="allow_new">{t('labStockAllowNew')}</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-[var(--fg-muted)]">
                    <span className="flex justify-between"><span>{t('labCreativity')}</span><strong className="text-[var(--fg)]">{brief.creativity}%</strong></span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={brief.creativity}
                      onChange={(event) => setBrief((current) => ({ ...current, creativity: Number(event.target.value) }))}
                      className="mt-2 w-full accent-[var(--brand-500)]"
                    />
                    <span className="flex justify-between text-[10px] font-normal"><span>{t('labFamiliar')}</span><span>{t('labBold')}</span></span>
                  </label>

                  {brief.objective === 'seasonal' && (
                    <label className="text-xs font-medium text-[var(--fg-muted)]">
                      {t('labObjectiveSeasonal')}
                      <input
                        value={brief.season ?? ''}
                        onChange={(event) => setBrief((current) => ({ ...current, season: event.target.value }))}
                        placeholder={t('labSeasonPlaceholder')}
                        className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
                      />
                    </label>
                  )}

                  <label className="text-xs font-medium text-[var(--fg-muted)]">
                    {t('labMaxPrep')}
                    <input
                      type="number"
                      min={0}
                      value={brief.max_prep_time_mins ?? 0}
                      onChange={(event) => setBrief((current) => ({ ...current, max_prep_time_mins: Number(event.target.value) }))}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-[var(--fg-muted)]">
                    {t('labMustUse')}
                    <input
                      value={(brief.must_use ?? []).join(', ')}
                      onChange={(event) => setBrief((current) => ({ ...current, must_use: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) }))}
                      placeholder={t('labIngredientsPlaceholder')}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-[var(--fg-muted)] sm:col-span-2">
                    {t('labConstraints')}
                    <textarea
                      value={brief.notes ?? ''}
                      onChange={(event) => setBrief((current) => ({ ...current, notes: event.target.value }))}
                      placeholder={t('labConstraintsPlaceholder')}
                      rows={2}
                      className="mt-1.5 w-full resize-none rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
                    />
                  </label>
                </div>
              </details>

            </div>
          </div>
        </div>
      </section>

      {canManage && pickerOpen && (
        <MenuItemPicker restaurantId={restaurantId} onPick={handlePickConfirm} onClose={() => setPickerOpen(false)} />
      )}
    </>
  );
}

function StepNumber({ value }: { value: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-xs font-semibold tabular-nums text-[var(--fg-muted)]">
      {value}
    </span>
  );
}
