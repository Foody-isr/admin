'use client';

// Segmented type picker for the Détails tab. Replaces the old `<Select>`
// dropdown with two cards: the form's tab structure adapts to the choice,
// so the picker is the primary surface for surfacing what each type is for.

import { useId } from 'react';
import { Box, Boxes } from 'lucide-react';
import type { ItemType } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

interface Props {
  value: ItemType;
  onChange: (next: ItemType) => void;
}

export default function TypePickerCards({ value, onChange }: Props) {
  const { t } = useI18n();
  const group = useId();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s-3)]">
      <TypeCard
        selected={value === 'food_and_beverage'}
        name={group}
        disabled={!canEdit}
        icon={<Box className="w-4 h-4" />}
        title={t('typeArticle')}
        tagline={t('typeArticleTagline')}
        onClick={() => canEdit && value !== 'food_and_beverage' && onChange('food_and_beverage')}
      />
      <TypeCard
        selected={value === 'combo'}
        name={group}
        disabled={!canEdit}
        icon={<Boxes className="w-4 h-4" />}
        title={t('typeCombo')}
        tagline={t('typeComboTagline')}
        onClick={() => canEdit && value !== 'combo' && onChange('combo')}
      />
    </div>
  );
}

interface CardProps {
  selected: boolean;
  name: string;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  onClick: () => void;
}

function TypeCard({ selected, name, disabled, icon, title, tagline, onClick }: CardProps) {
  return (
    <label
      className={`text-start flex items-center gap-[var(--s-3)] rounded-r-lg p-[var(--s-3)] transition-[border-color,box-shadow] duration-fast ease-out cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand-ink)] ${
        selected
          ? 'border border-[var(--action)] bg-[var(--brand-soft)]'
          : 'border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]'
      }`}
    >
      <input className="size-4 shrink-0 accent-[var(--brand-500)]" type="radio" name={name} checked={selected} disabled={disabled} onChange={onClick} />
      <div
        className="w-8 h-8 rounded-r-md grid place-items-center text-[var(--summary-fg)] bg-[var(--summary-bg)] shrink-0"
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-fs-sm font-semibold text-[var(--fg)]">{title}</span>

        </div>
        <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5 leading-relaxed">{tagline}</p>
      </div>
    </label>
  );
}
