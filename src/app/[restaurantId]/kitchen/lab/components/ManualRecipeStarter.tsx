'use client';

import { useState } from 'react';
import { BookOpenCheckIcon, CalculatorIcon, LoaderCircleIcon, PackagePlusIcon } from 'lucide-react';
import { labCreateManualDraft } from '@/lib/api';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { MenuItemPicker } from './MenuItemPicker';

/** Starts a ready manual draft for one existing menu item, without an AI call. */
export function ManualRecipeStarter({
  restaurantId,
  canManage,
  onCreated,
}: {
  restaurantId: number;
  canManage: boolean;
  onCreated: (draftId: number) => void;
}) {
  const { t, locale } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async (ids: number[]) => {
    const menuItemId = ids[0];
    if (!menuItemId) return;
    setPickerOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const draft = await labCreateManualDraft(restaurantId, { menu_item_id: menuItemId, locale });
      onCreated(draft.id);
    } catch (cause) {
      console.error('Failed to create manual recipe draft', cause);
      setError(cause instanceof Error ? cause.message : t('labManualCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
        <div className="border-b border-[var(--line)] px-5 py-6 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[color-mix(in_oklab,var(--brand-500)_11%,var(--surface))] text-[var(--brand-500)]">
              <BookOpenCheckIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--fg)]">{t('labManualStartTitle')}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">{t('labManualStartHelp')}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-[var(--line)] p-5 md:border-b-0 md:border-e md:p-7">
            <p className="text-sm font-semibold text-[var(--fg)]">{t('labManualStepChoose')}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{t('labManualStepChooseHelp')}</p>
            {canManage && (
              <Button size="lg" className="mt-5 min-h-11 w-full md:w-auto md:min-w-56" onClick={() => setPickerOpen(true)} disabled={submitting}>
                {submitting ? <LoaderCircleIcon className="animate-spin" /> : <PackagePlusIcon />}
                {submitting ? t('labOpeningRecipe') : t('labChooseExistingDish')}
              </Button>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-[var(--danger-500)]">{error}</p>}
          </div>

          <div className="bg-[var(--surface-2)] p-5 md:p-7">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <CalculatorIcon className="h-4 w-4 text-[var(--success-500)]" /> {t('labManualAutomationTitle')}
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-[var(--fg-muted)]">
              <li>• {t('labManualAutomationCosts')}</li>
              <li>• {t('labManualAutomationMargin')}</li>
              <li>• {t('labManualAutomationSave')}</li>
            </ul>
            <p className="mt-5 rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--fg-muted)]">{t('labManualNoAiNotice')}</p>
          </div>
        </div>
      </section>

      {canManage && pickerOpen && (
        <MenuItemPicker
          restaurantId={restaurantId}
          selectionMode="single"
          title={t('labChooseDishTitle')}
          description={t('labChooseDishHelp')}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
