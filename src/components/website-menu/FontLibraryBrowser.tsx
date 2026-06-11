'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExtraFont } from '@/lib/api';
import {
  CATEGORY_LABELS, isCuratedFont, loadFontPreview,
  FONT_PREVIEW_LATIN, FONT_PREVIEW_HEBREW, type FontCategory,
} from '@/lib/website-fonts';

// Catalog entry shape written by scripts/fetch-google-fonts-catalog.mjs
// (short keys keep the lazy chunk small).
type CatalogEntry = { f: string; c: FontCategory; w: number[]; h: boolean; p: number };

const PAGE_SIZE = 60;

function FontRow({
  entry, added, curated, onAdd, onRemove,
}: {
  entry: CatalogEntry;
  added: boolean;
  curated: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (visible) loadFontPreview(entry.f, entry.h);
  }, [visible, entry]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--divider)] px-3 py-2.5"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-primary truncate">{entry.f}</span>
          <span className="text-[9px] uppercase tracking-wider text-fg-tertiary shrink-0">
            {CATEGORY_LABELS[entry.c]}
          </span>
          {entry.h && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 font-medium shrink-0">
              עברית
            </span>
          )}
        </div>
        <div
          className="text-lg text-fg-primary truncate mt-0.5"
          style={{ fontFamily: visible ? `"${entry.f}", system-ui, sans-serif` : undefined }}
        >
          {FONT_PREVIEW_LATIN}
          {entry.h && <span dir="rtl">{FONT_PREVIEW_HEBREW}</span>}
        </div>
      </div>
      {curated ? (
        <span className="text-[10px] text-fg-tertiary shrink-0">Déjà incluse</span>
      ) : added ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border border-[var(--divider)] text-fg-secondary hover:text-red-500 hover:border-red-300 transition-colors"
        >
          Retirer
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          Ajouter
        </button>
      )}
    </div>
  );
}

type Props = {
  extraFonts: ExtraFont[];
  onAdd: (font: ExtraFont) => void;
  onRemove: (family: string) => void;
  onClose: () => void;
};

export function FontLibraryBrowser({ extraFonts, onAdd, onRemove, onClose }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontCategory | null>(null);
  const [hebrewOnly, setHebrewOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/google-fonts-catalog.json').then((mod) => {
      if (!cancelled) setCatalog(mod.default as unknown as CatalogEntry[]);
    });
    return () => { cancelled = true; };
  }, []);

  const addedFamilies = useMemo(() => new Set(extraFonts.map((f) => f.family)), [extraFonts]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.filter((e) =>
      (!q || e.f.toLowerCase().includes(q)) &&
      (!category || e.c === category) &&
      (!hebrewOnly || e.h),
    );
  }, [catalog, query, category, hebrewOnly]);

  // Reset pagination whenever the filter changes.
  useEffect(() => { setLimit(PAGE_SIZE); }, [query, category, hebrewOnly]);

  const CATEGORY_CHIPS: FontCategory[] = ['sans', 'serif', 'display', 'handwriting', 'mono'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-3 border-b border-[var(--divider)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-fg-primary">Parcourir Google Fonts</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-fg-tertiary hover:text-fg-primary text-lg leading-none px-1"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher parmi les polices Google Fonts..."
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  category === c
                    ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                    : 'border-[var(--divider)] text-fg-secondary hover:border-fg-tertiary'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHebrewOnly(!hebrewOnly)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                hebrewOnly
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                  : 'border-[var(--divider)] text-fg-secondary hover:border-fg-tertiary'
              }`}
            >
              Compatible hébreu
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-3 flex flex-col gap-2">
          {!catalog && (
            <p className="text-xs text-fg-tertiary text-center py-8">Chargement du catalogue...</p>
          )}
          {catalog && results.length === 0 && (
            <p className="text-xs text-fg-tertiary text-center py-8">Aucune police trouvée.</p>
          )}
          {results.slice(0, limit).map((e) => (
            <FontRow
              key={e.f}
              entry={e}
              curated={isCuratedFont(e.f)}
              added={addedFamilies.has(e.f)}
              onAdd={() => onAdd({ family: e.f, category: e.c, weights: e.w, supportsHebrew: e.h })}
              onRemove={() => onRemove(e.f)}
            />
          ))}
          {results.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(limit + PAGE_SIZE)}
              className="text-xs text-brand-500 hover:underline py-2"
            >
              Afficher plus ({results.length - limit} restantes)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
