'use client';

import { useCallback, useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { listAllItems, type MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/**
 * MenuItemPicker — modal that lets the user pick one or more menu items
 * from the restaurant's global item catalog to seed a recipe-lab generation.
 */
export function MenuItemPicker({
  restaurantId,
  onPick,
  onClose,
}: {
  restaurantId: number;
  onPick: (ids: number[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchItems = useCallback(async () => {
    try {
      const data = await listAllItems(restaurantId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleItem = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size > 0) onPick(Array.from(selected));
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card — stop backdrop propagation */}
      <div
        className="relative bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <h3 className="font-semibold text-[var(--fg)]">
            {t('labPickItems')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors"
            aria-label={t('cancel')}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labLoading')}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('labPickerEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--surface-2)] transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 accent-[var(--brand-500)] cursor-pointer"
                    />
                    <span className="flex-1 text-sm text-[var(--fg)] truncate">
                      {item.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--line)]">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            {t('labConfirm')} {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
