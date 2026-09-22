'use client';

import { BookOpenCheckIcon, ChefHatIcon, SparklesIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type LabEntryMode = 'manual' | 'ai';

/** First decision in the Lab: document an existing dish or create with AI. */
export function LabEntryChoice({ onChoose }: { onChoose: (mode: LabEntryMode) => void }) {
  const { t } = useI18n();

  return (
    <section aria-labelledby="lab-entry-title">
      <div className="mb-5 max-w-3xl sm:mb-6">
        <h2 id="lab-entry-title" className="text-2xl font-semibold tracking-[-0.035em] text-[var(--fg)] sm:text-4xl">
          {t('labEntryTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--fg-muted)]">{t('labEntryHelp')}</p>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose('manual')}
          className="group relative min-h-[210px] overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-start shadow-[var(--shadow-1)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--brand-500)] hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:min-h-[245px] sm:rounded-[20px] sm:p-7"
        >
          <span className="absolute inset-y-0 start-0 w-1.5 bg-[var(--brand-500)]" aria-hidden />
          <span className="flex items-start justify-between gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[color-mix(in_oklab,var(--brand-500)_11%,var(--surface))] text-[var(--brand-500)]">
              <BookOpenCheckIcon className="h-5 w-5" />
            </span>
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fg-muted)]">{t('labWithoutAi')}</span>
          </span>
          <span className="mt-5 block text-xl font-semibold tracking-[-0.025em] text-[var(--fg)] sm:mt-6">{t('labManualEntryTitle')}</span>
          <span className="mt-2 block max-w-[46ch] text-sm leading-6 text-[var(--fg-muted)]">{t('labManualEntryHelp')}</span>
          <span className="mt-5 inline-flex border-b border-current pb-0.5 text-sm font-semibold text-[var(--brand-500)] sm:mt-6">{t('labChooseExistingDish')}</span>
        </button>

        <button
          type="button"
          onClick={() => onChoose('ai')}
          className="group min-h-[210px] rounded-[18px] border border-[var(--line)] bg-[var(--surface-2)] p-5 text-start transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:min-h-[245px] sm:rounded-[20px] sm:p-7"
        >
          <span className="flex items-start justify-between gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-1)]">
              <ChefHatIcon className="h-5 w-5" />
            </span>
            <SparklesIcon className="h-5 w-5 text-[var(--brand-500)]" />
          </span>
          <span className="mt-5 block text-xl font-semibold tracking-[-0.025em] text-[var(--fg)] sm:mt-6">{t('labAiEntryTitle')}</span>
          <span className="mt-2 block max-w-[46ch] text-sm leading-6 text-[var(--fg-muted)]">{t('labAiEntryHelp')}</span>
          <span className="mt-5 inline-flex border-b border-current pb-0.5 text-sm font-semibold text-[var(--fg)] sm:mt-6">{t('labStartAiBrief')}</span>
        </button>
      </div>
    </section>
  );
}
