'use client';

// Confirmation modal shown before switching item type when the form already
// holds type-specific data (recipe ingredients, variants, modifiers, combo
// steps). When all of those are empty, the parent should switch silently.

import { AlertTriangle, Info } from 'lucide-react';
import type { ItemType } from '@/lib/api';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

export interface TypeSwitchLossSummary {
  recipeCount?: number;
  variantsCount?: number;
  modifiersCount?: number;
  stepsCount?: number;
}

interface Props {
  fromType: ItemType;
  toType: ItemType;
  loss: TypeSwitchLossSummary;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function TypeSwitchConfirm({ fromType, toType, loss, onCancel, onConfirm }: Props) {
  const { t } = useI18n();

  const lines: string[] = [];
  if (loss.recipeCount && loss.recipeCount > 0) {
    lines.push(t('typeSwitchLossRecipe').replace('{count}', String(loss.recipeCount)));
  }
  if (loss.variantsCount && loss.variantsCount > 0) {
    lines.push(t('typeSwitchLossVariants').replace('{count}', String(loss.variantsCount)));
  }
  if (loss.modifiersCount && loss.modifiersCount > 0) {
    lines.push(t('typeSwitchLossModifiers').replace('{count}', String(loss.modifiersCount)));
  }
  if (loss.stepsCount && loss.stepsCount > 0) {
    lines.push(t('typeSwitchLossSteps').replace('{count}', String(loss.stepsCount)));
  }

  const fromLabel = fromType === 'combo' ? t('typeCombo') : t('typeArticle');
  const toLabel = toType === 'combo' ? t('typeCombo') : t('typeArticle');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--bg)] border border-[var(--line)] rounded-r-lg shadow-3 w-full max-w-[560px] mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-[var(--s-5)] flex gap-[var(--s-3)] items-start">
          <div
            className="w-9 h-9 rounded-r-md grid place-items-center shrink-0"
            style={{
              background: 'color-mix(in oklab, var(--warning-500) 14%, transparent)',
              color: 'var(--warning-500)',
            }}
          >
            <AlertTriangle className="w-[18px] h-[18px]" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-fs-lg font-semibold text-[var(--fg)] mb-1.5">
              {t('typeSwitchTitle')}
            </h2>
            <p className="text-fs-sm text-[var(--fg-muted)] mb-[var(--s-4)]">
              {t('typeSwitchSubtitleToCombo')
                .replace('{from}', fromLabel)
                .replace('{to}', toLabel)}
            </p>

            {lines.length > 0 && (
              <div
                className="rounded-r-md p-[var(--s-3)] mb-[var(--s-3)] border"
                style={{
                  background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--danger-500) 30%, transparent)',
                }}
              >
                <div
                  className="text-fs-xs font-bold uppercase tracking-[.04em] mb-1.5"
                  style={{ color: 'var(--danger-500)' }}
                >
                  {t('typeSwitchWillBeRemoved')}
                </div>
                <ul className="m-0 ps-[var(--s-4)] text-fs-sm leading-[1.6] list-disc">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-fs-xs text-[var(--fg-subtle)] flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              <span>{t('typeSwitchPreserved')}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-[var(--s-2)] px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--line)] bg-[var(--surface)]">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('cancel') || 'Annuler'}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            {toType === 'combo' ? t('typeSwitchConfirmToCombo') : t('typeSwitchConfirmToArticle')}
          </Button>
        </div>
      </div>
    </div>
  );
}
