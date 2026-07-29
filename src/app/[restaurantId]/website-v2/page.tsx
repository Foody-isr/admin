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

import { useEffect, useMemo, useState } from 'react';
import {
  getWebsiteDraft,
  publishWebsiteDraft,
  discardWebsiteDraft,
  type DraftResponse,
  type DraftPagePayload,
  type DraftSectionPayload,
} from '@/lib/api';

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
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('contenu');
  const [device, setDevice] = useState<Device>('mobile');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getWebsiteDraft(rid)
      .then((d) => {
        if (!alive) return;
        setDraft(d);
        const first = d.state.pages?.[0]?.slug ?? null;
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

  const pages = useMemo(() => draft?.state.pages ?? [], [draft]);
  const page = useMemo(() => pages.find((p) => p.slug === activePage) ?? null, [pages, activePage]);
  const pageSections = useMemo(
    () => (draft?.state.sections ?? []).filter((s) => matchesPage(s, page)),
    [draft, page],
  );

  const previewPath = page
    ? page.type === 'landing'
      ? ''
      : page.type === 'order'
        ? '/order'
        : page.type === 'catering'
          ? '/catering'
          : `/${page.slug}`
    : '';
  const previewSrc = draft ? `${WEB_URL}/r/${resolveSlug(draft)}${previewPath}?preview=1` : '';

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
            {previewSrc ? (
              <iframe
                key={previewSrc + device}
                src={previewSrc}
                title="Aperçu"
                className="border-0 bg-white shadow-xl"
                style={
                  device === 'mobile'
                    ? { width: 390, height: '100%', borderRadius: 16 }
                    : { width: '100%', height: '100%' }
                }
              />
            ) : (
              <p className="text-sm text-neutral-400">Aucun aperçu.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Editor panel ─────────────────────────────────────────────────────────────

function PageEditor({
  page,
  tab,
  setTab,
  sections,
}: {
  page: DraftPagePayload;
  tab: Tab;
  setTab: (t: Tab) => void;
  sections: DraftSectionPayload[];
}) {
  const overrides = page.appearance_overrides ?? {};
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

      {tab === 'contenu' && (
        <div className="space-y-1.5">
          {sections.length === 0 && (
            <p className="text-xs text-neutral-400">Aucune section sur cette page.</p>
          )}
          {sections.map((s) => (
            <div
              key={s.id ?? s.tmp_id}
              className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs"
            >
              <span className="h-2 w-2 rounded-full bg-neutral-300" />
              <span className="text-neutral-700">{sectionLabel(s.section_type)}</span>
              {!s.is_visible && <span className="ml-auto text-[10px] text-neutral-400">masqué</span>}
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
          {page.type === 'order' && (
            <p className="pt-1 text-[11px] text-neutral-400">
              Formulaire de commande, OTP, livraison/retrait et menus affichés se règlent ici.
            </p>
          )}
        </div>
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

function resolveSlug(draft: DraftResponse): string {
  const cfg = draft.state.config as Record<string, any>;
  return cfg?.slug || cfg?.restaurant_slug || '';
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
