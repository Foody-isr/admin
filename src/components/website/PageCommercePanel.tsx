'use client';

// Website Builder — per-page settings panel for the LEGACY builder.
//
// Two per-page controls, both saved to WebsitePage.settings via the isolated
// PUT .../website-pages/:pageId/settings endpoint (NOT the draft snapshot), so
// they can't disturb the legacy builder's autosave/publish:
//   • Commerce connection  — which cartes / catering prestations the page shows.
//   • Appearance override   — per-page colours/fonts that cascade over the global
//                             theme (the site→page cascade).
//
// The panel fetches the live WebsitePage rows itself (the legacy builder's drafts
// don't carry typed pages) and owns a single settings object so the two controls
// never clobber each other. Copy is French pending i18n extraction.

import { useEffect, useState } from 'react';
import { PageCommerce } from './PageCommerce';
import { getWebsitePages, setWebsitePageSettings, type DraftPagePayload } from '@/lib/api';

function pageSlugFor(activePage: string): string {
  return activePage === 'menu' ? 'order' : activePage;
}

export function PageCommercePanel({
  restaurantId,
  activePage,
}: {
  restaurantId: number;
  activePage: string;
}) {
  const [pages, setPages] = useState<DraftPagePayload[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getWebsitePages(restaurantId)
      .then((p) => alive && setPages(p))
      .catch(() => alive && setPages([]));
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const slug = pageSlugFor(activePage);
  const page = pages.find((p) => p.slug === slug);
  const pageId = page?.id;
  if (!page || pageId == null || slug === '_site') return null;

  // Single save target: whichever control changes sends the full merged settings,
  // and we refresh local state so the other control keeps its values.
  async function save(settings: Record<string, unknown>) {
    setBusy(true);
    setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, settings } : p)));
    try {
      await setWebsitePageSettings(restaurantId, pageId!, settings);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-divider p-3" style={{ background: 'var(--surface)' }}>
      <PageCommerce page={page} rid={restaurantId} onSave={save} busy={busy} />
      <PageAppearance page={page} onSave={save} busy={busy} />
    </div>
  );
}

// ── Per-page appearance override (the cascade) ───────────────────────────────

type AppKey = 'bg' | 'ink' | 'accent' | 'headingFont' | 'bodyFont';

const APP_ROWS: { key: AppKey; label: string; kind: 'color' | 'font' }[] = [
  { key: 'bg', label: 'Fond', kind: 'color' },
  { key: 'ink', label: 'Texte', kind: 'color' },
  { key: 'accent', label: 'Accent', kind: 'color' },
  { key: 'headingFont', label: 'Police des titres', kind: 'font' },
  { key: 'bodyFont', label: 'Police du texte', kind: 'font' },
];

// Exported for reuse by the v2 builder (website-v2), which feeds it a page whose
// settings.appearance mirrors the draft's appearance_overrides and maps its
// onSave back onto appearance_overrides — see PageEditor's Apparence tab.
export function PageAppearance({
  page,
  onSave,
  busy,
}: {
  page: DraftPagePayload;
  onSave: (settings: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const settings = (page.settings ?? {}) as Record<string, unknown>;
  const app = (settings.appearance ?? {}) as Record<string, string>;

  function set(key: AppKey, value: string | null) {
    const nextApp: Record<string, string> = { ...app };
    if (value == null || value === '') delete nextApp[key];
    else nextApp[key] = value;
    onSave({ ...settings, appearance: nextApp });
  }

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-secondary">
        Apparence de la page
      </div>
      <div className="space-y-1.5">
        {APP_ROWS.map((row) => {
          const overridden = Object.prototype.hasOwnProperty.call(app, row.key);
          return (
            <div key={row.key} className="flex items-center gap-2 text-xs">
              <button
                onClick={() => set(row.key, overridden ? null : row.kind === 'color' ? '#e06c5a' : 'Inter')}
                disabled={busy}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  overridden
                    ? 'bg-amber-400 text-neutral-900'
                    : 'border border-divider text-fg-secondary'
                }`}
              >
                {overridden ? 'remplacé' : 'hérite'}
              </button>
              <span className="flex-1 text-fg-secondary">{row.label}</span>
              {overridden &&
                (row.kind === 'color' ? (
                  <input
                    type="color"
                    value={app[row.key] || '#e06c5a'}
                    disabled={busy}
                    onChange={(e) => set(row.key, e.target.value)}
                    className="h-6 w-10 cursor-pointer rounded border border-divider"
                  />
                ) : (
                  <input
                    type="text"
                    value={app[row.key] || ''}
                    disabled={busy}
                    placeholder="Inter"
                    onChange={(e) => set(row.key, e.target.value)}
                    className="w-28 rounded border border-divider bg-transparent px-1.5 py-1 text-xs"
                  />
                ))}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-fg-secondary opacity-70">
        Chaque réglage hérite du thème du site. « remplacé » ne change que cette page.
      </p>
    </div>
  );
}
