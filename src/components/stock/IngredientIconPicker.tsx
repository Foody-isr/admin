'use client';

import { useEffect, useMemo, useState } from 'react';
import { listIngredientIcons, IngredientIcon } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XIcon, SearchIcon, SparklesIcon } from 'lucide-react';

export interface IngredientIconPickerProps {
  restaurantId: number;
  /** Pre-fills the search box. Usually the current stock item name. */
  initialQuery?: string;
  onPick: (icon: IngredientIcon) => void;
  onClose: () => void;
}

/**
 * IngredientIconPicker — restaurant-facing modal that lets the operator
 * pick a curated illustration from the global library. The picker is
 * intentionally read-only; only superadmins can add to or edit the library
 * (via foodybackoffice).
 *
 * Search runs server-side against name / category / slug. Aliases are
 * matched client-side against whatever the server returned, so the operator
 * can find "Tomate" or "עגבנייה" even if those weren't in the server query.
 */
export default function IngredientIconPicker({
  restaurantId,
  initialQuery = '',
  onPick,
  onClose,
}: IngredientIconPickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState(initialQuery);
  const [icons, setIcons] = useState<IngredientIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce: avoid hammering the API on every keystroke. 200ms is
  // imperceptible to the operator but trims request volume by an order of
  // magnitude when typing quickly.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await listIngredientIcons(restaurantId, {
          q: search.trim() || undefined,
          limit: 200,
        });
        if (!cancelled) setIcons(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load library');
          setIcons([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, restaurantId]);

  // Client-side alias matching layered on top of server results — covers
  // the case where the user typed an alias the server query didn't match.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return icons;
    return icons.filter((i) => {
      if (i.name.toLowerCase().includes(q)) return true;
      if (i.category.toLowerCase().includes(q)) return true;
      return (i.aliases || []).some((a) => a.toLowerCase().includes(q));
    });
  }, [icons, search]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-1)] border border-[var(--line)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-[var(--brand-500)]" />
            <h3 className="text-fs-lg font-semibold text-[var(--fg)]">
              {t('pickFromLibrary') || 'Pick from icon library'}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-[var(--line)]">
          <div className="relative">
            <SearchIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchIcons') || 'Search ingredients…'}
              className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg ps-9 pe-3 py-2 text-fs-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-fs-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-[var(--fg-subtle)] text-fs-sm">
              {t('loading') || 'Loading…'}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <SparklesIcon className="w-10 h-10 text-[var(--fg-subtle)] mx-auto mb-3 opacity-40" />
              <p className="text-[var(--fg-muted)] text-fs-sm">
                {search.trim()
                  ? t('noIconsFound') || 'No icons match that search.'
                  : t('noIconsAvailable') || 'No icons in the library yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filtered.map((icon) => (
                <button
                  key={icon.id}
                  onClick={() => onPick(icon)}
                  className="group flex flex-col items-center text-left p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--brand-500)] hover:bg-[var(--brand-500)]/5 transition"
                >
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-gradient-to-br from-[var(--surface-1)] to-[var(--surface-2)] grid place-items-center mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={icon.image_url}
                      alt={icon.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <div className="text-fs-sm font-medium text-[var(--fg)] truncate w-full">
                    {icon.name}
                  </div>
                  {icon.category && (
                    <div className="text-fs-xs text-[var(--fg-subtle)] truncate w-full">
                      {icon.category}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
