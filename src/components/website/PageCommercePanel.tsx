'use client';

// Website Builder — per-page commerce connection panel for the LEGACY builder.
//
// Wraps the shared PageCommerce picker: maps the legacy builder's activePage to
// its WebsitePage (from the draft's top-level pages), and saves via the isolated
// PUT .../website-pages/:pageId/settings endpoint (NOT the draft snapshot), so it
// cannot disturb the legacy builder's autosave/publish. Renders nothing for
// pages that have no WebsitePage row (e.g. the site-footer holder).

import { useState } from 'react';
import { PageCommerce } from './PageCommerce';
import { setWebsitePageSettings, type DraftPagePayload } from '@/lib/api';

// The legacy builder's activePage keys ('home' | 'menu' | 'catering' | '_site'
// | <custom slug>) map to a WebsitePage slug — 'menu' hosts sections under the
// reserved 'order' slug.
function pageSlugFor(activePage: string): string {
  return activePage === 'menu' ? 'order' : activePage;
}

export function PageCommercePanel({
  restaurantId,
  activePage,
  websitePages,
  onUpdated,
}: {
  restaurantId: number;
  activePage: string;
  websitePages: DraftPagePayload[];
  onUpdated: (pages: DraftPagePayload[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const slug = pageSlugFor(activePage);
  const page = websitePages.find((p) => p.slug === slug);
  const pageId = page?.id;
  if (!page || pageId == null || slug === '_site') return null;

  async function save(settings: Record<string, unknown>) {
    setBusy(true);
    onUpdated(websitePages.map((p) => (p.id === pageId ? { ...p, settings } : p))); // optimistic
    try {
      await setWebsitePageSettings(restaurantId, pageId!, settings);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-divider p-3" style={{ background: 'var(--surface)' }}>
      <PageCommerce page={page} rid={restaurantId} onSave={save} busy={busy} />
    </div>
  );
}
