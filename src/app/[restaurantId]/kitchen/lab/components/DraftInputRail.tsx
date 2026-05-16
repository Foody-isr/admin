'use client';

import { useState } from 'react';
import { BookOpenIcon, SparklesIcon } from 'lucide-react';
import { labGenerateDrafts } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { MenuItemPicker } from './MenuItemPicker';

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
}: {
  restaurantId: number;
  onAfterGenerate?: () => void;
}) {
  const { t } = useI18n();

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      await labGenerateDrafts(restaurantId, { dish_names: dishNames });
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
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
          {t('labAddDishes')}
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('labDishNamesPlaceholder')}
          rows={6}
          disabled={submitting}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] resize-none focus:outline-none focus:border-[var(--brand-500)] transition-colors disabled:opacity-50"
        />

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
      </section>

      {pickerOpen && (
        <MenuItemPicker
          restaurantId={restaurantId}
          onPick={handlePickConfirm}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
