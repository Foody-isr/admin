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
import { NavbarEditor } from './NavbarEditor';
import { PageCommerce } from '@/components/website/PageCommerce';
import { SectionSettingsPanel } from '@/components/website/SectionEditors';
import { ThemesPanel } from '@/components/website-menu/ThemesPanel';
import { TypographyPanel } from '@/components/website-menu/TypographyPanel';
import { BrandingPanel } from '@/components/website-menu/BrandingPanel';

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

// Appearance token rows shown with an inherit/override chip. Presence of the key
// in the page's appearance_overrides drives "remplacé"; absence = inherits.
const APPEARANCE_ROWS = [
  { key: 'palette', label: 'Couleurs' },
  { key: 'headingFont', label: 'Titres' },
  { key: 'bodyFont', label: 'Texte courant' },
  { key: 'buttons', label: 'Boutons & coins' },
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
    () => (draft?.state.pages ?? []).filter((p) => p.slug !== '_site'),
    [draft],
  );
  const page = useMemo(() => pages.find((p) => p.slug === activePage) ?? null, [pages, activePage]);
  const pageSections = useMemo(
    () => (draft?.state.sections ?? []).filter((s) => matchesPage(s, page)),
    [draft, page],
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
          {pages.map((p) => (
            <RailItem
              key={p.slug}
              active={p.slug === activePage && !activeSite}
              onClick={() => selectPage(p.slug)}
            >
              <span>{TYPE_META[p.type]?.icon ?? '📄'}</span>
              <span className="truncate">{p.title || p.slug}</span>
              <span className="ml-auto text-[10px] text-neutral-400">
                {TYPE_META[p.type]?.label ?? p.type}
              </span>
            </RailItem>
          ))}
          {pages.length === 0 && (
            <p className="px-2 py-3 text-xs text-neutral-400">
              Aucune page. Publiez le site pour générer les pages.
            </p>
          )}

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
              busy={busy}
              rid={rid}
              onSaveSettings={(s) => updatePageSettings(page.slug, s)}
            />
          ) : activeSite === 'nav' && draft ? (
            <NavbarEditor draft={draft} onSave={saveState} busy={busy} />
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
  busy,
  rid,
  onSaveSettings,
}: {
  page: DraftPagePayload;
  tab: Tab;
  setTab: (t: Tab) => void;
  sections: DraftSectionPayload[];
  onToggle: (id: number | string) => void;
  onUpdateSection: (id: number | string, updates: Partial<WebsiteSection>) => void;
  onDeleteSection: (id: number | string) => void;
  busy: boolean;
  rid: number;
  onSaveSettings: (settings: Record<string, unknown>) => void;
}) {
  const overrides = page.appearance_overrides ?? {};
  // Which section (if any) is open in the content editor, addressed by its real
  // id or provisional tmp_id. Cleared when the page changes so a stale selection
  // from another page never leaks in.
  const [selectedKey, setSelectedKey] = useState<number | string | null>(null);
  useEffect(() => { setSelectedKey(null); }, [page.slug]);
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
          <button className="mt-1 w-full rounded-md border border-dashed border-neutral-300 py-2 text-xs text-neutral-500 hover:bg-white">
            + Ajouter une section
          </button>
        </div>
      )}

      {tab === 'apparence' && (
        <div className="space-y-2">
          {APPEARANCE_ROWS.map((row) => {
            const overridden = Object.prototype.hasOwnProperty.call(overrides, row.key);
            return (
              <div
                key={row.key}
                className="flex items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 py-2"
              >
                <span className="text-xs font-medium text-neutral-700">{row.label}</span>
                {overridden ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-neutral-900">
                    remplacé ✎
                  </span>
                ) : (
                  <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-500">
                    hérite du site
                  </span>
                )}
              </div>
            );
          })}
          <p className="pt-1 text-[11px] leading-relaxed text-neutral-400">
            Chaque réglage hérite du thème de base. Modifiez-le ici pour ne changer que cette page.
          </p>
        </div>
      )}

      {tab === 'reglages' && (
        <div className="space-y-2 text-xs">
          <Field label="Titre">{page.title}</Field>
          <Field label="Type">{page.type}</Field>
          <Field label="Slug">/{page.slug}</Field>
          <Field label="Visible dans la nav">{page.nav_visible === false ? 'Non' : 'Oui'}</Field>
          <PageCommerce page={page} rid={rid} onSave={onSaveSettings} busy={busy} />
        </div>
      )}
    </div>
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
