'use client';

// Website Builder v2 — the page-centric builder shell.
//
// Replaces the tool-centric legacy builder: you pick a PAGE (rail, left), and
// its content / appearance / settings edit in place (center), with one live
// preview (right). Global theme + navbar live under "Tout le site". This is the
// MVP shell wired to the existing draft API (which now carries typed pages);
// the deep editors + the unified preview protocol land next.
//
// Copy is French (the app's primary UI language) pending i18n extraction before
// merge. Verified by tsc + next build; full runtime verification runs against
// the v2 server on dev.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getWebsiteDraft,
  saveWebsiteDraft,
  publishWebsiteDraft,
  discardWebsiteDraft,
  getRestaurant,
  getThemeCatalog,
  type DraftResponse,
  type DraftPagePayload,
  type DraftStatePayload,
  type DraftSectionPayload,
  type WebsiteSection,
  type WebsiteConfig,
  type ThemeCatalog,
  type Restaurant,
} from '@/lib/api';
import { NavbarPanel } from '@/components/website/NavbarPanel';
import { PageCommerce } from '@/components/website/PageCommerce';
import { PageAppearance } from '@/components/website/PageCommercePanel';
import { SectionSettingsPanel, SECTION_TYPE_META, getDefaultContent } from '@/components/website/SectionEditors';
import { ThemesPanel } from '@/components/website-menu/ThemesPanel';
import { TypographyPanel } from '@/components/website-menu/TypographyPanel';
import { BrandingPanel } from '@/components/website-menu/BrandingPanel';
import CheckoutEditor, { type CheckoutSubTab } from '@/components/website/CheckoutEditor';
import type { CheckoutConfig } from '@/lib/api';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://dev-app.foody-pos.co.il';

type PageType = 'landing' | 'order' | 'catering' | 'content' | string;
type Tab = 'contenu' | 'apparence' | 'reglages';
type Device = 'mobile' | 'desktop';

const TYPE_META: Record<string, { icon: string; label: string }> = {
  landing: { icon: '🏠', label: 'landing' },
  order: { icon: '🛒', label: 'order' },
  catering: { icon: '🍽', label: 'catering' },
  content: { icon: '📄', label: 'content' },
};

const SITE_ITEMS = [
  { key: 'base', label: 'Base : thème & typo' },
  { key: 'nav', label: 'Navigation' },
  { key: 'footer', label: 'Pied de page' },
  { key: 'domain', label: 'Domaine & SEO' },
  { key: 'contact', label: 'Coordonnées & réseaux' },
];

// Section types offered by the page add-section picker. The footer is a
// site-level element (edited under "Pied de page"), so it's excluded here —
// matching the legacy builder's AddSectionModal.
const ADDABLE_SECTION_TYPES = Object.keys(SECTION_TYPE_META).filter((t) => t !== 'footer');

// Page types the "+ Ajouter une page" picker offers. 'landing' is the unique
// site root, so it's intentionally excluded — you can't create a second one.
const ADDABLE_PAGE_TYPES = ['content', 'order', 'catering'];

// Social platforms exposed by the Contact panel. Each maps to a key in the
// site-wide WebsiteConfig.social_links record (a URL, or absent when cleared).
const SOCIAL_PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/…' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/…' },
];

export default function WebsiteV2Builder({ params }: { params: { restaurantId: string } }) {
  const rid = Number(params.restaurantId);
  const router = useRouter();
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('contenu');
  const [device, setDevice] = useState<Device>('mobile');
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState('');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [themeCatalog, setThemeCatalog] = useState<ThemeCatalog | null>(null);

  useEffect(() => {
    getThemeCatalog().then(setThemeCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([getWebsiteDraft(rid), getRestaurant(rid).catch(() => null)])
      .then(([d, r]) => {
        if (!alive) return;
        setDraft(d);
        if (r) {
          setRestaurant(r);
          if (r.slug) setSlug(r.slug);
        }
        const first = (d.state.pages ?? []).filter((p) => p.slug !== '_site')[0]?.slug ?? null;
        setActivePage(first);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || 'Chargement impossible');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rid]);

  // `_site` is the footer-holder the backfill materializes, not a real page — hide it.
  const pages = useMemo(
    () =>
      (draft?.state.pages ?? [])
        .filter((p) => p.slug !== '_site')
        .sort((a, b) => a.sort_order - b.sort_order),
    [draft],
  );
  const page = useMemo(() => pages.find((p) => p.slug === activePage) ?? null, [pages, activePage]);
  const pageSections = useMemo(
    () => (draft?.state.sections ?? []).filter((s) => matchesPage(s, page)),
    [draft, page],
  );
  // The site-wide footer section (if the restaurant has one) — edited under the
  // "Pied de page" site item, independently of any page.
  const footerSection = useMemo(
    () => (draft?.state.sections ?? []).find((s) => s.section_type === 'footer') ?? null,
    [draft],
  );

  // Preview the active page, or fall back to the first real page so a site-level
  // selection (Navigation, Footer…) still shows something rather than a 404.
  const previewPage = page ?? pages[0] ?? null;
  const previewPath = previewPage
    ? previewPage.type === 'landing'
      ? ''
      : previewPage.type === 'order'
        ? '/order'
        : previewPage.type === 'catering'
          ? '/catering'
          : `/${previewPage.slug}`
    : '';
  const previewSrc = slug ? `${WEB_URL}/r/${slug}${previewPath}?preview=1` : '';

  async function onPublish() {
    setBusy(true);
    try {
      const d = await publishWebsiteDraft(rid);
      setDraft(d);
    } catch (e: any) {
      setError(e?.message || 'Publication impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    setBusy(true);
    try {
      const d = await discardWebsiteDraft(rid);
      setDraft(d);
    } catch (e: any) {
      setError(e?.message || 'Annulation impossible');
    } finally {
      setBusy(false);
    }
  }

  // Persist a modified draft state (autosave-style) and refresh from the server.
  async function saveState(next: DraftStatePayload) {
    setDraft((d) => (d ? { ...d, state: next, draft_dirty: true } : d)); // optimistic
    setBusy(true);
    try {
      const d = await saveWebsiteDraft(rid, next);
      setDraft(d);
    } catch (e: any) {
      setError(e?.message || 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  function toggleSection(sectionId: number | string) {
    if (!draft) return;
    const sections = draft.state.sections.map((s) =>
      (s.id ?? s.tmp_id) === sectionId ? { ...s, is_visible: !s.is_visible } : s,
    );
    void saveState({ ...draft.state, sections });
  }

  // Apply a SectionSettingsPanel edit to the matching draft section. The panel
  // hands back a Partial<WebsiteSection>; we merge only the fields it touches
  // (layout / content / settings), mirroring the legacy builder's semantics, so
  // the section keeps its draft-only fields (tmp_id, page_id…) untouched.
  function updateSection(sectionId: number | string, updates: Partial<WebsiteSection>) {
    if (!draft) return;
    const sections = draft.state.sections.map((s) => {
      if ((s.id ?? s.tmp_id) !== sectionId) return s;
      return {
        ...s,
        ...(updates.layout !== undefined ? { layout: updates.layout } : {}),
        ...(updates.is_visible !== undefined ? { is_visible: updates.is_visible } : {}),
        content: updates.content ? { ...(s.content ?? {}), ...updates.content } : s.content,
        settings: updates.settings ? { ...(s.settings ?? {}), ...updates.settings } : s.settings,
      };
    });
    void saveState({ ...draft.state, sections });
  }

  // Remove a section from the draft. Previously-persisted sections (real id) are
  // queued in deleted_section_ids so publish drops them; draft-only sections
  // (tmp_id) just disappear.
  function deleteSection(sectionId: number | string) {
    if (!draft) return;
    const target = draft.state.sections.find((s) => (s.id ?? s.tmp_id) === sectionId);
    const sections = draft.state.sections.filter((s) => (s.id ?? s.tmp_id) !== sectionId);
    const deleted =
      target && typeof target.id === 'number' && target.id > 0
        ? [...(draft.state.deleted_section_ids ?? []), target.id]
        : draft.state.deleted_section_ids ?? [];
    void saveState({ ...draft.state, sections, deleted_section_ids: deleted });
  }

  // Add a section to the current page: seed a draft-only row (tmp_id, no real id
  // yet), persist it, and return its tmp_id so the caller can open it for editing.
  // Mirrors the legacy handleAddSection; page/page_id are set so matchesPage binds
  // it to the current page (page_id wins for persisted pages; the page slug is the
  // fallback for tmp pages, and matches how order-page sections store page="order").
  function addSection(sectionType: string): string | null {
    if (!draft || !page) return null;
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newSection: DraftSectionPayload & { page_id?: number } = {
      tmp_id: tmpId,
      section_type: sectionType,
      page: page.type === 'order' ? 'order' : page.slug,
      ...(typeof page.id === 'number' ? { page_id: page.id } : {}),
      sort_order: pageSections.length,
      is_visible: true,
      layout: 'default',
      content: getDefaultContent(sectionType),
      settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' },
    };
    void saveState({ ...draft.state, sections: [...draft.state.sections, newSection] });
    return tmpId;
  }

  function updatePageSettings(slug: string, settings: Record<string, unknown>) {
    if (!draft) return;
    const pages = (draft.state.pages ?? []).map((p) =>
      p.slug === slug ? { ...p, settings } : p,
    );
    void saveState({ ...draft.state, pages });
  }

  // Merge a site-wide config patch (theme colours, typography, logo, favicon…)
  // into the draft config and persist. WebsiteConfig and DraftConfigPayload share
  // snake_case field names, so the editable subset merges directly; fields the
  // draft doesn't carry (id, restaurant_id…) are dropped server-side on save.
  function updateConfig(patch: Partial<WebsiteConfig>) {
    if (!draft) return;
    const config = { ...draft.state.config, ...patch } as DraftStatePayload['config'];
    void saveState({ ...draft.state, config });
  }

  // Patch one page in the draft (title, slug, nav_visible, appearance_overrides…)
  // and persist. A slug rename also follows the page's draft-only sections (they
  // bind by slug; persisted sections bind by page_id and are unaffected) and keeps
  // the active selection pointed at the renamed page.
  function updatePage(slug: string, patch: Partial<DraftPagePayload>) {
    if (!draft) return;
    const renamedTo = patch.slug && patch.slug !== slug ? patch.slug : null;
    const nextPages = (draft.state.pages ?? []).map((p) =>
      p.slug === slug ? { ...p, ...patch } : p,
    );
    const nextSections = renamedTo
      ? draft.state.sections.map((s) =>
          (s as DraftSectionPayload & { page_id?: number }).page_id == null && s.page === slug
            ? { ...s, page: renamedTo }
            : s,
        )
      : draft.state.sections;
    void saveState({ ...draft.state, pages: nextPages, sections: nextSections });
    if (renamedTo && activePage === slug) setActivePage(renamedTo);
  }

  // Create a new draft-only page (content / order / catering — landing is unique
  // and never added here). The slug is derived from the title and made unique
  // against existing page slugs; the page is appended, persisted, and selected.
  function addPage(type: string, title: string) {
    if (!draft) return;
    const existing = draft.state.pages ?? [];
    const taken = new Set(existing.map((p) => p.slug));
    const cleanTitle = title.trim();
    const slug = uniqueSlug(slugify(cleanTitle) || type, taken);
    const newPage: DraftPagePayload = {
      tmp_id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      slug,
      title: cleanTitle || TYPE_META[type]?.label || type,
      sort_order: pages.length,
      nav_visible: true,
    };
    void saveState({ ...draft.state, pages: [...existing, newPage] });
    setActivePage(slug);
    setActiveSite(null);
    setTab('contenu');
  }

  // Delete a page. The landing page and the '_site' footer holder are never
  // deletable. A persisted page queues its id in deleted_page_ids so publish
  // drops it; a tmp-only page just leaves the array. Either way the page's
  // sections are dropped too, with their real ids queued in deleted_section_ids.
  function deletePage(slug: string) {
    if (!draft) return;
    const target = (draft.state.pages ?? []).find((p) => p.slug === slug);
    if (!target || target.type === 'landing' || slug === '_site') return;
    const nextPages = (draft.state.pages ?? []).filter((p) => p.slug !== slug);
    const droppedSections = draft.state.sections.filter((s) => matchesPage(s, target));
    const keptSections = draft.state.sections.filter((s) => !matchesPage(s, target));
    const deletedSectionIds = [
      ...(draft.state.deleted_section_ids ?? []),
      ...droppedSections
        .filter((s) => typeof s.id === 'number' && s.id > 0)
        .map((s) => s.id as number),
    ];
    const deletedPageIds =
      typeof target.id === 'number' && target.id > 0
        ? [...(draft.state.deleted_page_ids ?? []), target.id]
        : draft.state.deleted_page_ids ?? [];
    void saveState({
      ...draft.state,
      pages: nextPages,
      sections: keptSections,
      deleted_section_ids: deletedSectionIds,
      deleted_page_ids: deletedPageIds,
    });
    if (activePage === slug) {
      setActivePage(nextPages.filter((p) => p.slug !== '_site')[0]?.slug ?? null);
    }
  }

  // Reorder a page up (dir -1) or down (dir +1) by swapping its sort_order with
  // the neighbour in display order, then resorting so the rail reflects it.
  function movePage(slug: string, dir: -1 | 1) {
    if (!draft) return;
    const idx = pages.findIndex((p) => p.slug === slug);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= pages.length) return;
    const a = pages[idx];
    const b = pages[swapIdx];
    const nextPages = (draft.state.pages ?? [])
      .map((p) => {
        if (p.slug === a.slug) return { ...p, sort_order: b.sort_order };
        if (p.slug === b.slug) return { ...p, sort_order: a.sort_order };
        return p;
      })
      .sort((x, y) => x.sort_order - y.sort_order);
    void saveState({ ...draft.state, pages: nextPages });
  }

  // Commit a slug rename from the Réglages input: sanitize, keep it unique
  // against the other pages, and skip no-ops. The landing (root) page's slug is
  // not editable — its slug is the site root, guarded in the UI too.
  function renamePageSlug(page: DraftPagePayload, raw: string) {
    if (page.type === 'landing') return;
    const taken = new Set(
      (draft?.state.pages ?? []).filter((p) => p.slug !== page.slug).map((p) => p.slug),
    );
    const next = uniqueSlug(slugify(raw) || page.type, taken);
    if (next === page.slug) return;
    updatePage(page.slug, { slug: next });
  }

  function selectPage(slug: string) {
    setActivePage(slug);
    setActiveSite(null);
    setTab('contenu');
  }

  if (loading) return <CenterMsg>Chargement du site…</CenterMsg>;
  if (error) return <CenterMsg tone="error">{error}</CenterMsg>;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <button
          onClick={() => router.push(`/${rid}/dashboard`)}
          title="Retour au tableau de bord"
          aria-label="Retour au tableau de bord"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-neutral-900">Site web</span>
        <span className="text-xs text-neutral-400">·</span>
        <span className="text-sm text-neutral-500">{page ? page.title : 'Tout le site'}</span>
        <div className="ml-auto flex items-center gap-2">
          {draft?.draft_dirty && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              ● Brouillon
            </span>
          )}
          <button
            onClick={onDiscard}
            disabled={busy || !draft?.draft_dirty}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={onPublish}
            disabled={busy}
            className="rounded-md bg-[#e06c5a] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d15b49] disabled:opacity-50"
          >
            {busy ? '…' : 'Publier'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Page rail */}
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-2.5">
          <RailLabel>Pages</RailLabel>
          {pages.map((p, i) => (
            <PageRow
              key={p.slug}
              page={p}
              active={p.slug === activePage && !activeSite}
              busy={busy}
              isFirst={i === 0}
              isLast={i === pages.length - 1}
              canDelete={p.type !== 'landing'}
              onSelect={() => selectPage(p.slug)}
              onMoveUp={() => movePage(p.slug, -1)}
              onMoveDown={() => movePage(p.slug, 1)}
              onDelete={() => {
                if (confirm(`Supprimer la page « ${p.title || p.slug} » ?`)) deletePage(p.slug);
              }}
            />
          ))}
          {pages.length === 0 && (
            <p className="px-2 py-3 text-xs text-neutral-400">
              Aucune page. Publiez le site pour générer les pages.
            </p>
          )}
          <AddPagePanel onCreate={addPage} busy={busy} />

          <RailLabel className="mt-4">Tout le site</RailLabel>
          {SITE_ITEMS.map((s) => (
            <RailItem
              key={s.key}
              active={activeSite === s.key}
              onClick={() => {
                setActiveSite(s.key);
                setActivePage(null);
              }}
            >
              <span className="h-3.5 w-3.5 rounded bg-[#6c8ee0]" />
              <span className="truncate">{s.label}</span>
            </RailItem>
          ))}
        </nav>

        {/* Editor */}
        <section className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50/60 p-3">
          {page ? (
            <PageEditor
              page={page}
              tab={tab}
              setTab={setTab}
              sections={pageSections}
              onToggle={toggleSection}
              onUpdateSection={updateSection}
              onDeleteSection={deleteSection}
              onAddSection={addSection}
              busy={busy}
              rid={rid}
              onSaveSettings={(s) => updatePageSettings(page.slug, s)}
              onUpdatePage={(patch) => updatePage(page.slug, patch)}
              onRenameSlug={(raw) => renamePageSlug(page, raw)}
              checkoutConfig={(((draft?.state.config ?? {}) as Record<string, unknown>).checkout_config ?? null) as CheckoutConfig | null}
              onCheckoutChange={(c) => updateConfig({ checkout_config: c } as Partial<WebsiteConfig>)}
            />
          ) : activeSite === 'nav' && draft ? (
            <NavbarPanel config={draft.state.config as unknown as WebsiteConfig} onUpdate={updateConfig} restaurantId={rid} />
          ) : activeSite === 'base' && draft && themeCatalog ? (
            <BaseThemePanel
              config={draft.state.config as unknown as WebsiteConfig}
              catalog={themeCatalog}
              onUpdate={updateConfig}
              rid={rid}
              restaurant={restaurant}
              onRestaurantUpdate={setRestaurant}
            />
          ) : activeSite === 'base' ? (
            <p className="text-sm text-neutral-400">Chargement du thème…</p>
          ) : activeSite === 'contact' && draft ? (
            <ContactPanel
              config={draft.state.config as unknown as WebsiteConfig}
              onUpdate={updateConfig}
            />
          ) : activeSite === 'footer' && draft ? (
            <FooterPanel
              config={draft.state.config as unknown as WebsiteConfig}
              onUpdate={updateConfig}
              footerSection={footerSection}
              rid={rid}
              onUpdateSection={updateSection}
              onDeleteSection={deleteSection}
            />
          ) : activeSite === 'domain' && draft ? (
            <DomainPanel
              config={draft.state.config as unknown as WebsiteConfig}
              onUpdate={updateConfig}
            />
          ) : activeSite ? (
            <SitePanel siteKey={activeSite} />
          ) : (
            <p className="text-sm text-neutral-400">Sélectionnez une page.</p>
          )}
        </section>

        {/* Preview */}
        <div className="flex min-w-0 flex-1 flex-col bg-neutral-100">
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 text-xs">
            <span className="text-neutral-400">Aperçu ·</span>
            <span className="font-semibold text-neutral-700">{page?.title ?? 'Site'}</span>
            <div className="ml-auto flex items-center gap-1">
              <DeviceBtn active={device === 'mobile'} onClick={() => setDevice('mobile')}>
                📱
              </DeviceBtn>
              <DeviceBtn active={device === 'desktop'} onClick={() => setDevice('desktop')}>
                🖥
              </DeviceBtn>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            <LivePreview src={previewSrc} device={device} state={draft?.state ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live preview ─────────────────────────────────────────────────────────────
// Renders the guest site in an iframe and streams the draft into it over
// postMessage, reusing foodyweb's existing preview protocol (lib/preview-mode.ts).
// In ?preview=1 mode foodyweb announces itself with 'foody-editor-ready' and then
// renders its sections + navbar from the 'foody-draft-state' we post — so every
// edit shows live, before publishing. The iframe only reloads when the previewed
// page or device changes (key), never on an edit, so form state is never lost.
function LivePreview({ src, device, state }: {
  src: string;
  device: Device;
  state: DraftStatePayload | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Post the draft to the iframe on both channels foodyweb listens on:
  //  • foody-draft-state → sections + navbar (RestaurantLanding, usePageSections,
  //    OrderExperience, SiteNavbar)
  //  • foody-theme-preview → theme colours + typography (useResolvedTheme applies
  //    the config fields as a Partial<WebsiteConfig> override)
  function postDraft(win: Window | null | undefined, s: DraftStatePayload | null) {
    if (!win || !s) return;
    win.postMessage({ type: 'foody-draft-state', state: s }, '*');
    win.postMessage({ type: 'foody-theme-preview', ...(s.config as Record<string, unknown>) }, '*');
  }

  // Handshake: reply to 'foody-editor-ready' with the current draft. foodyweb
  // emits it once its listeners mount (and again after each reload).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'foody-editor-ready') {
        readyRef.current = true;
        postDraft(iframeRef.current?.contentWindow, stateRef.current);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Re-post whenever the draft changes (after the handshake has completed).
  useEffect(() => {
    if (!readyRef.current) return;
    postDraft(iframeRef.current?.contentWindow, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!src) return <p className="text-sm text-neutral-400">Aucun aperçu.</p>;
  return (
    <iframe
      ref={iframeRef}
      key={src + device}
      src={src}
      title="Aperçu"
      onLoad={() => { readyRef.current = false; }}
      className="border-0 bg-white shadow-xl"
      style={
        device === 'mobile'
          ? { width: 390, height: '100%', borderRadius: 16 }
          : { width: '100%', height: '100%' }
      }
    />
  );
}

// ── Editor panel ─────────────────────────────────────────────────────────────

function PageEditor({
  page,
  tab,
  setTab,
  sections,
  onToggle,
  onUpdateSection,
  onDeleteSection,
  onAddSection,
  busy,
  rid,
  onSaveSettings,
  onUpdatePage,
  onRenameSlug,
  checkoutConfig,
  onCheckoutChange,
}: {
  page: DraftPagePayload;
  tab: Tab;
  setTab: (t: Tab) => void;
  sections: DraftSectionPayload[];
  onToggle: (id: number | string) => void;
  onUpdateSection: (id: number | string, updates: Partial<WebsiteSection>) => void;
  onDeleteSection: (id: number | string) => void;
  onAddSection: (sectionType: string) => string | null;
  busy: boolean;
  rid: number;
  onSaveSettings: (settings: Record<string, unknown>) => void;
  onUpdatePage: (patch: Partial<DraftPagePayload>) => void;
  onRenameSlug: (raw: string) => void;
  checkoutConfig: CheckoutConfig | null;
  onCheckoutChange: (c: CheckoutConfig) => void;
}) {
  // Which section (if any) is open in the content editor, addressed by its real
  // id or provisional tmp_id. Cleared when the page changes so a stale selection
  // from another page never leaks in.
  const [selectedKey, setSelectedKey] = useState<number | string | null>(null);
  // Whether the "add a section" type picker is open.
  const [adding, setAdding] = useState(false);
  useEffect(() => { setSelectedKey(null); setAdding(false); }, [page.slug]);
  const selectedSection =
    selectedKey == null ? null : sections.find((s) => (s.id ?? s.tmp_id) === selectedKey) ?? null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold text-neutral-900">{page.title || page.slug}</span>
        <span className="rounded-full border border-[#e06c5a] px-2 py-0.5 text-[10px] text-[#c85842]">
          {page.type}
        </span>
      </div>
      <div className="mb-3 flex gap-1">
        {(['contenu', 'apparence', 'reglages'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'rounded-md px-2.5 py-1 text-xs font-medium capitalize ' +
              (tab === t ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600')
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'contenu' && selectedSection && (
        <div>
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="mb-3 flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
          >
            <span aria-hidden>←</span> Toutes les sections
          </button>
          <SectionSettingsPanel
            section={asWebsiteSection(selectedSection, rid)}
            restaurantId={rid}
            onUpdate={(updates) => onUpdateSection(selectedSection.id ?? selectedSection.tmp_id!, updates)}
            onDelete={() => {
              onDeleteSection(selectedSection.id ?? selectedSection.tmp_id!);
              setSelectedKey(null);
            }}
          />
        </div>
      )}

      {tab === 'contenu' && !selectedSection && (
        <div className="space-y-1.5">
          {sections.length === 0 && (
            <p className="text-xs text-neutral-400">Aucune section sur cette page.</p>
          )}
          {sections.map((s) => (
            <div
              key={s.id ?? s.tmp_id}
              className={
                'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs ' +
                (s.is_visible ? 'border-neutral-200 bg-white' : 'border-neutral-200 bg-neutral-100')
              }
            >
              <button
                type="button"
                onClick={() => setSelectedKey(s.id ?? s.tmp_id!)}
                title="Modifier le contenu"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300" />
                <span className={'truncate ' + (s.is_visible ? 'text-neutral-700' : 'text-neutral-400 line-through')}>
                  {sectionLabel(s.section_type)}
                </span>
              </button>
              <button
                onClick={() => onToggle(s.id ?? s.tmp_id!)}
                disabled={busy}
                title={s.is_visible ? 'Masquer' : 'Afficher'}
                className="ml-auto rounded px-1.5 py-0.5 text-sm hover:bg-neutral-100 disabled:opacity-40"
              >
                {s.is_visible ? '👁' : '🚫'}
              </button>
            </div>
          ))}
          {adding ? (
            <div className="mt-1 rounded-md border border-neutral-200 bg-white p-1.5">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-neutral-500">Choisir un type</span>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-[11px] text-neutral-400 hover:text-neutral-700"
                >
                  Annuler
                </button>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {ADDABLE_SECTION_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const key = onAddSection(type);
                      if (key != null) setSelectedKey(key);
                      setAdding(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    <span aria-hidden>{SECTION_TYPE_META[type]?.icon ?? '📄'}</span>
                    <span className="truncate">{sectionLabel(type)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-1 w-full rounded-md border border-dashed border-neutral-300 py-2 text-xs text-neutral-500 hover:bg-white"
            >
              + Ajouter une section
            </button>
          )}
        </div>
      )}

      {tab === 'apparence' && (
        // Per-page appearance overrides. PageAppearance reads/writes
        // settings.appearance — the exact slot foodyweb's PageAppearanceScope
        // renders — so we hand it the page's real settings and persist what it
        // emits straight back into settings (draft-based: previews + publishes
        // with the rest, and coexists with the commerce settings PageCommerce
        // writes, since both spread the existing settings object).
        <PageAppearance page={page} busy={busy} onSave={(settings) => onSaveSettings(settings)} />
      )}

      {tab === 'reglages' && (
        <div className="space-y-2 text-xs">
          <div>
            <FieldLabel>Titre</FieldLabel>
            <input
              key={`title-${page.slug}`}
              type="text"
              defaultValue={page.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== page.title) onUpdatePage({ title: v });
              }}
              placeholder="Titre de la page"
              className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-800 placeholder:text-neutral-300"
            />
          </div>

          <Field label="Type">{page.type}</Field>

          <div>
            <FieldLabel>Slug</FieldLabel>
            {page.type === 'landing' ? (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-neutral-400">
                / (page racine, non modifiable)
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5">
                <span className="text-neutral-400">/</span>
                <input
                  key={`slug-${page.slug}`}
                  type="text"
                  defaultValue={page.slug}
                  onBlur={(e) => onRenameSlug(e.target.value)}
                  placeholder="slug-de-la-page"
                  className="w-full bg-transparent text-neutral-800 outline-none placeholder:text-neutral-300"
                />
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-neutral-700">
            <span>Visible dans la nav</span>
            <input
              type="checkbox"
              checked={page.nav_visible !== false}
              disabled={busy}
              onChange={(e) => onUpdatePage({ nav_visible: e.target.checked })}
              className="h-4 w-4 accent-[#e06c5a]"
            />
          </label>

          <PageCommerce page={page} rid={rid} onSave={onSaveSettings} busy={busy} />

          {page.type === 'order' && (
            <div className="mt-3 border-t border-neutral-200 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Caisse (paiement)
              </div>
              <CheckoutSection value={checkoutConfig} onChange={onCheckoutChange} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Checkout editor for the order page. checkout_config is a site-wide config
// field (there is one checkout flow), edited here from the order page's Réglages.
// Holds the delivery/pickup/confirmation sub-tab locally; edits persist through
// updateConfig on the draft.
function CheckoutSection({ value, onChange }: {
  value: CheckoutConfig | null;
  onChange: (c: CheckoutConfig) => void;
}) {
  const [subTab, setSubTab] = useState<CheckoutSubTab>('delivery');
  return (
    <CheckoutEditor
      value={value}
      onChange={onChange}
      placesAvailable
      subTab={subTab}
      onSubTabChange={setSubTab}
    />
  );
}

// "Base : thème & typo" — the site-wide appearance editor. Reuses the same
// panels as the menu/theme editor (ThemesPanel/TypographyPanel/BrandingPanel);
// they read/write WebsiteConfig fields, which map 1:1 onto the draft config via
// updateConfig, so edits persist and preview live through foody-draft-state.
function BaseThemePanel({
  config,
  catalog,
  onUpdate,
  rid,
  restaurant,
  onRestaurantUpdate,
}: {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  rid: number;
  restaurant: Restaurant | null;
  onRestaurantUpdate: (r: Restaurant) => void;
}) {
  const [sub, setSub] = useState<'colors' | 'typo' | 'logo'>('colors');
  const subs: [typeof sub, string][] = [
    ['colors', 'Couleurs'],
    ['typo', 'Typographie'],
    ['logo', 'Logo & favicon'],
  ];
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-neutral-900">Base : thème & typo</div>
      <p className="mb-3 text-[11px] text-neutral-400">S&apos;applique à tout le site.</p>
      <div className="mb-3 flex gap-1">
        {subs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={
              'rounded-md px-2.5 py-1 text-xs font-medium ' +
              (sub === k ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600')
            }
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'colors' && <ThemesPanel config={config} catalog={catalog} onUpdate={onUpdate} />}
      {sub === 'typo' && (
        <TypographyPanel
          config={config}
          catalog={catalog}
          onUpdate={onUpdate}
          restaurantId={rid}
          heroNameFont={config.hero_name_font ?? ''}
          onHeroNameFontChange={(f) => onUpdate({ hero_name_font: f })}
          heroSample={restaurant?.name}
        />
      )}
      {sub === 'logo' && (
        <BrandingPanel
          config={config}
          onUpdate={onUpdate}
          restaurantId={rid}
          restaurant={restaurant}
          onRestaurantUpdate={onRestaurantUpdate}
        />
      )}
    </div>
  );
}

function SitePanel({ siteKey }: { siteKey: string }) {
  const label = SITE_ITEMS.find((s) => s.key === siteKey)?.label ?? siteKey;
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-neutral-900">{label}</div>
      <p className="text-xs text-neutral-400">
        Éditeur « {label} » à venir. S&apos;applique à tout le site.
      </p>
    </div>
  );
}

// "Coordonnées & réseaux" — site-wide contact display toggles + social links.
// Reads/writes the draft config (show_address/phone/hours + social_links) via
// updateConfig, so every edit persists and previews live.
function ContactPanel({
  config,
  onUpdate,
}: {
  config: WebsiteConfig;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
}) {
  const social = config.social_links ?? {};
  const toggles: [keyof WebsiteConfig, string][] = [
    ['show_address', "Afficher l'adresse"],
    ['show_phone', 'Afficher le téléphone'],
    ['show_hours', 'Afficher les horaires'],
  ];

  // Set (or clear, when blank) one social link, then persist the whole record.
  function setSocial(key: string, url: string) {
    const next = { ...social };
    if (url.trim()) next[key] = url;
    else delete next[key];
    onUpdate({ social_links: next });
  }

  return (
    <div>
      <div className="mb-2 text-sm font-bold text-neutral-900">Coordonnées &amp; réseaux</div>
      <p className="mb-3 text-[11px] text-neutral-400">S&apos;applique à tout le site.</p>

      <div className="space-y-1.5">
        {toggles.map(([key, label]) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-700"
          >
            <span>{label}</span>
            <input
              type="checkbox"
              checked={!!config[key]}
              onChange={(e) => onUpdate({ [key]: e.target.checked } as Partial<WebsiteConfig>)}
              className="h-4 w-4 accent-[#e06c5a]"
            />
          </label>
        ))}
      </div>

      <div className="mb-1 mt-4 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        Réseaux sociaux
      </div>
      <div className="space-y-2">
        {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="mb-1 block text-[11px] text-neutral-500">{label}</label>
            <input
              type="url"
              value={social[key] ?? ''}
              onChange={(e) => setSocial(key, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-300"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// "Pied de page" — the site-wide footer copy (footer_text) plus, when a footer
// section exists, its full content editor (reusing SectionSettingsPanel through
// the same asWebsiteSection adapter the page editor uses).
function FooterPanel({
  config,
  onUpdate,
  footerSection,
  rid,
  onUpdateSection,
  onDeleteSection,
}: {
  config: WebsiteConfig;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  footerSection: DraftSectionPayload | null;
  rid: number;
  onUpdateSection: (id: number | string, updates: Partial<WebsiteSection>) => void;
  onDeleteSection: (id: number | string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-neutral-900">Pied de page</div>
      <p className="mb-3 text-[11px] text-neutral-400">S&apos;applique à tout le site.</p>

      <label className="mb-1 block text-[11px] text-neutral-500">Texte du pied de page</label>
      <textarea
        value={config.footer_text ?? ''}
        onChange={(e) => onUpdate({ footer_text: e.target.value })}
        rows={3}
        placeholder="© 2026 Restaurant. Propulsé par Foody."
        className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-800 placeholder:text-neutral-300"
      />

      {footerSection && (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <SectionSettingsPanel
            section={asWebsiteSection(footerSection, rid)}
            restaurantId={rid}
            onUpdate={(updates) => onUpdateSection(footerSection.id ?? footerSection.tmp_id!, updates)}
            onDelete={() => onDeleteSection(footerSection.id ?? footerSection.tmp_id!)}
          />
        </div>
      )}
    </div>
  );
}

// "Domaine & SEO" — the site's identity texts (welcome + tagline). The custom
// domain itself is configured elsewhere; only a one-line hint is shown here.
function DomainPanel({
  config,
  onUpdate,
}: {
  config: WebsiteConfig;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-bold text-neutral-900">Domaine &amp; SEO</div>
      <p className="mb-3 text-[11px] text-neutral-400">
        Textes d&apos;identité du site, utilisés dans l&apos;en-tête et le partage.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Texte de bienvenue</label>
          <input
            type="text"
            value={config.welcome_text ?? ''}
            onChange={(e) => onUpdate({ welcome_text: e.target.value })}
            placeholder="Bienvenue"
            className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Slogan</label>
          <input
            type="text"
            value={config.tagline ?? ''}
            onChange={(e) => onUpdate({ tagline: e.target.value })}
            placeholder="Votre slogan"
            className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-300"
          />
        </div>

        {/* Landing on/off — when off, /r/<slug> skips the marketing landing and
            sends customers straight to the order page. */}
        <label className="flex cursor-pointer items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-700">
          <span>Page d&apos;accueil (landing)</span>
          <input
            type="checkbox"
            checked={config.landing_enabled !== false}
            onChange={(e) => onUpdate({ landing_enabled: e.target.checked })}
            className="h-4 w-4 accent-[#e06c5a]"
          />
        </label>

        {/* Menu grid layout (order page). */}
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Mise en page du menu</label>
          <div className="flex gap-1.5">
            {([['magazine', 'Magazine'], ['compact', 'Compacte']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => onUpdate({ layout_default: v })}
                className={
                  'flex-1 rounded-md border px-2 py-1.5 text-xs ' +
                  ((config.layout_default || 'magazine') === v
                    ? 'border-[#e06c5a] bg-[#e06c5a]/10 text-[#c85842]'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
        Le domaine personnalisé se configure dans les réglages du restaurant.
      </p>
    </div>
  );
}

// ── Page rail row ────────────────────────────────────────────────────────────
// A page entry in the rail: a select button plus reorder/delete actions revealed
// on hover. Mirrors RailItem's look but can't be a single <button> (it nests
// action buttons), so it's a styled row wrapping its own controls.
function PageRow({
  page,
  active,
  busy,
  isFirst,
  isLast,
  canDelete,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  page: DraftPagePayload;
  active: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={
        'group mb-0.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] ' +
        (active ? 'bg-[#e06c5a] font-semibold text-white' : 'text-neutral-700 hover:bg-neutral-100')
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span>{TYPE_META[page.type]?.icon ?? '📄'}</span>
        <span className="truncate">{page.title || page.slug}</span>
      </button>
      <span
        className={
          'shrink-0 text-[10px] group-hover:hidden ' + (active ? 'text-white/70' : 'text-neutral-400')
        }
      >
        {TYPE_META[page.type]?.label ?? page.type}
      </span>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <IconAction active={active} disabled={busy || isFirst} onClick={onMoveUp} title="Monter">
          ↑
        </IconAction>
        <IconAction active={active} disabled={busy || isLast} onClick={onMoveDown} title="Descendre">
          ↓
        </IconAction>
        {canDelete && (
          <IconAction active={active} disabled={busy} onClick={onDelete} title="Supprimer">
            🗑
          </IconAction>
        )}
      </div>
    </div>
  );
}

function IconAction({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={
        'rounded px-1 py-0.5 text-[11px] leading-none disabled:opacity-30 ' +
        (active ? 'hover:bg-white/20' : 'hover:bg-neutral-200')
      }
    >
      {children}
    </button>
  );
}

// The "+ Ajouter une page" inline picker: choose a type (content / order /
// catering) and a title, then create the page. Manages its own open/draft state
// so the rail stays a plain list until the owner starts adding.
function AddPagePanel({
  onCreate,
  busy,
}: {
  onCreate: (type: string, title: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('content');
  const [title, setTitle] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full rounded-md border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
      >
        + Ajouter une page
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-neutral-200 bg-white p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-500">Nouvelle page</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-neutral-400 hover:text-neutral-700"
        >
          Annuler
        </button>
      </div>
      <div className="mb-2 flex gap-1">
        {ADDABLE_PAGE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={
              'flex flex-1 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] ' +
              (type === t
                ? 'border-[#e06c5a] bg-[#fdeeeb] text-[#c85842]'
                : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50')
            }
          >
            <span className="text-sm">{TYPE_META[t]?.icon ?? '📄'}</span>
            <span>{TYPE_META[t]?.label ?? t}</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la page"
        className="mb-2 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-300"
      />
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={() => {
          onCreate(type, title);
          setOpen(false);
          setTitle('');
          setType('content');
        }}
        className="w-full rounded-md bg-[#e06c5a] py-1.5 text-xs font-semibold text-white hover:bg-[#d15b49] disabled:opacity-40"
      >
        Créer la page
      </button>
    </div>
  );
}

// ── Small UI atoms ───────────────────────────────────────────────────────────

function RailLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 ' + className}>
      {children}
    </div>
  );
}

function RailItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ' +
        (active ? 'bg-[#e06c5a] font-semibold text-white' : 'text-neutral-700 hover:bg-neutral-100')
      }
    >
      {children}
    </button>
  );
}

function DeviceBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={'rounded px-2 py-1 text-sm ' + (active ? 'bg-neutral-200' : 'opacity-40 hover:opacity-100')}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-neutral-800">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400">{children}</div>
  );
}

function CenterMsg({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className={'text-sm ' + (tone === 'error' ? 'text-red-500' : 'text-neutral-400')}>{children}</p>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

// A section belongs to a page when its page_id matches, or (legacy) its page
// string equals the page slug (order pages carry the legacy "order" slug).
function matchesPage(s: DraftSectionPayload & { page_id?: number }, page: DraftPagePayload | null): boolean {
  if (!page) return false;
  if (typeof s.page_id === 'number' && typeof page.id === 'number') return s.page_id === page.id;
  return s.page === page.slug;
}

// Adapt a draft section into the WebsiteSection shape SectionSettingsPanel reads
// (it only touches section_type, content, settings and layout). Draft-only rows
// have no real id yet, so we surface 0 — the panel never reads it, and edits are
// routed back through the section's id-or-tmp_id key.
function asWebsiteSection(s: DraftSectionPayload, rid: number): WebsiteSection {
  return {
    id: typeof s.id === 'number' ? s.id : 0,
    restaurant_id: rid,
    section_type: s.section_type,
    page: s.page,
    sort_order: s.sort_order ?? 0,
    is_visible: s.is_visible ?? true,
    layout: s.layout || 'default',
    content: s.content ?? {},
    settings: s.settings ?? {},
    created_at: '',
    updated_at: '',
  };
}

// Derive a URL slug from a title: lowercase, spaces → '-', drop anything that
// isn't a url-safe char. May yield '' for non-latin titles (callers fall back to
// the page type).
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Make `base` unique against `taken` by suffixing -2, -3… as needed.
function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || 'page';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

function sectionLabel(type: string): string {
  const map: Record<string, string> = {
    hero_banner: 'Bannière',
    scrolling_text: 'Texte défilant',
    text_and_image: 'Texte & Image',
    gallery: 'Galerie',
    testimonials: 'Avis',
    about: 'À propos',
    menu_highlights: 'Plats vedettes',
    promo_banner: 'Bannière promo',
    social_feed: 'Réseaux sociaux',
    action_buttons: "Boutons d'action",
    feature_cards: 'Cartes',
    picnic_basket: 'Panier',
    footer: 'Pied de page',
  };
  return map[type] ?? type;
}
