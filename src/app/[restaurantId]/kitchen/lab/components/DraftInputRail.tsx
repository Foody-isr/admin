'use client';

import { useState } from 'react';
import { BookOpenIcon, CalendarDaysIcon, ChefHatIcon, PackageOpenIcon, RefreshCwIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react';
import { labGenerateDrafts } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { MenuItemPicker } from './MenuItemPicker';
import type { RecipeBrief, RecipeObjective } from '../types';

const OBJECTIVES: { value: RecipeObjective; icon: typeof TrendingUpIcon; labelKey: string }[] = [
  { value: 'optimize_profit', icon: TrendingUpIcon, labelKey: 'labObjectiveProfit' },
  { value: 'refresh_menu', icon: RefreshCwIcon, labelKey: 'labObjectiveRefresh' },
  { value: 'seasonal', icon: CalendarDaysIcon, labelKey: 'labObjectiveSeasonal' },
  { value: 'use_stock', icon: PackageOpenIcon, labelKey: 'labObjectiveStock' },
  { value: 'signature', icon: ChefHatIcon, labelKey: 'labObjectiveSignature' },
];

/**
 * DraftInputRail — left-rail input area for the Recipe Lab.
 *
 * Two paths to generate recipe drafts:
 * 1. Free-text: type dish names (one per line) → "Generate" button.
 * 2. Library: pick existing menu items via the MenuItemPicker modal.
 *
 * After a successful generate the polling in useDraftQueue picks up the new
 * drafts within 3 s. onAfterGenerate is called for an explicit refetch when
 * the caller wants faster feedback.
 * // TODO: wire explicit refetch for sub-second feedback once the server
 *           returns the created draft IDs synchronously (#github-issue).
 */
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

  /** Parse the textarea into a trimmed, non-empty list of dish names. */
  const parseDishNames = (raw: string): string[] =>
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

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
      await labGenerateDrafts(restaurantId, {
        menu_item_ids: ids.map(String),
        locale,
        brief,
      });
      onAfterGenerate?.();
    } finally {
      setSubmitting(false);
    }
  };

  const dishNames = parseDishNames(text);
  const canGenerate = dishNames.length > 0 && !submitting;

  return (
    <>
      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--fg)]">{t('labIntentTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{t('labIntentHelp')}</p>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {OBJECTIVES.map(({ value, icon: Icon, labelKey }) => {
            const active = brief.objective === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setBrief((b) => ({ ...b, objective: value }))}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${active ? 'border-[var(--brand-500)] bg-[var(--surface-2)] text-[var(--fg)] ring-1 ring-[var(--brand-500)]' : 'border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'}`}
              >
                <Icon className="h-4 w-4" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>

        <label className="block text-xs text-[var(--fg-muted)]">
          {t('labStockPolicy')}
          <select
            value={brief.stock_policy}
            onChange={(e) => setBrief((b) => ({ ...b, stock_policy: e.target.value as RecipeBrief['stock_policy'] }))}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="existing_only">{t('labStockOnly')}</option>
            <option value="prefer_existing">{t('labStockPrefer')}</option>
            <option value="allow_new">{t('labStockAllowNew')}</option>
          </select>
        </label>

        <label className="block text-xs text-[var(--fg-muted)]">
          <span className="flex justify-between"><span>{t('labCreativity')}</span><strong>{brief.creativity}%</strong></span>
          <input
            type="range" min={0} max={100} step={5} value={brief.creativity}
            onChange={(e) => setBrief((b) => ({ ...b, creativity: Number(e.target.value) }))}
            className="mt-1 w-full accent-[var(--brand-500)]"
          />
          <span className="flex justify-between text-[10px]"><span>{t('labFamiliar')}</span><span>{t('labBold')}</span></span>
        </label>

        {(brief.objective === 'seasonal') && (
          <input
            value={brief.season ?? ''}
            onChange={(e) => setBrief((b) => ({ ...b, season: e.target.value }))}
            placeholder={t('labSeasonPlaceholder')}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)]"
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[var(--fg-muted)]">
            {t('labMaxPrep')}
            <input
              type="number" min={0} value={brief.max_prep_time_mins ?? 0}
              onChange={(e) => setBrief((b) => ({ ...b, max_prep_time_mins: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-sm text-[var(--fg)]"
            />
          </label>
          <label className="text-xs text-[var(--fg-muted)]">
            {t('labMustUse')}
            <input
              value={(brief.must_use ?? []).join(', ')}
              onChange={(e) => setBrief((b) => ({ ...b, must_use: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
              placeholder={t('labIngredientsPlaceholder')}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-sm text-[var(--fg)]"
            />
          </label>
        </div>

        <textarea
          value={brief.notes ?? ''}
          onChange={(e) => setBrief((b) => ({ ...b, notes: e.target.value }))}
          placeholder={t('labConstraintsPlaceholder')}
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)]"
        />

        <div className="border-t border-[var(--line)] pt-3">
          <p className="mb-2 text-sm font-semibold text-[var(--fg)]">{t('labDishTitle')}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('labDishNamesPlaceholder')}
          rows={6}
          disabled={submitting}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] resize-none focus:outline-none focus:border-[var(--brand-500)] transition-colors disabled:opacity-50"
        />

        </div>

        {canManage && (
          <div className="flex flex-col gap-2">
            {/* Primary CTA: generate from typed dish names */}
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <SparklesIcon />
              {submitting ? t('labLoading') : t('labGenerate')}
            </Button>

            {/* Secondary CTA: open library picker */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center"
              onClick={() => setPickerOpen(true)}
              disabled={submitting}
            >
              <BookOpenIcon />
              {t('labFromLibrary')}
            </Button>
          </div>
        )}
      </section>

      {canManage && pickerOpen && (
        <MenuItemPicker
          restaurantId={restaurantId}
          onPick={handlePickConfirm}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
