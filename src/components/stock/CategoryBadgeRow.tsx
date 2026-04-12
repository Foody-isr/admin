'use client';

import { useMemo } from 'react';
import { StockCategory } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Props {
  categories: StockCategory[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onMoreClick: () => void;
  maxVisible?: number;
}

export default function CategoryBadgeRow({
  categories,
  selected,
  onToggle,
  onMoreClick,
  maxVisible = 6,
}: Props) {
  const { t } = useI18n();

  const ordered = useMemo(() => {
    return [...categories].sort((a, b) => {
      const aSel = selected.has(a.name) ? 0 : 1;
      const bSel = selected.has(b.name) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.name.localeCompare(b.name);
    });
  }, [categories, selected]);

  const visible = ordered.slice(0, maxVisible);
  const hiddenCount = Math.max(0, ordered.length - maxVisible);

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((cat) => {
        const isSelected = selected.has(cat.name);
        return (
          <button
            key={cat.name}
            type="button"
            onClick={() => onToggle(cat.name)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isSelected
                ? 'bg-brand-500 text-white hover:bg-brand-600'
                : 'text-fg-primary hover:bg-[var(--surface-hover)]'
            }`}
            style={
              isSelected
                ? undefined
                : { background: 'var(--surface-subtle)' }
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: cat.color || '#999' }}
            />
            {cat.name}
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onMoreClick}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-fg-primary hover:bg-[var(--surface-hover)] transition-colors"
          style={{ background: 'var(--surface-subtle)' }}
        >
          {t('more')} (+{hiddenCount})
        </button>
      )}
    </div>
  );
}
