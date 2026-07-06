'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExtraFont, FontFace } from '@/lib/api';
import {
  fontsByCategory, CATEGORY_LABELS, isCuratedFont, loadFontPreview,
  detectFontVariant, suggestFamilyName, WEIGHT_LABELS,
  type CustomFontSource,
} from '@/lib/website-fonts';

// Weight options offered per uploaded file (auto-filled from the filename).
const WEIGHT_CHOICES = [100, 200, 300, 400, 500, 600, 700, 800, 900];

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

type Option = { family: string; supportsHebrew: boolean; catalog?: CatalogEntry; custom?: CustomFontSource };
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
    if (visible) loadFontPreview(option.family, option.supportsHebrew, option.custom);
  }, [visible, option]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      title={option.family}
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
  /** Uploads a custom font file and resolves with its stored URL + @font-face
   *  format hint. When provided, an "Importer une police" action appears. */
  onUploadFont?: (file: File) => Promise<{ url: string; format: string }>;
};

// Accepted custom-font file extensions (mirrors the server's isValidFontType).
const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf';

/** Canva-style font picker: one search box over the restaurant's fonts, the
 *  curated list AND the full Google Fonts catalog. Picking a catalog font
 *  adds it to the restaurant's fonts automatically — no separate library
 *  management step. */
export function FontSelect({ value, onChange, extraFonts, defaultLabel, onUploadFont }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(catalogCache);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Custom-font upload sub-panel state (only reachable when onUploadFont is set).
  // One family can carry several files (Léger/Solide/…), each an @font-face at
  // its own weight/style — the weight is auto-detected from the filename.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadVariants, setUploadVariants] = useState<{ weight: number; style: 'normal' | 'italic' }[]>([]);
  const [uploadName, setUploadName] = useState('');
  const [uploadHebrew, setUploadHebrew] = useState(false);
  const [uploadLicensed, setUploadLicensed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function resetUpload() {
    setUploadOpen(false);
    setUploadFiles([]);
    setUploadVariants([]);
    setUploadName('');
    setUploadHebrew(false);
    setUploadLicensed(false);
    setUploading(false);
    setUploadDone(0);
    setUploadError(null);
  }

  useEffect(() => {
    if (!open) { resetUpload(); return; }
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
      push('Mes polices', extraFonts.map((f) => ({
        family: f.family,
        supportsHebrew: f.supportsHebrew,
        custom: (f.faces?.length || f.url)
          ? { url: f.url, format: f.format, faces: f.faces }
          : undefined,
      })));
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

  function chooseFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    setUploadError(null);
    setUploadFiles(files);
    setUploadVariants(files.map((f) => detectFontVariant(f.name)));
    // Prefill the family name from the common part of the file names.
    if (files.length > 0 && !uploadName.trim()) setUploadName(suggestFamilyName(files.map((f) => f.name)));
  }

  function setVariantWeight(i: number, weight: number) {
    setUploadVariants((v) => v.map((x, idx) => (idx === i ? { ...x, weight } : x)));
  }

  const canSubmitUpload = uploadFiles.length > 0 && uploadName.trim().length > 0 && uploadLicensed && !uploading;

  async function submitUpload() {
    const name = uploadName.trim();
    if (!onUploadFont || uploadFiles.length === 0 || !name || !uploadLicensed || uploading) return;
    setUploading(true);
    setUploadError(null);
    setUploadDone(0);
    try {
      // Upload each variant file, then group them under one family name — each
      // file becomes an @font-face at its detected weight/style.
      const faces: FontFace[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        const { url, format } = await onUploadFont(uploadFiles[i]);
        const v = uploadVariants[i] ?? { weight: 400, style: 'normal' as const };
        faces.push({ url, format, weight: v.weight, style: v.style });
        setUploadDone(i + 1);
      }
      const weights = Array.from(new Set(faces.map((f) => f.weight ?? 400))).sort((a, b) => a - b);
      const picked: ExtraFont = {
        family: name, category: 'custom', weights, supportsHebrew: uploadHebrew, faces,
      };
      onChange(name, picked);
      resetUpload();
      setOpen(false);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Échec de l’import.');
      setUploading(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs text-start focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <span className="truncate" title={value || defaultLabel} style={value ? { fontFamily: `"${value}"` } : undefined}>
          {value || defaultLabel}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-fg-tertiary">
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] shadow-lg">
          {uploadOpen ? (
            <div className="p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-fg-primary">Importer une police</span>
                <button
                  type="button"
                  onClick={resetUpload}
                  className="text-[11px] text-fg-tertiary hover:text-fg-primary"
                >
                  Annuler
                </button>
              </div>
              <label className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-dashed border-divider text-[11px] text-fg-secondary cursor-pointer hover:border-fg-tertiary">
                <input
                  type="file"
                  accept={FONT_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => chooseFiles(e.target.files)}
                />
                <span className="truncate">
                  {uploadFiles.length > 0
                    ? `${uploadFiles.length} fichier${uploadFiles.length > 1 ? 's' : ''} sélectionné${uploadFiles.length > 1 ? 's' : ''}`
                    : 'Choisir un ou plusieurs fichiers (.woff2, .woff, .ttf, .otf)'}
                </span>
              </label>
              <p className="text-[10px] text-fg-tertiary leading-relaxed -mt-0.5">
                Ajoutez chaque variante (Léger, Solide, Gras…) comme fichier séparé — elles
                seront regroupées sous une même police.
              </p>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Nom de la police"
                className="w-full px-2 py-1.5 rounded-md border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              />
              {uploadFiles.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">Variantes</span>
                  {uploadFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-[11px] text-fg-secondary" title={f.name}>
                        {f.name}
                        {uploadVariants[i]?.style === 'italic' && (
                          <span className="ml-1 italic text-fg-tertiary">italique</span>
                        )}
                      </span>
                      <select
                        value={uploadVariants[i]?.weight ?? 400}
                        onChange={(e) => setVariantWeight(i, Number(e.target.value))}
                        className="w-[104px] shrink-0 px-2 py-1 rounded-md border border-divider bg-[var(--surface)] text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                      >
                        {WEIGHT_CHOICES.map((w) => (
                          <option key={w} value={w}>{WEIGHT_LABELS[w] ?? w} ({w})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-[11px] text-fg-secondary cursor-pointer">
                <input type="checkbox" checked={uploadHebrew} onChange={(e) => setUploadHebrew(e.target.checked)} />
                Cette police contient l&apos;hébreu
              </label>
              <label className="flex items-start gap-2 text-[11px] text-fg-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadLicensed}
                  onChange={(e) => setUploadLicensed(e.target.checked)}
                  className="mt-0.5"
                />
                J&apos;ai le droit d&apos;utiliser cette police sur ce site.
              </label>
              {uploadError && <p className="text-[11px] text-red-500">{uploadError}</p>}
              <button
                type="button"
                disabled={!canSubmitUpload}
                onClick={submitUpload}
                className="w-full px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-brand-500 text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploading
                  ? `Import… (${uploadDone}/${uploadFiles.length})`
                  : 'Importer et utiliser'}
              </button>
            </div>
          ) : (
            <>
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
              {onUploadFont && (
                <div className="p-1.5 border-t border-[var(--divider)]">
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-brand-500 hover:bg-brand-500/10 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
                      <path d="M6 2.5v7M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Importer une police
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
