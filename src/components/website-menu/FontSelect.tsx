'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExtraFont } from '@/lib/api';
import {
  fontsByCategory, CATEGORY_LABELS, isCuratedFont, loadFontPreview,
} from '@/lib/website-fonts';

// Catalog entry shape written by scripts/fetch-google-fonts-catalog.mjs
// (short keys keep the lazy chunk small).
type CatalogEntry = { f: string; c: ExtraFont['category']; w: number[]; h: boolean; p: number };

const CATALOG_RESULTS_MAX = 20;

// The full Google Fonts catalog is lazy-loaded once per session, shared by
// every FontSelect instance, the first time a picker opens.
let catalogCache: CatalogEntry[] | null = null;
let catalogPromise: Promise<CatalogEntry[]> | null = null;
function loadCatalog(): Promise<CatalogEntry[]> {
  if (catalogCache) return Promise.resolve(catalogCache);
  catalogPromise ??= import('@/lib/google-fonts-catalog.json').then((m) => {
    catalogCache = m.default as unknown as CatalogEntry[];
    return catalogCache;
  });
  return catalogPromise;
}

type Option = { family: string; supportsHebrew: boolean; catalog?: CatalogEntry };
type Group = { label: string; options: Option[] };

// Row that renders the family name in its own face, lazy-loading the tiny
// preview stylesheet only when scrolled into view.
function OptionRow({
  option, selected, onPick,
}: {
  option: Option;
  selected: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
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
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (visible) loadFontPreview(option.family, option.supportsHebrew);
  }, [visible, option]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-start transition-colors ${
        selected ? 'bg-brand-500/10 text-brand-500' : 'hover:bg-surface-subtle text-fg-primary'
      }`}
    >
      <span
        className="text-[13px] truncate"
        style={{ fontFamily: visible ? `"${option.family}", system-ui, sans-serif` : undefined }}
      >
        {option.family}
      </span>
      {option.supportsHebrew && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 font-medium shrink-0">
          עברית
        </span>
      )}
    </button>
  );
}

type Props = {
  /** Selected family; empty string = inherit the theme default. */
  value: string;
  /** `picked` is set when the choice came from the full Google Fonts catalog
   *  (i.e. it is not curated) — the owner should persist it in
   *  typography.extraFonts so the public site can load its real weights. */
  onChange: (family: string, picked?: ExtraFont) => void;
  /** Fonts already added to the restaurant's library — shown as "Mes polices". */
  extraFonts: ExtraFont[];
  /** Label of the inherit option, e.g. `Police du thème (Switzer)`. */
  defaultLabel: string;
};

/** Canva-style font picker: one search box over the restaurant's fonts, the
 *  curated list AND the full Google Fonts catalog. Picking a catalog font
 *  adds it to the restaurant's fonts automatically — no separate library
 *  management step. */
export function FontSelect({ value, onChange, extraFonts, defaultLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(catalogCache);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
    loadCatalog().then(setCatalog);
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();

  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    const shown = new Set<string>();

    const push = (label: string, options: Option[]) => {
      const filtered = options.filter(
        (o) => !shown.has(o.family) && (!q || o.family.toLowerCase().includes(q)),
      );
      if (filtered.length === 0) return;
      filtered.forEach((o) => shown.add(o.family));
      out.push({ label, options: filtered });
    };

    if (extraFonts.length > 0) {
      push('Mes polices', extraFonts.map((f) => ({ family: f.family, supportsHebrew: f.supportsHebrew })));
    }
    for (const g of fontsByCategory()) {
      push(CATEGORY_LABELS[g.category], g.fonts.map((f) => ({ family: f.family, supportsHebrew: f.supportsHebrew })));
    }
    // Searching reaches the whole Google Fonts catalog (most popular first);
    // without a query the closed set above keeps the list scannable.
    if (q && catalog) {
      push(
        'Google Fonts',
        catalog
          .filter((e) => e.f.toLowerCase().includes(q))
          .slice(0, CATALOG_RESULTS_MAX)
          .map((e) => ({ family: e.f, supportsHebrew: e.h, catalog: e })),
      );
    }
    // A selected family that is neither curated nor in the library anymore
    // stays selectable until changed.
    if (value && !shown.has(value) && !q) {
      out.push({ label: 'Sélection actuelle', options: [{ family: value, supportsHebrew: false }] });
    }
    return out;
  }, [extraFonts, value, q, catalog]);

  function pick(o: Option) {
    const picked: ExtraFont | undefined = o.catalog && !isCuratedFont(o.family)
      ? { family: o.catalog.f, category: o.catalog.c, weights: o.catalog.w, supportsHebrew: o.catalog.h }
      : undefined;
    onChange(o.family, picked);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs text-start focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <span className="truncate" style={value ? { fontFamily: `"${value}"` } : undefined}>
          {value || defaultLabel}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-fg-tertiary">
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] shadow-lg">
          <div className="p-1.5 border-b border-[var(--divider)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (Google Fonts inclus)..."
              className="w-full px-2 py-1.5 rounded-md border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {!q && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className={`w-full px-2.5 py-1.5 rounded-md text-[13px] text-start transition-colors ${
                  !value ? 'bg-brand-500/10 text-brand-500' : 'hover:bg-surface-subtle text-fg-primary'
                }`}
              >
                {defaultLabel}
              </button>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-2.5 pt-2 pb-1 text-[9px] uppercase tracking-wider text-fg-tertiary">
                  {g.label}
                </div>
                {g.options.map((o) => (
                  <OptionRow
                    key={o.family}
                    option={o}
                    selected={o.family === value}
                    onPick={() => pick(o)}
                  />
                ))}
              </div>
            ))}
            {q && groups.length === 0 && (
              <p className="px-2.5 py-3 text-[11px] text-fg-tertiary text-center">
                {catalog ? 'Aucune police trouvée.' : 'Chargement du catalogue...'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
