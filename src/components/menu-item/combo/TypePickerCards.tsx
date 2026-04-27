'use client';

// Segmented type picker for the Détails tab. Replaces the old `<Select>`
// dropdown with two cards: the form's tab structure adapts to the choice,
// so the picker is the primary surface for surfacing what each type is for.

import { Box, Boxes, Check } from 'lucide-react';
import type { ItemType } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Props {
  value: ItemType;
  onChange: (next: ItemType) => void;
}

export default function TypePickerCards({ value, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s-3)]">
      <TypeCard
        selected={value === 'food_and_beverage'}
        accentColor="#16a34a"
        icon={<Box className="w-4 h-4" />}
        title={t('typeArticle')}
        tagline={t('typeArticleTagline')}
        example={t('typeArticleExample')}
        tabs={[t('tabDetails'), t('tabModifiers'), t('tabRecipe'), t('tabCost')]}
        onClick={() => value !== 'food_and_beverage' && onChange('food_and_beverage')}
      />
      <TypeCard
        selected={value === 'combo'}
        accentColor="var(--brand-500)"
        icon={<Boxes className="w-4 h-4" />}
        title={t('typeCombo')}
        tagline={t('typeComboTagline')}
        example={t('typeComboExample')}
        tabs={[t('tabDetails'), t('tabComposition'), t('tabCost')]}
        onClick={() => value !== 'combo' && onChange('combo')}
      />
    </div>
  );
}

interface CardProps {
  selected: boolean;
  accentColor: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  example: string;
  tabs: string[];
  onClick: () => void;
}

function TypeCard({ selected, accentColor, icon, title, tagline, example, tabs, onClick }: CardProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`text-start flex items-start gap-[var(--s-3)] rounded-r-lg p-[var(--s-4)] transition-[border-color,box-shadow] duration-fast ease-out cursor-pointer ${
        selected
          ? 'border border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_5%,var(--surface))] shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-500)_15%,transparent)]'
          : 'border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]'
      }`}
    >
      <div
        className="w-9 h-9 rounded-r-md grid place-items-center text-white shrink-0 mt-0.5"
        style={{ background: accentColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-fs-md font-semibold text-[var(--fg)]">{title}</span>
          {selected && (
            <span
              className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-r-sm text-white"
              style={{ background: accentColor }}
            >
              <Check className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          )}
        </div>
        <p className="text-fs-sm text-[var(--fg-muted)] mt-1">{tagline}</p>
        <p className="text-fs-xs text-[var(--fg-subtle)] italic mt-1.5">≫ {example}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-[var(--s-3)]">
          <span className="text-fs-xs text-[var(--fg-subtle)]">{t('typeTabsLabel')}</span>
          {tabs.map((tabLabel) => (
            <span
              key={tabLabel}
              className={`inline-flex items-center h-[20px] px-2 rounded-r-sm text-fs-xs ${
                selected
                  ? 'bg-[color-mix(in_oklab,var(--brand-500)_12%,transparent)] text-[var(--brand-500)] border border-[color-mix(in_oklab,var(--brand-500)_30%,transparent)]'
                  : 'bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]'
              }`}
            >
              {tabLabel}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
