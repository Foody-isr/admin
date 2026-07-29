'use client';

import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  getWebsiteConfig, updateWebsiteConfig, resetWebsiteConfig, getRestaurant, updateRestaurant,
  listWebsiteSections, createWebsiteSection, updateWebsiteSection,
  deleteWebsiteSection, reorderWebsiteSections, listSiteStyles,
  uploadRestaurantLogo, uploadRestaurantBackground,
  getThemeCatalog,
  getWebsiteDraft, saveWebsiteDraft, publishWebsiteDraft, discardWebsiteDraft,
  DraftStatePayload, DraftSectionPayload,
  WebsiteConfig, WebsiteSection, SiteStylePreset, Restaurant,
  ThemeCatalog, WebsitePageMeta, updateGroup, uploadGroupImage, uploadWebsiteFont,
} from '@/lib/api';
import type { BannerDesign, ExtraFont } from '@/lib/api';
import { FontSelect } from '@/components/website-menu/FontSelect';
import { curatedFontWeights, WEIGHT_LABELS, loadWebsiteFont } from '@/lib/website-fonts';
import { BannerDesignerPanel } from '@/components/website-menu/BannerDesignerPanel';
import { ThemesPanel } from '@/components/website-menu/ThemesPanel';
import { TypographyPanel } from '@/components/website-menu/TypographyPanel';
import { BrandingPanel } from '@/components/website-menu/BrandingPanel';
import { CoverBackgroundEditor } from '@/components/website-menu/CoverBackgroundEditor';
import { SECTION_TYPE_META, SectionImageUploader, SectionSettingsPanel, getDefaultContent } from '@/components/website/SectionEditors';
import { SelectionOverlay, SectionBounds } from '@/components/website/SelectionOverlay';
import CheckoutEditor from '@/components/website/CheckoutEditor';
import { WEBSITE_TEMPLATES, type WebsiteTemplate } from './templates';
import CheckoutPreviewIframe from '@/components/website/CheckoutPreviewIframe';
import { OrderPageInfoEditor } from '@/components/website/OrderPageInfoEditor';
import { PageCommercePanel } from '@/components/website/PageCommercePanel';
import type { CheckoutConfig, OrderPageInfo } from '@/lib/api';
import { WEBSITE_FONT_FAMILIES } from '@/lib/website-fonts';

type MenuSubTab = 'themes' | 'typography' | 'branding';
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

type HeroCoverLayout = 'card' | 'logo' | 'bare';
/** Coerces a stored cover-layout value to a known option; unknowns fall back to 'card'. */
const asHeroCoverLayout = (v: string | undefined | null): HeroCoverLayout =>
  v === 'logo' || v === 'bare' ? v : 'card';

/** Human label for the page currently being edited (for the top-bar context). */
function activePageLabelFor(activePage: string, pages: WebsitePageMeta[]): string {
  switch (activePage) {
    case 'home': return 'Accueil';
    case 'menu': return 'Page de commande';
    case 'catering': return 'Traiteur';
    case '_site': return 'Pied de page';
    default: return pages.find((p) => p.slug === activePage)?.label ?? activePage;
  }
}

type PreviewMessage = {
  type: 'foody-theme-preview';
  themeId: string;
  pairingId: string;
  brandColor: string | null;
  layoutDefault: 'compact' | 'magazine';
  layoutDefaultMobile: '' | 'compact' | 'magazine';
  logoSize: number;
  hideNavbarName: boolean;
  hideHeroLogo: boolean;
  heroLogoBg: 'white' | 'black';
  heroCoverLayout: HeroCoverLayout;
  heroLogoSize: number;
  heroNameFont: string;
  tagline: string;
  socialLinks: Record<string, string>;
  navbarStyle: string;
  navbarColor: string;
  // Restaurant-level visuals (logo, cover, background) — live on the Restaurant,
  // not WebsiteConfig — so the preview reflects cover/logo edits too.
  restaurantPreview: {
    logoUrl: string;
    coverUrl: string;
    coverDisplayMode: string;
    coverFocalX: number;
    coverFocalY: number;
    backgroundColor: string;
  } | null;
  customPalette: WebsiteConfig['custom_palette'] | null;
  sectionColors: WebsiteConfig['section_colors'] | null;
  faviconURL: string;
  categoryBannerStyle: '' | 'image-overlay' | 'image-only' | 'text-block' | 'striped-rule' | 'color-title' | 'none';
  categoryBannerOverlay: number;
  categoryBannerFit: 'cover' | 'contain' | 'natural';
  categoryBannerFitMobile: '' | 'cover' | 'contain' | 'natural';
  // Order-page info — posted in foodyweb shape (modalText, not modal_text).
  orderPageInfo: { bar: OrderPageInfo['bar']; modal: OrderPageInfo['modal']; modalText: string } | null;
  direction: 'ltr' | 'rtl';
  typography?: WebsiteConfig['typography'] | null;
};

// ─── Constants ──────────────────────────────────────────────────────

// Font choices for the hero-name and section font pickers. Sourced from the
// shared curated library (kept in sync with foodyweb's loader) so all pickers
// offer the same expanded set.
const FONT_OPTIONS = WEBSITE_FONT_FAMILIES;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 5) return "à l'instant";
  if (diffSec < 60) return `il y a ${diffSec}s`;
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return `il y a ${Math.floor(diffSec / 86400)} j`;
}

// ─── Main Component ─────────────────────────────────────────────────

type Tab = 'styles' | 'sections';

export default function WebsitePage() {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  // Catering is offered as an editable "Traiteur" page only when this restaurant
  // has catering (same catering.manage gate used across the catering section).
  const canManageCatering = hasAnyPermission('catering.manage');
  const params = useParams();
  const router = useRouter();
  const restaurantId = Number(params.restaurantId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('sections');
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');

  // ─── Editor mode (new 3-way IA) ─────────────────────────────────
  // Pages: edit the section content of Landing + Order pages.
  // Thème: global colors, typography, logo, favicon — applies to BOTH pages.
  // Paramètres: slug, contact display toggles, social links, SEO.
  // The old "Site Settings"/"Section Settings" duality is gone.
  type EditorMode = 'pages' | 'theme' | 'checkout' | 'settings';
  type ThemeSubMode = 'colors' | 'typography' | 'logo' | 'navbar';
  type SettingsSubMode = 'general' | 'contact' | 'social' | 'orderInfo' | 'seo';
  const [editorMode, setEditorMode] = useState<EditorMode>('pages');
  const [themeSubMode, setThemeSubMode] = useState<ThemeSubMode>('colors');
  const [settingsSubMode, setSettingsSubMode] = useState<SettingsSubMode>('general');

  // ─── Draft / publish state ────────────────────────────────────────
  // The editor edits a draft snapshot stored on the server; customers see
  // the live columns unchanged until Publier promotes the draft.
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Sections inserted in the editor but not yet persisted carry a stable tmp_id
  // (uuid) and have id === 0. Server returns them under tmp_id until publish.
  const newSectionTmpIds = useRef<Map<number, string>>(new Map());
  // Sections deleted in the editor but originally persisted — tracked so we
  // can send them in `deleted_section_ids` on save.
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  // Suppress autosave during initial load + during publish/discard refresh.
  // Also a content-based skip: lastSavedPayloadRef holds the most recent
  // server-confirmed shape; autosave compares against it and noops when
  // the current shape is identical (prevents phantom saves from hydration).
  const suppressAutosaveRef = useRef(true);
  const lastSavedPayloadRef = useRef<string>('');
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Selection overlay state ─────────────────────────────────────
  // Bounds reported by the foodyweb iframe and the iframe's current viewport
  // rect together let SelectionOverlay draw outlines + the floating toolbar
  // directly over the live preview.
  const [sectionBounds, setSectionBounds] = useState<SectionBounds[]>([]);
  const [iframeRect, setIframeRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [iframeScrollY, setIframeScrollY] = useState(0);
  const handleBoundsUpdate = useCallback((bounds: SectionBounds[], scrollY: number) => {
    if (bounds.length > 0) setSectionBounds(bounds);
    setIframeScrollY(scrollY);
  }, []);
  const handleIframeRectUpdate = useCallback((rect: { top: number; left: number; width: number; height: number } | null) => {
    setIframeRect(rect);
  }, []);

  // Resizable left sidebar (persisted to localStorage, bounded 220–520 px).
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizingRef = useRef(false);
  const dragStateRef = useRef({ x: 0, w: 0 });

  useEffect(() => {
    const stored = Number(localStorage.getItem('foody-website-sidebar-w'));
    if (Number.isFinite(stored) && stored >= 220 && stored <= 520) {
      setSidebarWidth(stored);
    }
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isResizingRef.current) return;
      const next = Math.max(220, Math.min(520, dragStateRef.current.w + (e.clientX - dragStateRef.current.x)));
      setSidebarWidth(next);
    }
    function onUp() {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('foody-website-sidebar-w', String(sidebarWidth)); } catch {}
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarWidth]);

  const startSidebarResize = useCallback((e: React.MouseEvent) => {
    isResizingRef.current = true;
    dragStateRef.current = { x: e.clientX, w: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // Data
  const [config, setConfig] = useState<WebsiteConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [sections, setSections] = useState<WebsiteSection[]>([]);
  const [siteStyles, setSiteStyles] = useState<SiteStylePreset[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  // "Couleur + titre" banner designer: which category banner is selected in the
  // preview, plus its working design. Populated when the user clicks a banner.
  const [selectedBanner, setSelectedBanner] = useState<{ groupId: number; design: BannerDesign } | null>(null);
  const bannerSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activePage, setActivePage] = useState('home');
  // Custom pages (beyond the built-in home + menu). Each renders at
  // /r/<slug>/<page.slug> on foodyweb and appears in the hamburger nav.
  const [pages, setPages] = useState<WebsitePageMeta[]>([]);

  // Config form state — landing-page concerns only.
  // Menu/order page styling lives under /website/menu/{themes,typography,branding}.
  const [tagline, setTagline] = useState('');
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showHours, setShowHours] = useState(true);
  // navbar_style / navbar_color now live on `config` (edited in the Thème →
  // Navigation panel and persisted via buildDraftPayload). The old dedicated
  // local-state pipeline + the duplicate Paramètres → Général dropdown were
  // removed — they silently overwrote the panel's picks on save.
  const [logoSize, setLogoSize] = useState<number>(40);
  const [hideNavbarName, setHideNavbarName] = useState<boolean>(false);
  const [heroNameFont, setHeroNameFont] = useState<string>('');
  const [categoryBannerStyle, setCategoryBannerStyle] = useState<'' | 'image-overlay' | 'image-only' | 'text-block' | 'striped-rule' | 'color-title' | 'none'>('image-overlay');
  const [categoryBannerOverlay, setCategoryBannerOverlay] = useState<number>(40);
  const [categoryBannerFit, setCategoryBannerFit] = useState<'cover' | 'contain' | 'natural'>('cover');
  // Mobile fit override: '' means "inherit the desktop value".
  const [categoryBannerFitMobile, setCategoryBannerFitMobile] = useState<'' | 'cover' | 'contain' | 'natural'>('');
  const [landingEnabled, setLandingEnabled] = useState<boolean>(true);
  // CheckoutConfig is null until the owner opens the Checkout tab and saves —
  // null/undefined sentinels keep existing restaurants on the legacy flow.
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);
  // Order-page info placement (metadata bar per mode + Plus modal). Null until
  // the owner edits it; foodyweb falls back to its default item set.
  const [orderPageInfo, setOrderPageInfo] = useState<OrderPageInfo | null>(null);
  // Which sub-tab is active in the Commande editor (delivery / pickup /
  // confirmation). Lifted up so the preview iframe URL stays in sync with the
  // section the owner is editing.
  const [checkoutSubTab, setCheckoutSubTab] = useState<'delivery' | 'pickup' | 'confirmation'>('delivery');

  const selectedSection = sections.find(s => s.id === selectedSectionId) || null;
  // The site-wide footer (prefer the canonical "_site" one; fall back to any
  // footer for pre-migration data).
  const footerSection =
    sections.find((s) => s.section_type === 'footer' && s.page === '_site') ||
    sections.find((s) => s.section_type === 'footer') ||
    null;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Menu-tab state: theme catalog + sub-tab + iframe ref + debounced save
  const [themeCatalog, setThemeCatalog] = useState<ThemeCatalog | null>(null);
  const [menuSubTab, setMenuSubTab] = useState<MenuSubTab>('themes');
  const menuIframeRef = useRef<HTMLIFrameElement>(null);
  const menuSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getThemeCatalog().then(setThemeCatalog).catch(() => {});
    return () => {
      if (menuSaveTimerRef.current) clearTimeout(menuSaveTimerRef.current);
    };
  }, []);

  const postMenuPreview = useCallback((next: WebsiteConfig) => {
    const win = menuIframeRef.current?.contentWindow;
    if (!win) return;
    const message: PreviewMessage = {
      type: 'foody-theme-preview',
      themeId: next.theme_id,
      pairingId: next.pairing_id,
      brandColor: next.brand_color,
      layoutDefault: next.layout_default,
      layoutDefaultMobile: next.layout_default_mobile || '',
      logoSize: next.logo_size,
      hideNavbarName: next.hide_navbar_name,
      hideHeroLogo: next.hide_hero_logo,
      heroLogoBg: next.hero_logo_bg === 'black' ? 'black' : 'white',
      heroCoverLayout: asHeroCoverLayout(next.hero_cover_layout),
      heroLogoSize: next.hero_logo_size > 0 ? next.hero_logo_size : 100,
      // These two are edited in dedicated state (not `config`), so read them
      // from the live state vars rather than `next`.
      heroNameFont,
      tagline,
      navbarStyle: next.navbar_style || 'solid',
      navbarColor: next.navbar_color || '',
      socialLinks: next.social_links ?? {},
      restaurantPreview: restaurant
        ? {
            logoUrl: restaurant.logo_url || '',
            coverUrl: restaurant.cover_url || '',
            coverDisplayMode: restaurant.cover_display_mode || '',
            coverFocalX: restaurant.cover_focal_x ?? 50,
            coverFocalY: restaurant.cover_focal_y ?? 50,
            backgroundColor: restaurant.background_color || '',
          }
        : null,
      customPalette: next.custom_palette ?? null,
      sectionColors: next.section_colors ?? null,
      faviconURL: next.favicon_url || '',
      // Banner style + overlay live in dedicated state (not `config`), so they
      // ride along here to live-update the menu preview as the admin edits them.
      categoryBannerStyle,
      categoryBannerOverlay,
      categoryBannerFit,
      categoryBannerFitMobile,
      orderPageInfo: orderPageInfo
        ? { bar: orderPageInfo.bar, modal: orderPageInfo.modal, modalText: orderPageInfo.modal_text ?? '' }
        : null,
      direction: 'ltr',
      typography: next.typography ?? null,
    };
    win.postMessage(message, '*');
  }, [categoryBannerStyle, categoryBannerOverlay, categoryBannerFit, categoryBannerFitMobile, orderPageInfo, heroNameFont, tagline, restaurant]);

  // Re-post the menu preview whenever the banner controls change so the iframe
  // reflects them live (these fields are not part of `config`, so the config
  // autosave effect below would not otherwise trigger a re-post).
  useEffect(() => {
    if (config) postMenuPreview(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryBannerStyle, categoryBannerOverlay, categoryBannerFit, categoryBannerFitMobile, orderPageInfo]);

  // Re-post when dedicated-state fields (tagline, navbar, hero font) or the
  // restaurant-level visuals (logo, cover, background) change. These live
  // outside `config`, so a config change wouldn't otherwise trigger a re-post.
  useEffect(() => {
    if (config) postMenuPreview(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroNameFont, tagline,
      restaurant?.logo_url, restaurant?.cover_url, restaurant?.background_color,
      restaurant?.cover_display_mode, restaurant?.cover_focal_x, restaurant?.cover_focal_y]);

  const handleMenuConfigUpdate = useCallback((patch: Partial<WebsiteConfig>) => {
    // Local-state-only — the global autosave effect persists to the draft.
    // (Previously this called updateWebsiteConfig directly, which bypassed
    // the draft model and wrote straight to live config — defeating the
    // "Publier is a real action" promise.)
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.logo_size !== undefined) setLogoSize(patch.logo_size);
      if (patch.hide_navbar_name !== undefined) setHideNavbarName(patch.hide_navbar_name);
      postMenuPreview(next);
      return next;
    });
  }, [postMenuPreview]);

  // When a section is selected, show section settings (not site styles)
  useEffect(() => {
    if (selectedSectionId) {
      setActiveTab('sections');
      setShowSettingsPanel(true);
    }
  }, [selectedSectionId]);

  // Listen for section clicks + banner focal edits from inside the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'foody-select-section' && typeof e.data.sectionId === 'number') {
        setSelectedSectionId(e.data.sectionId);
      } else if (
        e.data?.type === 'foody-banner-focal' &&
        e.data.groupId != null &&
        typeof e.data.x === 'number' &&
        typeof e.data.y === 'number'
      ) {
        // The customer dragged the focal dot on a category banner in the
        // preview. Persist it live to the group (banner images live outside the
        // website draft, so the focal point does too). Fire-and-forget.
        const groupId = Number(e.data.groupId);
        if (Number.isFinite(groupId)) {
          updateGroup(restaurantId, groupId, {
            banner_focal_x: e.data.x,
            banner_focal_y: e.data.y,
          }).catch(() => {});
        }
      } else if (e.data?.type === 'foody-select-banner' && e.data.groupId != null) {
        // User clicked a "color-title" banner in the preview — open its designer.
        setSelectedBanner({ groupId: Number(e.data.groupId), design: (e.data.design ?? {}) as BannerDesign });
      } else if (e.data?.type === 'foody-banner-design-change' && e.data.groupId != null) {
        // User dragged a sticker in the preview — sync the design and persist it.
        const groupId = Number(e.data.groupId);
        const design = (e.data.design ?? {}) as BannerDesign;
        setSelectedBanner((prev) => (prev && prev.groupId === groupId ? { groupId, design } : prev));
        persistBannerDesign(groupId, design);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Persist a banner design to the group (debounced per group). Banner designs
  // live on the group like the image/focal point, so they save live.
  const persistBannerDesign = useCallback((groupId: number, design: BannerDesign) => {
    clearTimeout(bannerSaveTimers.current[groupId]);
    bannerSaveTimers.current[groupId] = setTimeout(() => {
      updateGroup(restaurantId, groupId, { banner_design: design }).catch(() => {});
    }, 400);
  }, [restaurantId]);

  // Apply a design edit from the admin panel: update local state, push it to the
  // preview iframe for a live update, and persist it.
  const applyBannerDesign = useCallback((groupId: number, design: BannerDesign) => {
    setSelectedBanner({ groupId, design });
    menuIframeRef.current?.contentWindow?.postMessage({ type: 'foody-banner-design', groupId, design }, '*');
    persistBannerDesign(groupId, design);
  }, [persistBannerDesign]);

  function closeSettings() {
    setShowSettingsPanel(false);
    setSelectedSectionId(null);
  }

  // Filter sections by active page, footer always last. The "Page de commande"
  // pseudo-page (activePage 'menu') hosts sections stored under the reserved
  // 'order' slug (consumed by the order route; avoids a phantom /menu page).
  const activeSectionPage = activePage === 'menu' ? 'order' : activePage;
  const filteredSections = sections
    .filter(s => (s.page || 'home') === activeSectionPage)
    .sort((a, b) => {
      if (a.section_type === 'footer') return 1;
      if (b.section_type === 'footer') return -1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  // ─── Load Data ──────────────────────────────────────────────────

  // Helper: hydrate component state from a fresh draft response.
  const hydrateFromDraft = useCallback((draft: { state: DraftStatePayload; draft_dirty: boolean; draft_saved_at?: string | null; published_at?: string | null }) => {
    suppressAutosaveRef.current = true;
    setDraftDirty(draft.draft_dirty);
    setDraftSavedAt(draft.draft_saved_at || null);
    setPublishedAt(draft.published_at || null);

    const stateConfig = draft.state.config || {};
    setConfig({
      ...(config || {}),
      ...stateConfig,
      restaurant_id: restaurantId,
    } as WebsiteConfig);
    setTagline(stateConfig.tagline || '');
    setShowAddress(stateConfig.show_address ?? true);
    setShowPhone(stateConfig.show_phone ?? true);
    setShowHours(stateConfig.show_hours ?? true);
    setLogoSize(stateConfig.logo_size > 0 ? stateConfig.logo_size : 40);
    setHideNavbarName(stateConfig.hide_navbar_name || false);
    setHeroNameFont(stateConfig.hero_name_font || '');
    setCategoryBannerStyle((stateConfig.category_banner_style as typeof categoryBannerStyle) || 'image-overlay');
    setCategoryBannerOverlay(stateConfig.category_banner_overlay ?? 40);
    setCategoryBannerFit(stateConfig.category_banner_fit === 'contain' || stateConfig.category_banner_fit === 'natural' ? stateConfig.category_banner_fit : 'cover');
    setCategoryBannerFitMobile(stateConfig.category_banner_fit_mobile === 'cover' || stateConfig.category_banner_fit_mobile === 'contain' || stateConfig.category_banner_fit_mobile === 'natural' ? stateConfig.category_banner_fit_mobile : '');
    setPages(Array.isArray(stateConfig.pages) ? stateConfig.pages : []);
    const landingOn = stateConfig.landing_enabled ?? true;
    setLandingEnabled(landingOn);
    // If landing is disabled, the page switcher hides "Landing"; make sure the
    // editor isn't sitting on a page that's no longer reachable.
    if (!landingOn) setActivePage('menu');
    setCheckoutConfig((stateConfig.checkout_config ?? null) as CheckoutConfig | null);
    setOrderPageInfo((stateConfig.order_page_info ?? null) as OrderPageInfo | null);

    // Sections: assign synthetic negative ids to tmp_id-only sections so
    // existing UI keeps working with a numeric `id` field. The tmp_id is
    // preserved in newSectionTmpIds for use when saving back to the server.
    const tmpIdMap = new Map<number, string>();
    let nextSynthId = -1;
    const sections = (draft.state.sections || []).map((s) => {
      let id = s.id || 0;
      if (!id && s.tmp_id) {
        id = nextSynthId--;
        tmpIdMap.set(id, s.tmp_id);
      }
      return {
        id,
        restaurant_id: restaurantId,
        section_type: s.section_type,
        page: s.page || 'home',
        sort_order: s.sort_order ?? 0,
        is_visible: s.is_visible ?? true,
        layout: s.layout || 'default',
        content: s.content || {},
        settings: s.settings || {},
        created_at: '',
        updated_at: '',
      } as WebsiteSection;
    });
    newSectionTmpIds.current = tmpIdMap;
    setSections(sections);
    setDeletedIds([]);
    // Seed the autosave snapshot so the next render's buildDraftPayload()
    // matches and the global autosave effect noops until the user actually
    // edits something. We rebuild the snapshot in the same shape as
    // buildDraftPayload to guarantee an exact byte match.
    setTimeout(() => {
      lastSavedPayloadRef.current = JSON.stringify({
        config: {
          theme_id: stateConfig.theme_id || 'editorial-dark',
          pairing_id: stateConfig.pairing_id || 'modern-sans',
          brand_color: stateConfig.brand_color ?? null,
          layout_default: stateConfig.layout_default || 'magazine',
          layout_default_mobile: stateConfig.layout_default_mobile || '',
          hero_layout: stateConfig.hero_layout || 'standard',
          welcome_text: stateConfig.welcome_text || '',
          tagline: stateConfig.tagline || '',
          social_links: stateConfig.social_links || {},
          show_address: stateConfig.show_address ?? true,
          show_phone: stateConfig.show_phone ?? true,
          show_hours: stateConfig.show_hours ?? true,
          favicon_url: stateConfig.favicon_url || '',
          hero_cta_text: stateConfig.hero_cta_text || 'Start Your Order',
          mid_cta_enabled: stateConfig.mid_cta_enabled ?? true,
          mid_cta_title: stateConfig.mid_cta_title || '',
          mid_cta_body: stateConfig.mid_cta_body || '',
          mid_cta_btn_text: stateConfig.mid_cta_btn_text || '',
          footer_text: stateConfig.footer_text || '',
          navbar_style: stateConfig.navbar_style || 'solid',
          navbar_color: stateConfig.navbar_color || '',
          logo_size: stateConfig.logo_size > 0 ? stateConfig.logo_size : 40,
          hide_navbar_name: stateConfig.hide_navbar_name || false,
          navbar_logo_position: stateConfig.navbar_logo_position || 'left',
          navbar_scrolled_logo_url: stateConfig.navbar_scrolled_logo_url || '',
          navbar_text_color: stateConfig.navbar_text_color || '',
          navbar_overlay_text_color: stateConfig.navbar_overlay_text_color || '',
          navbar_cta: stateConfig.navbar_cta ?? null,
          navbar_show_links: stateConfig.navbar_show_links ?? true,
          navbar_hamburger: stateConfig.navbar_hamburger || 'mobile',
          navbar_font: stateConfig.navbar_font || '',
          navbar_type: stateConfig.navbar_type ?? null,
          navbar_link_style: stateConfig.navbar_link_style || 'text',
          nav_layout: stateConfig.nav_layout ?? null,
          nav_order: stateConfig.nav_order || '',
          hide_hero_logo: stateConfig.hide_hero_logo || false,
          hero_logo_bg: stateConfig.hero_logo_bg === 'black' ? 'black' : 'white',
          hero_cover_layout: asHeroCoverLayout(stateConfig.hero_cover_layout),
          hero_logo_size: stateConfig.hero_logo_size > 0 ? stateConfig.hero_logo_size : 100,
          custom_palette: stateConfig.custom_palette ?? null,
          section_colors: stateConfig.section_colors ?? null,
          hero_name_font: stateConfig.hero_name_font || '',
          category_banner_style: stateConfig.category_banner_style || 'image-overlay',
          category_banner_overlay: stateConfig.category_banner_overlay ?? 40,
          category_banner_fit: stateConfig.category_banner_fit === 'contain' || stateConfig.category_banner_fit === 'natural' ? stateConfig.category_banner_fit : 'cover',
          category_banner_fit_mobile: stateConfig.category_banner_fit_mobile === 'cover' || stateConfig.category_banner_fit_mobile === 'contain' || stateConfig.category_banner_fit_mobile === 'natural' ? stateConfig.category_banner_fit_mobile : '',
          typography: stateConfig.typography ?? null,
          pages: Array.isArray(stateConfig.pages) ? stateConfig.pages : [],
          landing_enabled: stateConfig.landing_enabled ?? true,
          ...(stateConfig.checkout_config != null ? { checkout_config: stateConfig.checkout_config } : {}),
          ...(stateConfig.order_page_info != null ? { order_page_info: stateConfig.order_page_info } : {}),
        },
        sections: sections.map((s) => {
          const tmp = tmpIdMap.get(s.id);
          return {
            ...(tmp ? { tmp_id: tmp } : { id: s.id }),
            section_type: s.section_type,
            page: s.page || 'home',
            sort_order: s.sort_order ?? 0,
            is_visible: s.is_visible,
            layout: s.layout || 'default',
            content: s.content || {},
            settings: s.settings || {},
          };
        }),
        deleted_section_ids: [],
      });
      suppressAutosaveRef.current = false;
    }, 50);
  }, [restaurantId, config]);

  useEffect(() => {
    async function load() {
      try {
        const [draft, rest, styles] = await Promise.all([
          getWebsiteDraft(restaurantId),
          getRestaurant(restaurantId),
          listSiteStyles(),
        ]);
        setRestaurant(rest);
        setSiteStyles(styles);

        // Auto-create the site-wide footer if missing. Only NON-DELETABLE
        // sections may be auto-seeded here: this runs on every builder load, so
        // seeding a user-deletable type (e.g. action_buttons) would resurrect it
        // on the next refresh right after the user deleted it. The footer is
        // safe because it can never be deleted (see isDeletable). New sites get
        // their optional sections (CTAs, etc.) from templates or "+ Ajouter".
        const existingTypes = new Set((draft.state.sections || []).map((s) => s.section_type));
        const missing: DraftSectionPayload[] = [];
        if (!existingTypes.has('footer')) {
          // The footer is site-wide (page "_site") — it renders at the bottom of
          // every page, independent of the landing toggle.
          missing.push({
            tmp_id: `tmp_${Date.now()}_footer`, section_type: 'footer', page: '_site',
            is_visible: true, layout: 'columns', sort_order: 99,
            content: getDefaultContent('footer'), settings: { color_style: 'dark' },
          });
        }
        if (missing.length > 0) {
          draft.state.sections = [...(draft.state.sections || []), ...missing];
        }
        hydrateFromDraft(draft);
      } catch (err: any) {
        setError(err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
    // hydrateFromDraft intentionally NOT in deps — first-load only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // ─── Build the current draft payload from local state ──────────────

  const buildDraftPayload = useCallback((): DraftStatePayload => {
    return {
      config: {
        theme_id: config?.theme_id || 'editorial-dark',
        pairing_id: config?.pairing_id || 'modern-sans',
        brand_color: config?.brand_color ?? null,
        layout_default: config?.layout_default || 'magazine',
        layout_default_mobile: config?.layout_default_mobile || '',
        hero_layout: config?.hero_layout || 'standard',
        welcome_text: config?.welcome_text || '',
        tagline,
        social_links: config?.social_links || {},
        show_address: showAddress,
        show_phone: showPhone,
        show_hours: showHours,
        favicon_url: config?.favicon_url || '',
        hero_cta_text: config?.hero_cta_text || 'Start Your Order',
        mid_cta_enabled: config?.mid_cta_enabled ?? true,
        mid_cta_title: config?.mid_cta_title || '',
        mid_cta_body: config?.mid_cta_body || '',
        mid_cta_btn_text: config?.mid_cta_btn_text || '',
        footer_text: config?.footer_text || '',
        navbar_style: config?.navbar_style || 'solid',
        navbar_color: config?.navbar_color || '',
        logo_size: logoSize,
        hide_navbar_name: hideNavbarName,
        navbar_logo_position: config?.navbar_logo_position || 'left',
        navbar_scrolled_logo_url: config?.navbar_scrolled_logo_url || '',
        navbar_text_color: config?.navbar_text_color || '',
        navbar_overlay_text_color: config?.navbar_overlay_text_color || '',
        navbar_cta: config?.navbar_cta ?? null,
        navbar_show_links: config?.navbar_show_links ?? true,
        navbar_hamburger: config?.navbar_hamburger || 'mobile',
        navbar_font: config?.navbar_font || '',
        navbar_type: config?.navbar_type ?? null,
        navbar_link_style: config?.navbar_link_style || 'text',
        nav_layout: config?.nav_layout ?? null,
        nav_order: config?.nav_order || '',
        hide_hero_logo: config?.hide_hero_logo ?? false,
        hero_logo_bg: config?.hero_logo_bg === 'black' ? 'black' : 'white',
        hero_cover_layout: asHeroCoverLayout(config?.hero_cover_layout),
        hero_logo_size: config?.hero_logo_size && config.hero_logo_size > 0 ? config.hero_logo_size : 100,
        custom_palette: config?.custom_palette ?? null,
        section_colors: config?.section_colors ?? null,
        hero_name_font: heroNameFont,
        category_banner_style: categoryBannerStyle,
        category_banner_overlay: categoryBannerOverlay,
        category_banner_fit: categoryBannerFit,
        category_banner_fit_mobile: categoryBannerFitMobile,
        typography: config?.typography ?? null,
        pages,
        landing_enabled: landingEnabled,
        ...(checkoutConfig != null ? { checkout_config: checkoutConfig } : {}),
        ...(orderPageInfo != null ? { order_page_info: orderPageInfo } : {}),
      },
      sections: sections.map((s) => {
        const tmpId = newSectionTmpIds.current.get(s.id);
        return {
          ...(tmpId ? { tmp_id: tmpId } : { id: s.id }),
          section_type: s.section_type,
          page: s.page || 'home',
          sort_order: s.sort_order ?? 0,
          is_visible: s.is_visible,
          layout: s.layout || 'default',
          content: s.content || {},
          settings: s.settings || {},
        } as DraftSectionPayload;
      }),
      deleted_section_ids: deletedIds,
    };
  }, [config, tagline, showAddress, showPhone, showHours, logoSize, hideNavbarName, heroNameFont, categoryBannerStyle, categoryBannerOverlay, categoryBannerFit, categoryBannerFitMobile, pages, landingEnabled, checkoutConfig, orderPageInfo, sections, deletedIds]);

  // ─── Autosave: persist the entire draft on any local change ──────

  useEffect(() => {
    if (loading || suppressAutosaveRef.current) return;
    // Content-based skip — if the current payload matches what we last saved,
    // nothing has actually changed (e.g. transient re-render after hydration).
    const serialized = JSON.stringify(buildDraftPayload());
    if (serialized === lastSavedPayloadRef.current) return;

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(async () => {
      try {
        const payload = buildDraftPayload();
        const resp = await saveWebsiteDraft(restaurantId, payload);
        lastSavedPayloadRef.current = JSON.stringify(payload);
        setDraftDirty(resp.draft_dirty);
        setDraftSavedAt(resp.draft_saved_at || null);
      } catch (err: any) {
        setError(err.message || 'Autosave failed');
      }
    }, 400);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [loading, restaurantId, buildDraftPayload]);

  // ─── Publish ───────────────────────────────────────────────────

  const handlePublish = useCallback(async () => {
    // Flush any pending autosave first so the freshest state is published.
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
      try {
        await saveWebsiteDraft(restaurantId, buildDraftPayload());
      } catch {}
    }
    setSaving(true); setSaved(false); setError('');
    try {
      const resp = await publishWebsiteDraft(restaurantId);
      hydrateFromDraft(resp);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  }, [restaurantId, buildDraftPayload, hydrateFromDraft]);

  // ─── Discard ───────────────────────────────────────────────────

  const handleDiscard = useCallback(async () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    setShowDiscardConfirm(false);
    setError('');
    try {
      const resp = await discardWebsiteDraft(restaurantId);
      hydrateFromDraft(resp);
      setSelectedSectionId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to discard');
    }
  }, [restaurantId, hydrateFromDraft]);

  // Legacy "reset to defaults" — kept for the gear-icon "Reset" button in
  // the style panel. Discard is now the primary "undo" affordance.
  const handleResetConfig = useCallback(async () => {
    try {
      const data = await resetWebsiteConfig(restaurantId);
      // After resetting the published state, re-hydrate from the draft endpoint
      // so we're back in sync with the server's view of the world.
      const draft = await getWebsiteDraft(restaurantId);
      hydrateFromDraft(draft);
    } catch (err: any) {
      setError(err.message || 'Failed to reset');
    }
  }, [restaurantId, hydrateFromDraft]);

  // ─── Custom page CRUD ───────────────────────────────────────────
  // Custom pages are metadata (slug + label + order) in `pages`; their content
  // is the set of sections whose `page` equals the slug. All local-state only;
  // the autosave effect persists, Publier promotes.

  const reservedSlugs = new Set(['home', 'menu', 'order', 'orders', 'table', 'payment', 'pickup', 'delivery', 't', '_site']);

  function slugifyPage(label: string): string {
    // NFD splits accented letters into base + combining mark; stripping
    // non-ASCII then drops the marks (é -> e) without a combining-char regex.
    const base = label
      .normalize('NFD').replace(/[^\x00-\x7F]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page';
    let slug = base;
    let n = 2;
    const taken = new Set<string>(pages.map((p) => p.slug));
    reservedSlugs.forEach((s) => taken.add(s));
    while (taken.has(slug)) slug = `${base}-${n++}`;
    return slug;
  }

  function handleAddPage() {
    const slug = slugifyPage('page');
    const label = `Nouvelle page ${pages.length + 1}`;
    setPages((prev) => [...prev, { slug, label, sort_order: prev.length, show_in_nav: true }]);
    setActivePage(slug);
    setSelectedSectionId(null);
  }

  function handleRenamePage(slug: string, label: string) {
    setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, label } : p)));
  }

  function handleTogglePageNav(slug: string, show: boolean) {
    setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, show_in_nav: show } : p)));
  }

  function handleTogglePageShopping(slug: string, shopping: boolean) {
    setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, is_shopping: shopping } : p)));
  }

  // Apply a ready-made template: replace the current page content with the
  // template's pages + sections (the site-wide footer is preserved). Existing
  // DB-backed sections are queued for deletion; the whole thing autosaves as a
  // draft the owner can then tweak and publish.
  function applyTemplate(tpl: WebsiteTemplate) {
    const footer = sections.find((s) => s.section_type === 'footer');
    const toDelete = sections.filter((s) => s.id > 0 && s.section_type !== 'footer').map((s) => s.id);
    if (toDelete.length > 0) setDeletedIds((prev) => [...prev, ...toDelete]);

    const tmpMap = new Map<number, string>();
    let synth = -1;
    const stamp = Date.now();
    const templateSections: WebsiteSection[] = tpl.sections.map((s, i) => {
      const id = synth--;
      tmpMap.set(id, `tmp_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`);
      return {
        id,
        restaurant_id: restaurantId,
        section_type: s.section_type,
        page: s.page,
        sort_order: i,
        is_visible: true,
        layout: s.layout || 'default',
        content: s.content as Record<string, unknown>,
        settings: (s.settings as Record<string, unknown>) || { color_style: 'light', text_alignment: 'center', padding: 'normal' },
        created_at: '',
        updated_at: '',
      } as WebsiteSection;
    });
    newSectionTmpIds.current = tmpMap;
    setSections(footer ? [...templateSections, footer] : templateSections);
    setPages(tpl.pages);
    setLandingEnabled(true);
    setConfig((c) => (c ? ({ ...c, pages: tpl.pages, landing_enabled: true } as WebsiteConfig) : c));
    setActivePage('home');
    setSelectedSectionId(null);
    setShowTemplates(false);
  }

  function handleDeletePage(slug: string) {
    // Drop the page and queue its sections for deletion on publish.
    const owned = sections.filter((s) => s.page === slug);
    const realIds = owned.map((s) => s.id).filter((id) => id > 0);
    if (realIds.length > 0) setDeletedIds((prev) => [...prev, ...realIds]);
    owned.forEach((s) => newSectionTmpIds.current.delete(s.id));
    setSections((prev) => prev.filter((s) => s.page !== slug));
    setPages((prev) => prev.filter((p) => p.slug !== slug).map((p, i) => ({ ...p, sort_order: i })));
    if (activePage === slug) setActivePage(landingEnabled ? 'home' : 'menu');
  }

  function handleReorderPage(slug: string, dir: 'up' | 'down') {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.slug === slug);
      if (idx < 0) return prev;
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((p, i) => ({ ...p, sort_order: i }));
    });
  }

  // The site-wide footer is a single section at page "_site". Select it to edit
  // in the right panel; create one on first use.
  function handleSelectFooter() {
    const footers = sections.filter((s) => s.section_type === 'footer');
    if (footers.length > 0) {
      // Consolidate to a single canonical footer at page "_site"; queue any
      // duplicates (legacy footers on home/menu) for deletion on publish.
      const keep = footers.find((f) => f.page === '_site') || footers[0];
      const others = footers.filter((f) => f.id !== keep.id);
      if (others.length > 0 || keep.page !== '_site') {
        const otherRealIds = others.map((o) => o.id).filter((id) => id > 0);
        others.forEach((o) => newSectionTmpIds.current.delete(o.id));
        if (otherRealIds.length > 0) setDeletedIds((prev) => [...prev, ...otherRealIds]);
        setSections((prev) =>
          prev
            .filter((s) => s.section_type !== 'footer' || s.id === keep.id)
            .map((s) => (s.id === keep.id ? { ...s, page: '_site' } : s)),
        );
      }
      setActivePage('_site');
      setSelectedSectionId(keep.id);
      return;
    }
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let syntheticId = -1;
    newSectionTmpIds.current.forEach((_, k) => { if (k <= syntheticId) syntheticId = k - 1; });
    newSectionTmpIds.current.set(syntheticId, tmpId);
    const newFooter: WebsiteSection = {
      id: syntheticId,
      restaurant_id: restaurantId,
      section_type: 'footer',
      page: '_site',
      sort_order: 0,
      is_visible: true,
      layout: 'columns',
      content: getDefaultContent('footer'),
      settings: { color_style: 'dark' },
      created_at: '',
      updated_at: '',
    };
    setSections((prev) => [...prev, newFooter]);
    setActivePage('_site');
    setSelectedSectionId(syntheticId);
  }

  // ─── Section CRUD ───────────────────────────────────────────────

  // All section mutations now write to LOCAL state only. The autosave effect
  // persists the entire draft to the server on a 400ms debounce. The "Publier"
  // button promotes draft → live.

  function handleAddSection(sectionType: string) {
    setShowAddModal(false);
    // Assign a stable tmp_id (used to address the row on the server side
    // until publish replaces it with a real DB id) plus a synthetic negative
    // local id so the existing UI keeps treating sections as { id: number }.
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let syntheticId = -1;
    newSectionTmpIds.current.forEach((_, k) => { if (k <= syntheticId) syntheticId = k - 1; });
    newSectionTmpIds.current.set(syntheticId, tmpId);
    const newSection: WebsiteSection = {
      id: syntheticId,
      restaurant_id: restaurantId,
      section_type: sectionType,
      page: activePage === 'menu' ? 'order' : activePage,
      sort_order: sections.length,
      is_visible: true,
      layout: 'default',
      content: getDefaultContent(sectionType),
      settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' },
      created_at: '',
      updated_at: '',
    };
    setSections((prev) => [...prev, newSection]);
    setSelectedSectionId(syntheticId);
  }

  function handleDeleteSection(sectionId: number) {
    // If it's a previously persisted section (positive id), record its id
    // for inclusion in deleted_section_ids on the next autosave / publish.
    if (sectionId > 0) {
      setDeletedIds((prev) => (prev.includes(sectionId) ? prev : [...prev, sectionId]));
    } else {
      // Synthetic id (never persisted) — just forget the tmp_id mapping.
      newSectionTmpIds.current.delete(sectionId);
    }
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
  }

  function handleUpdateSection(sectionId: number, updates: Partial<WebsiteSection>) {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        ...updates,
        content: updates.content ? { ...s.content, ...updates.content } : s.content,
        settings: updates.settings ? { ...s.settings, ...updates.settings } : s.settings,
      };
    }));
  }

  function handleMoveSection(sectionId: number, direction: 'up' | 'down') {
    const pageSections = filteredSections;
    const idx = pageSections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= pageSections.length) return;

    const reordered = [...pageSections];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const orderMap = new Map(reordered.map((s, i) => [s.id, i]));

    setSections((prev) => prev.map((s) => {
      const newOrder = orderMap.get(s.id);
      return newOrder !== undefined ? { ...s, sort_order: newOrder } : s;
    }));
  }

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  const sectionLabel = (s: WebsiteSection | null) =>
    s ? (SECTION_TYPE_META[s.section_type] ? t(SECTION_TYPE_META[s.section_type].labelKey) : s.section_type) : '';

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* ─── Top Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-divider" style={{ background: 'var(--surface)' }}>
        {/* Left: back + project name */}
        <div className="flex items-center gap-3 min-w-[240px]">
          <button
            onClick={() => router.push(`/${restaurantId}/dashboard`)}
            className="w-8 h-8 rounded-lg border border-divider flex items-center justify-center text-fg-secondary hover:bg-surface-subtle transition"
            title={t('backToDashboard')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-[0.12em] text-fg-secondary">
              {editorMode === 'pages' ? 'Page en cours' : 'Site web'}
            </span>
            <span className="text-[13px] font-semibold text-fg-primary truncate max-w-[180px]">
              {editorMode === 'pages'
                ? activePageLabelFor(activePage, pages)
                : (restaurant?.name ?? 'Sans titre')}
            </span>
          </div>
        </div>

        {/* Center: page-centric editing (Pages) separated from site-wide settings.
            Communicates the redesign's core distinction — you edit a PAGE, and the
            rest applies to the whole SITE. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditorMode('pages')}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition ${
              editorMode === 'pages' ? 'text-fg-primary shadow-sm' : 'text-fg-secondary hover:text-fg-primary'
            }`}
            style={{ background: editorMode === 'pages' ? 'var(--surface)' : 'var(--surface-subtle)' }}
          >
            Pages
          </button>
          <span className="text-fg-secondary opacity-30 select-none">|</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-secondary opacity-60">Site</span>
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-subtle)' }}>
            {(['theme', 'checkout', 'settings'] as EditorMode[]).map((m) => {
              const label = m === 'theme' ? 'Thème' : m === 'checkout' ? 'Commande' : 'Paramètres';
              const active = editorMode === m;
              return (
                <button
                  key={m}
                  onClick={() => { setEditorMode(m); setSelectedSectionId(null); }}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition ${
                    active ? 'text-fg-primary shadow-sm' : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                  style={active ? { background: 'var(--surface)' } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: device, status, preview link, annuler, publier */}
        <div className="flex items-center gap-3 min-w-[240px] justify-end">
          <button
            onClick={() => setPreviewMode(previewMode === 'desktop' ? 'mobile' : 'desktop')}
            className="w-8 h-8 rounded-lg border border-divider flex items-center justify-center text-fg-secondary hover:bg-surface-subtle transition"
            title={previewMode === 'mobile' ? 'Aperçu desktop' : 'Aperçu mobile'}
          >
            {previewMode === 'desktop' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            )}
          </button>

          {/* Status badge */}
          <div className="text-xs">
            {draftDirty ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium" style={{ background: 'rgba(235, 82, 4, 0.12)', color: '#EB5204' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#EB5204' }} />
                Brouillon
              </span>
            ) : publishedAt ? (
              <span className="text-fg-secondary">Publié {formatRelativeTime(publishedAt)}</span>
            ) : (
              <span className="text-fg-secondary">Aucune modification</span>
            )}
          </div>

          {restaurant?.slug && (
            <a
              href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/r/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-brand-500 hover:text-brand-600 font-medium"
            >
              Voir le site
            </a>
          )}

          {draftDirty && (
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="text-[13px] text-fg-secondary hover:text-fg-primary font-medium px-3 py-1.5 rounded-lg hover:bg-surface-subtle transition"
            >
              Annuler
            </button>
          )}

          <button
            onClick={handlePublish}
            disabled={saving || !draftDirty}
            className="btn-primary px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-[13px] font-semibold"
          >
            {saving ? 'Publication…' : saved ? 'Publié ✓' : 'Publier'}
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm shadow-lg">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-500 font-bold">&times;</button>
        </div>
      )}

      {/* ─── Main: Left rail + Canvas + Right panel ──────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail (content depends on mode) */}
        <div className="border-r border-divider flex flex-col flex-shrink-0 overflow-y-auto" style={{ width: 320, background: 'var(--surface)' }}>
          {editorMode === 'pages' && (
            <>
            <PagesLeftRail
              activePage={activePage}
              onActivePageChange={setActivePage}
              landingEnabled={landingEnabled}
              cateringEnabled={canManageCatering}
              pages={pages}
              onAddPage={handleAddPage}
              onOpenTemplates={() => setShowTemplates(true)}
              onRenamePage={handleRenamePage}
              onTogglePageNav={handleTogglePageNav}
              onTogglePageShopping={handleTogglePageShopping}
              onDeletePage={handleDeletePage}
              onReorderPage={handleReorderPage}
              footerExists={footerSection !== null}
              onSelectFooter={handleSelectFooter}
              sections={filteredSections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              onMove={handleMoveSection}
              onToggleVisibility={(id, visible) => handleUpdateSection(id, { is_visible: visible })}
              onAddSection={() => setShowAddModal(true)}
              menuLayout={config?.layout_default || 'magazine'}
              menuLayoutMobile={config?.layout_default_mobile || ''}
              heroCoverLayout={config?.hero_cover_layout || 'card'}
              heroLogoSize={config?.hero_logo_size && config.hero_logo_size > 0 ? config.hero_logo_size : 100}
              categoryBannerStyle={categoryBannerStyle}
              categoryBannerOverlay={categoryBannerOverlay}
              categoryBannerFit={categoryBannerFit}
              categoryBannerFitMobile={categoryBannerFitMobile}
              onMenuLayoutChange={(v) => setConfig((c) => (c ? ({ ...c, layout_default: v as 'compact' | 'magazine' } as WebsiteConfig) : c))}
              onMenuLayoutMobileChange={(v) => setConfig((c) => (c ? ({ ...c, layout_default_mobile: v as '' | 'compact' | 'magazine' } as WebsiteConfig) : c))}
              onHeroCoverLayoutChange={(v) => setConfig((c) => (c ? ({ ...c, hero_cover_layout: v } as WebsiteConfig) : c))}
              onHeroLogoSizeChange={(v) => setConfig((c) => (c ? ({ ...c, hero_logo_size: v } as WebsiteConfig) : c))}
              onCategoryBannerStyleChange={setCategoryBannerStyle}
              onCategoryBannerOverlayChange={setCategoryBannerOverlay}
              onCategoryBannerFitChange={setCategoryBannerFit}
              onCategoryBannerFitMobileChange={setCategoryBannerFitMobile}
              restaurantId={restaurantId}
              restaurant={restaurant}
              onRestaurantUpdate={setRestaurant}
            />
            <PageCommercePanel restaurantId={restaurantId} activePage={activePage} />
            </>
          )}
          {editorMode === 'theme' && (
            <ThemeLeftRail
              subMode={themeSubMode}
              onSubModeChange={setThemeSubMode}
              config={config}
              themeCatalog={themeCatalog}
              onConfigUpdate={handleMenuConfigUpdate}
              heroNameFont={heroNameFont}
              onHeroNameFontChange={setHeroNameFont}
              restaurantId={restaurantId}
              restaurant={restaurant}
              onRestaurantUpdate={setRestaurant}
            />
          )}
          {editorMode === 'checkout' && (
            <CheckoutEditor
              value={checkoutConfig}
              onChange={setCheckoutConfig}
              placesAvailable={true}
              subTab={checkoutSubTab}
              onSubTabChange={setCheckoutSubTab}
            />
          )}
          {editorMode === 'settings' && (
            <SettingsLeftRail
              subMode={settingsSubMode}
              onSubModeChange={setSettingsSubMode}
              restaurant={restaurant}
              tagline={tagline}
              showAddress={showAddress}
              showPhone={showPhone}
              showHours={showHours}
              landingEnabled={landingEnabled}
              socialLinks={(config?.social_links as Record<string, string>) ?? {}}
              onTaglineChange={setTagline}
              onShowAddressChange={setShowAddress}
              onShowPhoneChange={setShowPhone}
              onShowHoursChange={setShowHours}
              onLandingEnabledChange={(v) => {
                setLandingEnabled(v);
                // If the user turns off Landing while they were editing it,
                // snap to the menu page so the editor doesn't keep showing a
                // page that's about to be redirected away.
                if (!v && activePage === 'home') setActivePage('menu');
              }}
              onSocialLinksChange={(links) => setConfig((c) => (c ? ({ ...c, social_links: links } as WebsiteConfig) : c))}
              orderPageInfo={orderPageInfo}
              onOrderPageInfoChange={setOrderPageInfo}
              lockOrderType={!!checkoutConfig?.lock_order_type}
            />
          )}
        </div>

        {/* Center: live preview iframe */}
        <div
          className="flex-1 overflow-auto flex items-start justify-center py-6"
          style={{ background: previewMode === 'mobile' ? 'var(--surface-subtle)' : 'var(--bg-page)' }}
        >
          {editorMode === 'checkout' ? (
            <CheckoutPreviewIframe
              mode={previewMode}
              slug={restaurant?.slug}
              subTab={checkoutSubTab}
              checkoutConfig={checkoutConfig}
            />
          ) : editorMode === 'theme' && themeSubMode === 'navbar' ? (
            // The Navigation sub-tab customizes the LANDING navbar, so preview the
            // landing here (the rest of the Thème tab previews the order page).
            <LiveHomePreviewIframe
              mode={previewMode}
              slug={restaurant?.slug}
              draftPayload={buildDraftPayload()}
              onSectionClick={() => {}}
              onBoundsUpdate={handleBoundsUpdate}
              onIframeRectUpdate={handleIframeRectUpdate}
            />
          ) : (editorMode === 'pages' && activePage === 'menu') || editorMode === 'theme' ? (
            // The Thème tab (colors/typography/logo) and the Page de commande
            // both preview against the order page. Theme CSS vars are only
            // applied on order routes (see foodyweb useResolvedTheme), and live
            // edits arrive via `foody-theme-preview` messages posted to
            // menuIframeRef — so this iframe (the only one carrying that ref)
            // must be mounted whenever the user is editing the theme. Rendering
            // LiveHomePreviewIframe here would drop every theme edit on the floor.
            <MenuPreviewIframe
              ref={menuIframeRef}
              mode={previewMode}
              slug={restaurant?.slug}
              config={config}
              postMessage={postMenuPreview}
            />
          ) : editorMode === 'pages' && activePage !== 'home' ? (
            // The site footer (_site) previews against the order page — the
            // footer renders at the bottom of every page — while custom pages
            // preview against their own route. Both receive the full draft via
            // foody-draft-state and reflect edits live, just like the landing.
            <LiveHomePreviewIframe
              mode={previewMode}
              slug={restaurant?.slug}
              path={activePage === '_site' || activePage === 'menu' ? '/order' : `/${activePage}`}
              draftPayload={buildDraftPayload()}
              onSectionClick={(id) => {
                if (typeof id === 'number') setSelectedSectionId(id);
                else {
                  let local: number | null = null;
                  newSectionTmpIds.current.forEach((tmp, sid) => { if (tmp === id) local = sid; });
                  if (local !== null) setSelectedSectionId(local);
                }
              }}
              onBoundsUpdate={handleBoundsUpdate}
              onIframeRectUpdate={handleIframeRectUpdate}
            />
          ) : (
            <LiveHomePreviewIframe
              mode={previewMode}
              slug={restaurant?.slug}
              draftPayload={buildDraftPayload()}
              onSectionClick={(id) => {
                if (editorMode !== 'pages') return;
                if (typeof id === 'number') setSelectedSectionId(id);
                else {
                  let local: number | null = null;
                  newSectionTmpIds.current.forEach((tmp, sid) => { if (tmp === id) local = sid; });
                  if (local !== null) setSelectedSectionId(local);
                }
              }}
              onBoundsUpdate={handleBoundsUpdate}
              onIframeRectUpdate={handleIframeRectUpdate}
            />
          )}

          {/* Banner designer — floats over the preview when a "color-title"
              banner is selected. Edits push live to the iframe + persist. */}
          {categoryBannerStyle === 'color-title' && selectedBanner && (
            <BannerDesignerPanel
              restaurantId={restaurantId}
              groupId={selectedBanner.groupId}
              design={selectedBanner.design}
              onChange={(d) => applyBannerDesign(selectedBanner.groupId, d)}
              onClose={() => setSelectedBanner(null)}
            />
          )}
        </div>

        {/* Right panel — section settings (Pages mode, home page, section selected) */}
        {editorMode === 'pages' && activePage !== 'menu' && selectedSection && (
          <div className="border-l border-divider flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 340, background: 'var(--surface)' }}>
            <div className="flex items-start justify-between px-4 py-3 border-b border-divider sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] uppercase tracking-[0.12em] text-fg-secondary">
                  Pages › {activePage === 'home' ? 'Accueil' : activePage === '_site' ? 'Pied de page' : (pages.find((p) => p.slug === activePage)?.label ?? activePage)}
                </span>
                <span className="text-sm font-semibold text-fg-primary">{sectionLabel(selectedSection)}</span>
              </div>
              <button
                onClick={() => setSelectedSectionId(null)}
                className="w-7 h-7 rounded-lg hover:bg-surface-subtle flex items-center justify-center text-fg-secondary"
                title="Fermer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <SectionSettingsPanel
                section={selectedSection}
                restaurantId={restaurantId}
                onUpdate={(updates) => handleUpdateSection(selectedSection.id, updates)}
                onDelete={() => { handleDeleteSection(selectedSection.id); setSelectedSectionId(null); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Direct-selection overlay (Pages mode, home page only) */}
      {editorMode === 'pages' && activePage === 'home' && (
        <SelectionOverlay
          iframeRect={iframeRect}
          scale={1}
          selectedId={selectedSectionId}
          bounds={sectionBounds}
          iframeScrollY={iframeScrollY}
          onMoveUp={(id) => typeof id === 'number' && handleMoveSection(id, 'up')}
          onMoveDown={(id) => typeof id === 'number' && handleMoveSection(id, 'down')}
          onToggleVisibility={(id) => {
            if (typeof id !== 'number') return;
            const sec = sections.find((s) => s.id === id);
            if (sec) handleUpdateSection(id, { is_visible: !sec.is_visible });
          }}
          onDelete={(id) => typeof id === 'number' && handleDeleteSection(id)}
          isDeletable={(id) => {
            if (typeof id !== 'number') return false;
            const sec = sections.find((s) => s.id === id);
            return sec ? sec.section_type !== 'footer' : false;
          }}
        />
      )}

      {/* Add Section Modal */}
      {showAddModal && (
        <AddSectionModal onAdd={handleAddSection} onClose={() => setShowAddModal(false)} />
      )}

      {showTemplates && (
        <TemplatePickerModal
          hasCatering={canManageCatering}
          onApply={applyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Discard confirm modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDiscardConfirm(false)}>
          <div className="bg-[var(--surface)] rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-fg-primary mb-2">Annuler les modifications ?</h3>
            <p className="text-sm text-fg-secondary mb-6">
              Toutes les modifications non publiées seront perdues. La version actuellement en ligne ne sera pas affectée.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-fg-primary hover:bg-surface-subtle transition"
              >
                Garder mes modifications
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition"
              >
                Tout annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// New left-rail components for the three editor modes.
// Each owns its own internal layout; the parent just hands them state.
// ═══════════════════════════════════════════════════════════════════

function PagesLeftRail({ activePage, onActivePageChange, landingEnabled, cateringEnabled, pages, onAddPage, onOpenTemplates, onRenamePage, onTogglePageNav, onTogglePageShopping, onDeletePage, onReorderPage, footerExists, onSelectFooter, sections, selectedId, onSelect, onMove, onToggleVisibility, onAddSection, menuLayout, menuLayoutMobile, heroCoverLayout, heroLogoSize, categoryBannerStyle, categoryBannerOverlay, categoryBannerFit, categoryBannerFitMobile, onMenuLayoutChange, onMenuLayoutMobileChange, onHeroCoverLayoutChange, onHeroLogoSizeChange, onCategoryBannerStyleChange, onCategoryBannerOverlayChange, onCategoryBannerFitChange, onCategoryBannerFitMobileChange, restaurantId, restaurant, onRestaurantUpdate }: {
  activePage: string;
  onActivePageChange: (p: string) => void;
  landingEnabled: boolean;
  cateringEnabled: boolean;
  pages: WebsitePageMeta[];
  onAddPage: () => void;
  onOpenTemplates: () => void;
  onRenamePage: (slug: string, label: string) => void;
  onTogglePageNav: (slug: string, show: boolean) => void;
  onTogglePageShopping: (slug: string, shopping: boolean) => void;
  onDeletePage: (slug: string) => void;
  onReorderPage: (slug: string, dir: 'up' | 'down') => void;
  footerExists: boolean;
  onSelectFooter: () => void;
  sections: WebsiteSection[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
  onAddSection: () => void;
  menuLayout: string;
  menuLayoutMobile: string;
  heroCoverLayout: HeroCoverLayout;
  heroLogoSize: number;
  categoryBannerStyle: '' | 'image-overlay' | 'image-only' | 'text-block' | 'striped-rule' | 'color-title' | 'none';
  categoryBannerOverlay: number;
  categoryBannerFit: 'cover' | 'contain' | 'natural';
  categoryBannerFitMobile: '' | 'cover' | 'contain' | 'natural';
  onMenuLayoutChange: (v: string) => void;
  onMenuLayoutMobileChange: (v: string) => void;
  onHeroCoverLayoutChange: (v: HeroCoverLayout) => void;
  onHeroLogoSizeChange: (v: number) => void;
  onCategoryBannerStyleChange: (v: '' | 'image-overlay' | 'image-only' | 'text-block' | 'striped-rule' | 'color-title' | 'none') => void;
  onCategoryBannerOverlayChange: (v: number) => void;
  onCategoryBannerFitChange: (v: 'cover' | 'contain' | 'natural') => void;
  onCategoryBannerFitMobileChange: (v: '' | 'cover' | 'contain' | 'natural') => void;
  restaurantId: number;
  restaurant: Restaurant | null;
  onRestaurantUpdate: (r: Restaurant) => void;
}) {
  const activeCustom = pages.find((p) => p.slug === activePage) || null;
  const isFooter = activePage === '_site';
  const showSectionList = !isFooter;
  const sectionLabel = activePage === 'home' ? 'Sections' : activeCustom ? `Sections — ${activeCustom.label}` : 'Sections';

  // Category banner: the style is shared across devices; only the fit (Cadrage)
  // is configured per device, with the mobile value inheriting desktop when
  // unset. "Image" styles (overlay/only) expose the fit controls.
  const bannerStyle = categoryBannerStyle || 'image-overlay';
  const bannerIsImage = bannerStyle === 'image-overlay' || bannerStyle === 'image-only';
  const bannerFitOptions = [
    { value: 'cover', label: 'Remplir (rogné)', hint: 'Recadre l’image pour remplir la bannière.' },
    { value: 'contain', label: 'Image entière, fond flou', hint: 'Affiche toute l’image, avec un fond flou sur les côtés.' },
    { value: 'natural', label: 'Image entière, hauteur auto', hint: 'La bannière suit les proportions de l’image — rien n’est rogné.' },
  ] as const;

  const rowCls = (active: boolean) =>
    `group flex items-center rounded-lg transition ${active ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : 'hover:bg-surface-subtle'}`;
  const rowBtnCls = (active: boolean) =>
    `flex-1 min-w-0 text-left px-3 py-2 text-[13px] truncate ${active ? 'text-fg-primary font-semibold' : 'text-fg-secondary'}`;

  return (
    <div className="flex flex-col h-full">
      {/* Pages list — built-in (Accueil/Commande) + custom pages + the site
          footer. Works regardless of the landing toggle; custom pages appear in
          the customer hamburger menu. */}
      <div className="px-3 pt-3">
        <button
          onClick={onOpenTemplates}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-[12px] font-semibold text-brand-600 hover:bg-brand-500/10 transition-colors"
        >
          <span>{'✨'}</span> Modèles de site
        </button>
      </div>
      <div className="px-3 pt-3 pb-3 border-b border-divider">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary">Pages</span>
          <button onClick={onAddPage} className="text-[11px] font-medium text-brand-500 hover:text-brand-600">+ Nouvelle page</button>
        </div>
        <div className="flex flex-col gap-0.5">
          {landingEnabled && (
            <div className={rowCls(activePage === 'home')}>
              <button onClick={() => onActivePageChange('home')} className={rowBtnCls(activePage === 'home')}>Accueil</button>
            </div>
          )}
          <div className={rowCls(activePage === 'menu')}>
            <button onClick={() => onActivePageChange('menu')} className={rowBtnCls(activePage === 'menu')}>Page de commande</button>
          </div>
          {cateringEnabled && (
            <div className={rowCls(activePage === 'catering')}>
              <button onClick={() => onActivePageChange('catering')} className={rowBtnCls(activePage === 'catering')}>Traiteur</button>
            </div>
          )}
          {pages.map((p, i) => (
            <div key={p.slug} className={rowCls(activePage === p.slug)}>
              <button onClick={() => onActivePageChange(p.slug)} className={rowBtnCls(activePage === p.slug)}>{p.label}</button>
              <div className="flex items-center pe-1 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button title="Monter" disabled={i === 0} onClick={() => onReorderPage(p.slug, 'up')} className="w-6 h-6 grid place-items-center rounded text-fg-tertiary hover:text-fg-primary disabled:opacity-30">↑</button>
                <button title="Descendre" disabled={i === pages.length - 1} onClick={() => onReorderPage(p.slug, 'down')} className="w-6 h-6 grid place-items-center rounded text-fg-tertiary hover:text-fg-primary disabled:opacity-30">↓</button>
                <button title="Supprimer la page" onClick={() => { if (typeof window === 'undefined' || window.confirm(`Supprimer la page « ${p.label} » et ses sections ?`)) onDeletePage(p.slug); }} className="w-6 h-6 grid place-items-center rounded text-fg-tertiary hover:text-red-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Site-wide footer entry */}
        <div className="mt-2 pt-2 border-t border-divider">
          <div className={rowCls(isFooter)}>
            <button onClick={onSelectFooter} className={`${rowBtnCls(isFooter)} flex items-center gap-2`}>
              <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 18h16M7 12h10" /></svg>
              Pied de page (tout le site)
            </button>
            {!footerExists && <span className="pe-3 text-[10px] text-brand-500">+ créer</span>}
          </div>
        </div>
      </div>

      {/* Custom page rename */}
      {activeCustom && (
        <div className="px-4 py-3 border-b border-divider">
          <label className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-1.5">Nom de la page</label>
          <input
            value={activeCustom.label}
            onChange={(e) => onRenamePage(activeCustom.slug, e.target.value)}
            placeholder="Nom de la page"
            className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <p className="mt-1.5 text-[10px] text-fg-secondary leading-relaxed">
            Adresse : <span className="text-fg-primary">/{activeCustom.slug}</span>
          </p>
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activeCustom.show_in_nav !== false}
              onChange={(e) => onTogglePageNav(activeCustom.slug, e.target.checked)}
              className="accent-brand-500"
            />
            <span className="text-[11px] text-fg-secondary">Afficher dans la navigation</span>
          </label>
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activeCustom.is_shopping === true}
              onChange={(e) => onTogglePageShopping(activeCustom.slug, e.target.checked)}
              className="accent-brand-500"
            />
            <span className="text-[11px] text-fg-secondary">Page boutique (masque la barre complète, utilise la nav boutique)</span>
          </label>
        </div>
      )}

      {/* Footer scope hint */}
      {isFooter && (
        <div className="px-4 py-3 border-b border-divider">
          <p className="text-[11px] text-fg-secondary leading-relaxed">
            Le pied de page s&apos;affiche en bas de <span className="text-fg-primary">toutes les pages</span> (commande, accueil et pages personnalisées). Sélectionnez-le ci-dessous pour le modifier.
          </p>
        </div>
      )}

      {/* Menu-page-specific options: cover image, layout, category banner style.
          Only shown on the Page de commande because they only affect the menu
          rendering. */}
      {activePage === 'menu' && (
        <div className="px-4 py-4 border-b border-divider space-y-4">
          <CoverBackgroundEditor
            restaurantId={restaurantId}
            restaurant={restaurant}
            onRestaurantUpdate={onRestaurantUpdate}
          />
          <div className="pt-2 border-t border-divider">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-2">Affichage de la couverture</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'card', label: 'Logo et nom', hint: 'Logo, nom et slogan' },
                { v: 'logo', label: 'Logo seul', hint: 'Logo centré, sans texte' },
                { v: 'bare', label: 'Logo sans cadre', hint: 'À sa place, sans encadré ni texte' },
              ] as const).map((opt) => {
                const active = (heroCoverLayout || 'card') === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => onHeroCoverLayoutChange(opt.v)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                      active
                        ? 'border-brand-500 bg-brand-500/5 text-fg-primary'
                        : 'border-divider text-fg-secondary hover:border-fg-secondary'
                    }`}
                  >
                    <div className="font-medium text-[13px]">{opt.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-fg-secondary opacity-70 mt-1.5 leading-relaxed">
              « Logo seul » place votre logo au centre de la couverture, sans nom ni slogan.
              « Logo sans cadre » garde le logo à sa position habituelle, sans encadré, nom ni slogan.
            </p>
          </div>
          {restaurant?.logo_url && (
            <div className="pt-2 border-t border-divider">
              <div className="flex items-center justify-between mb-2">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary">Taille du logo</span>
                <span className="text-[11px] text-fg-secondary tabular-nums">{heroLogoSize}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={160}
                step={5}
                value={heroLogoSize}
                onChange={(e) => onHeroLogoSizeChange(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          )}
          <div className="pt-2 border-t border-divider">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-2">Mise en page du menu</span>
            {/* One picker per device. The choice is the layout customers land
                on; they can still switch via the toggle on the site. Mobile
                follows the desktop choice until set explicitly. */}
            {([
              { device: 'desktop', label: 'Ordinateur', value: menuLayout, onChange: onMenuLayoutChange },
              { device: 'mobile', label: 'Mobile', value: menuLayoutMobile || menuLayout, onChange: onMenuLayoutMobileChange },
            ] as const).map((row) => (
              <div key={row.device} className="mb-2 last:mb-0">
                <span className="block text-[11px] text-fg-secondary mb-1">{row.label}</span>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'magazine', label: 'Magazine', hint: 'Grandes vignettes' },
                    { v: 'compact', label: 'Compact', hint: 'Liste dense' },
                  ] as const).map((opt) => {
                    const active = row.value === opt.v;
                    return (
                      <button
                        key={opt.v}
                        onClick={() => row.onChange(opt.v)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                          active
                            ? 'border-brand-500 bg-brand-500/5 text-fg-primary'
                            : 'border-divider text-fg-secondary hover:border-fg-secondary'
                        }`}
                      >
                        <div className="font-medium text-[13px]">{opt.label}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-fg-secondary opacity-70 mt-1.5 leading-relaxed">
              Affichage initial pour vos clients. Ils peuvent toujours changer la vue depuis le menu.
            </p>
          </div>

          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-2">Bannière de catégorie</span>
            <select
              value={bannerStyle}
              onChange={(e) => onCategoryBannerStyleChange(e.target.value as typeof categoryBannerStyle)}
              className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="image-overlay">Image avec titre superposé</option>
              <option value="image-only">Image seule (sans titre)</option>
              <option value="text-block">Bloc de texte uniquement</option>
              <option value="striped-rule">Ligne rayée minimale</option>
              <option value="color-title">Couleur + titre (personnalisé)</option>
              <option value="none">Sans bannière</option>
            </select>
            {bannerStyle === 'color-title' && (
              <p className="mt-2 text-[11px] text-fg-secondary leading-snug">
                Cliquez une bannière dans l&apos;aperçu pour modifier sa couleur, son titre et ajouter des stickers.
              </p>
            )}
            {/* Overlay darkness only affects the overlaid title, so the slider
                is shown only for the image-overlay style. 0 removes the veil. */}
            {bannerStyle === 'image-overlay' && (
              <div className="mt-3">
                <label className="text-[11px] text-fg-secondary block mb-1">
                  Voile sombre ({categoryBannerOverlay}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={categoryBannerOverlay}
                  onChange={(e) => onCategoryBannerOverlayChange(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
                  <span>Aucun</span><span>Sombre</span>
                </div>
              </div>
            )}
            {/* Image fit (Cadrage) is configured per device — overlaid title or
                not. "cover" crops to fill (legacy default); "contain" centres
                the whole image with a blurred side-fill; "natural" follows the
                image's own aspect ratio so nothing is cropped. Mobile inherits
                desktop when left on "Identique à l'ordinateur". */}
            {bannerIsImage && (
              <>
                <div className="mt-3">
                  <span className="text-[11px] text-fg-secondary block mb-1">Cadrage de l&apos;image — Ordinateur</span>
                  <div className="flex flex-col gap-1.5">
                    {bannerFitOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onCategoryBannerFitChange(opt.value)}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors ${categoryBannerFit === opt.value ? 'border-brand-500 bg-brand-500/10 text-fg-primary' : 'border-divider bg-[var(--surface)] text-fg-secondary'}`}
                      >
                        <span className="block text-[11px] font-medium">{opt.label}</span>
                        <span className="block text-[10px] opacity-70 leading-snug mt-0.5">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-[11px] text-fg-secondary block mb-1">Cadrage de l&apos;image — Mobile</span>
                  <div className="flex flex-col gap-1.5">
                    {([{ value: '', label: 'Identique à l’ordinateur', hint: 'Utilise le cadrage de l’ordinateur.' }, ...bannerFitOptions] as const).map((opt) => (
                      <button
                        key={opt.value || 'inherit'}
                        type="button"
                        onClick={() => onCategoryBannerFitMobileChange(opt.value)}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors ${categoryBannerFitMobile === opt.value ? 'border-brand-500 bg-brand-500/10 text-fg-primary' : 'border-divider bg-[var(--surface)] text-fg-secondary'}`}
                      >
                        <span className="block text-[11px] font-medium">{opt.label}</span>
                        <span className="block text-[10px] opacity-70 leading-snug mt-0.5">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Section list — only for content pages (home + custom). The order page
          is a pure menu; the footer is edited via its own entry. */}
      {showSectionList && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary">{sectionLabel}</span>
            <button
              onClick={onAddSection}
              className="text-[11px] font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1"
            >
              + Ajouter
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {sections.length > 0 ? (
              <SectionListPanel
                sections={sections}
                selectedId={selectedId}
                onSelect={onSelect}
                onMove={onMove}
                onToggleVisibility={onToggleVisibility}
              />
            ) : (
              <div className="px-3 py-4 text-[11px] text-fg-secondary leading-relaxed">
                {activePage === 'home'
                  ? 'Aucune section. Cliquez sur + Ajouter pour commencer.'
                  : 'Page vide. Cliquez sur + Ajouter pour y placer du contenu (texte, image, galerie…).'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ThemeLeftRail({ subMode, onSubModeChange, config, themeCatalog, onConfigUpdate, heroNameFont, onHeroNameFontChange, restaurantId, restaurant, onRestaurantUpdate }: {
  subMode: 'colors' | 'typography' | 'logo' | 'navbar';
  onSubModeChange: (m: 'colors' | 'typography' | 'logo' | 'navbar') => void;
  config: WebsiteConfig | null;
  themeCatalog: ThemeCatalog | null;
  onConfigUpdate: (patch: Partial<WebsiteConfig>) => void;
  heroNameFont: string;
  onHeroNameFontChange: (f: string) => void;
  restaurantId: number;
  restaurant: Restaurant | null;
  onRestaurantUpdate: (r: Restaurant) => void;
}) {
  const tabs: { id: typeof subMode; label: string }[] = [
    { id: 'colors', label: 'Couleurs' },
    { id: 'typography', label: 'Typographie' },
    { id: 'navbar', label: 'Navigation' },
    { id: 'logo', label: 'Logo & favicon' },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-divider">
        <div className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-2">Apparence</div>
        <p className="text-[11px] text-fg-secondary leading-relaxed mb-3">
          Ces paramètres s&apos;appliquent à <strong>toutes</strong> les pages de votre site (landing + commande).
        </p>
        <div className="flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSubModeChange(t.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                subMode === t.id ? 'bg-brand-500/10 text-brand-500 font-medium' : 'text-fg-primary hover:bg-surface-subtle'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!themeCatalog || !config ? (
          <p className="text-xs text-fg-secondary">Chargement…</p>
        ) : subMode === 'colors' ? (
          <ThemesPanel config={config} catalog={themeCatalog} onUpdate={onConfigUpdate} />
        ) : subMode === 'typography' ? (
          <TypographyPanel
            config={config}
            catalog={themeCatalog}
            onUpdate={onConfigUpdate}
            restaurantId={restaurantId}
            heroNameFont={heroNameFont}
            onHeroNameFontChange={onHeroNameFontChange}
            heroSample={restaurant?.name}
          />
        ) : subMode === 'navbar' ? (
          <NavbarPanel config={config} onUpdate={onConfigUpdate} restaurantId={restaurantId} />
        ) : (
          <BrandingPanel
            config={config}
            onUpdate={onConfigUpdate}
            restaurantId={restaurantId}
            restaurant={restaurant}
            onRestaurantUpdate={onRestaurantUpdate}
          />
        )}
      </div>
    </div>
  );
}

function SettingsLeftRail({ subMode, onSubModeChange, restaurant, tagline, showAddress, showPhone, showHours, landingEnabled, socialLinks, onTaglineChange, onShowAddressChange, onShowPhoneChange, onShowHoursChange, onLandingEnabledChange, onSocialLinksChange, orderPageInfo, onOrderPageInfoChange, lockOrderType }: {
  subMode: 'general' | 'contact' | 'social' | 'orderInfo' | 'seo';
  onSubModeChange: (m: 'general' | 'contact' | 'social' | 'orderInfo' | 'seo') => void;
  restaurant: Restaurant | null;
  tagline: string;
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  landingEnabled: boolean;
  socialLinks: Record<string, string>;
  onTaglineChange: (v: string) => void;
  onShowAddressChange: (v: boolean) => void;
  onShowPhoneChange: (v: boolean) => void;
  onShowHoursChange: (v: boolean) => void;
  onLandingEnabledChange: (v: boolean) => void;
  onSocialLinksChange: (links: Record<string, string>) => void;
  orderPageInfo: OrderPageInfo | null;
  onOrderPageInfoChange: (v: OrderPageInfo) => void;
  lockOrderType: boolean;
}) {
  const tabs: { id: typeof subMode; label: string }[] = [
    { id: 'general', label: 'Général' },
    { id: 'contact', label: 'Contact' },
    { id: 'social', label: 'Réseaux sociaux' },
    { id: 'orderInfo', label: 'Infos commande' },
    { id: 'seo', label: 'SEO' },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-divider">
        <div className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-2">Paramètres du site</div>
        <div className="flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSubModeChange(t.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                subMode === t.id ? 'bg-brand-500/10 text-brand-500 font-medium' : 'text-fg-primary hover:bg-surface-subtle'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {subMode === 'general' && (
          <>
            {/* Landing page toggle — controls whether /r/<slug> shows the
                marketing landing or redirects straight to the order page.
                Sections are not deleted when this is off; they're hidden. */}
            <div className="rounded-xl border border-divider p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={landingEnabled}
                  onChange={(e) => onLandingEnabledChange(e.target.checked)}
                  className="w-4 h-4 mt-0.5"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-fg-primary">Page d&apos;accueil (landing)</span>
                  <span className="block text-[11px] text-fg-secondary leading-relaxed mt-0.5">
                    {landingEnabled
                      ? "Vos visiteurs arrivent sur la page d'accueil avec votre bannière et vos sections."
                      : "Vos visiteurs sont redirigés directement vers la page de commande. Vos sections de landing sont conservées mais masquées."}
                  </span>
                </span>
              </label>
            </div>

            {/* Bottom-bar tab order moved to Thème → Navigation (it rides the
                builder draft now, alongside the composition matrix). */}

            <div>
              <label className="block text-xs font-medium text-fg-primary mb-1.5">Slogan</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => onTaglineChange(e.target.value)}
                placeholder="Une phrase courte qui décrit votre restaurant"
                className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            {/* Navbar style/color moved to Thème → Navigation (single source of
                truth). The old dropdown here silently overwrote those picks. */}
            <div className="text-[11px] text-fg-secondary pt-2 border-t border-divider">
              Slug: <code className="text-fg-primary">{restaurant?.slug || '—'}</code>
              <span className="block mt-1 opacity-70">(modifiable via les paramètres du restaurant)</span>
            </div>
          </>
        )}
        {subMode === 'contact' && (
          <>
            <p className="text-[11px] text-fg-secondary leading-relaxed">
              Choisissez quelles informations afficher publiquement sur votre site. Les coordonnées proviennent du profil du restaurant.
            </p>
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-subtle cursor-pointer">
              <input type="checkbox" checked={showAddress} onChange={(e) => onShowAddressChange(e.target.checked)} className="w-4 h-4" />
              <span className="flex-1 text-sm text-fg-primary">Afficher l&apos;adresse</span>
              <span className="text-[11px] text-fg-secondary truncate max-w-[140px]">{restaurant?.address || '—'}</span>
            </label>
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-subtle cursor-pointer">
              <input type="checkbox" checked={showPhone} onChange={(e) => onShowPhoneChange(e.target.checked)} className="w-4 h-4" />
              <span className="flex-1 text-sm text-fg-primary">Afficher le téléphone</span>
              <span className="text-[11px] text-fg-secondary">{restaurant?.phone || '—'}</span>
            </label>
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-subtle cursor-pointer">
              <input type="checkbox" checked={showHours} onChange={(e) => onShowHoursChange(e.target.checked)} className="w-4 h-4" />
              <span className="flex-1 text-sm text-fg-primary">Afficher les horaires d&apos;ouverture</span>
            </label>
          </>
        )}
        {subMode === 'social' && (
          <>
            <p className="text-[11px] text-fg-secondary leading-relaxed">
              Liens vers vos réseaux sociaux, affichés dans le pied de page.
            </p>
            {(['instagram', 'facebook', 'tiktok', 'twitter', 'youtube'] as const).map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-fg-primary mb-1.5 capitalize">{key}</label>
                <input
                  type="url"
                  value={socialLinks[key] || ''}
                  onChange={(e) => onSocialLinksChange({ ...socialLinks, [key]: e.target.value })}
                  placeholder={`https://${key}.com/votre-compte`}
                  className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
            ))}
            {/* WhatsApp — a phone number (turned into a wa.me link), not a URL. */}
            <div>
              <label className="block text-xs font-medium text-fg-primary mb-1.5">WhatsApp</label>
              <input
                type="tel"
                value={socialLinks.whatsapp || ''}
                onChange={(e) => onSocialLinksChange({ ...socialLinks, whatsapp: e.target.value })}
                placeholder="+972 50 123 4567"
                className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            {/* Email — separate input because it's a mailto link, not a URL.
                Surfaces in the foodyweb "À propos" panel under Contact. */}
            <div>
              <label className="block text-xs font-medium text-fg-primary mb-1.5">Email</label>
              <input
                type="email"
                value={socialLinks.email || ''}
                onChange={(e) => onSocialLinksChange({ ...socialLinks, email: e.target.value })}
                placeholder="hello@votre-restaurant.com"
                className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>

            {/* WiFi — surfaces as the "📶 WiFi · <SSID>" pill on the
                foodyweb hero (dine-in only). Tapping the pill opens a sheet
                with the password + a join-network QR code. */}
            <div className="mt-2 pt-3 border-t border-divider">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-fg-secondary mb-2">
                WiFi
              </p>
              <p className="text-[11px] text-fg-secondary leading-relaxed mb-3">
                Visible uniquement en mode « Sur place » sur la page de commande.
                Le client peut récupérer le mot de passe en tapant sur le badge.
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-fg-primary mb-1.5">
                    Nom du réseau (SSID)
                  </label>
                  <input
                    type="text"
                    value={socialLinks.wifi_ssid || ''}
                    onChange={(e) =>
                      onSocialLinksChange({ ...socialLinks, wifi_ssid: e.target.value })
                    }
                    placeholder="BellaItalia-Guest"
                    className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg-primary mb-1.5">
                    Mot de passe
                  </label>
                  <input
                    type="text"
                    value={socialLinks.wifi_password || ''}
                    onChange={(e) =>
                      onSocialLinksChange({ ...socialLinks, wifi_password: e.target.value })
                    }
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </>
        )}
        {subMode === 'orderInfo' && (
          <OrderPageInfoEditor
            value={orderPageInfo}
            onChange={onOrderPageInfoChange}
            availableModes={[
              ...(restaurant?.pickup_enabled ? (['pickup'] as const) : []),
              ...(restaurant?.delivery_enabled ? (['delivery'] as const) : []),
              ...(restaurant?.dine_in_enabled ? (['dine_in'] as const) : []),
            ]}
            locked={lockOrderType}
          />
        )}
        {subMode === 'seo' && (
          <p className="text-[12px] text-fg-secondary leading-relaxed">
            Les paramètres SEO avancés (titre de page, description, image Open Graph) seront ajoutés bientôt. Pour l&apos;instant, ils sont générés automatiquement à partir du nom et de la description du restaurant.
          </p>
        )}
      </div>
    </div>
  );
}


// ─── Sub-components ─────────────────────────────────────────────────

function LiveHomePreviewIframe({ mode, slug, draftPayload, path = '', onSectionClick, onBoundsUpdate, onIframeRectUpdate }: {
  mode: 'mobile' | 'desktop';
  slug: string | undefined;
  draftPayload: DraftStatePayload;
  /** Sub-path after /r/<slug> so one component previews the landing (''),
   *  the order page ('/order') for the site footer, or a custom page
   *  ('/<slug>'). Every variant receives the full draft via foody-draft-state. */
  path?: string;
  onSectionClick: (id: number | string) => void;
  onBoundsUpdate: (bounds: SectionBounds[], scrollY: number) => void;
  onIframeRectUpdate: (rect: { top: number; left: number; width: number; height: number } | null) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

  // Listen for messages from the iframe.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only trust messages from our iframe.
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === 'foody-editor-ready') {
        readyRef.current = true;
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'foody-draft-state', state: draftPayload }, '*'
        );
      } else if (e.data?.type === 'foody-section-bounds' && Array.isArray(e.data.bounds)) {
        onBoundsUpdate(e.data.bounds, e.data.scrollY ?? 0);
      } else if (e.data?.type === 'foody-section-click' && e.data.id !== undefined) {
        onSectionClick(e.data.id);
      } else if (e.data?.type === 'foody-select-section' && e.data.sectionId !== undefined) {
        // Legacy message kept for compatibility with older foodyweb deploys.
        onSectionClick(e.data.sectionId);
      } else if (e.data?.type === 'foody-scroll' && typeof e.data.scrollY === 'number') {
        // Forward scrollY as part of the next bounds update — overlay needs it
        // to translate iframe-document coords to viewport coords.
        onBoundsUpdate([], e.data.scrollY);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // draftPayload intentionally NOT in deps — the ready handshake fires once;
    // post-mount updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBoundsUpdate, onSectionClick]);

  // Post the draft state whenever it changes.
  useEffect(() => {
    if (!readyRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'foody-draft-state', state: draftPayload }, '*'
    );
  }, [draftPayload]);

  // Publish iframe's viewport rect so the overlay knows where to position itself.
  // Recomputed on resize and on a 250ms interval to catch scroll changes in the
  // editor's outer scroll container.
  useEffect(() => {
    function publishRect() {
      const el = wrapperRef.current;
      if (!el) {
        onIframeRectUpdate(null);
        return;
      }
      const r = el.getBoundingClientRect();
      onIframeRectUpdate({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    publishRect();
    window.addEventListener('resize', publishRect);
    window.addEventListener('scroll', publishRect, true);
    const id = window.setInterval(publishRect, 250);
    return () => {
      window.removeEventListener('resize', publishRect);
      window.removeEventListener('scroll', publishRect, true);
      window.clearInterval(id);
      onIframeRectUpdate(null);
    };
  }, [onIframeRectUpdate, mode]);

  if (!slug) {
    return <div className="text-sm text-fg-secondary p-8">Slug du restaurant requis pour la prévisualisation</div>;
  }

  const width = mode === 'mobile' ? 390 : '100%';
  const height = mode === 'mobile' ? 844 : '100%';
  return (
    <div
      ref={wrapperRef}
      className="my-6 shadow-xl overflow-hidden bg-white"
      style={{
        width,
        height,
        maxWidth: '100%',
        borderRadius: mode === 'mobile' ? 32 : 8,
        border: mode === 'mobile' ? '6px solid #1a1a1a' : '1px solid var(--divider)',
      }}
    >
      <iframe
        ref={iframeRef}
        src={`${WEB_URL}/r/${slug}${path}?preview=1`}
        title="Live preview"
        className="w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  );
}

const MenuPreviewIframe = forwardRef<HTMLIFrameElement, {
  mode: 'mobile' | 'desktop';
  slug: string | undefined;
  config: WebsiteConfig | null;
  postMessage: (cfg: WebsiteConfig) => void;
}>(function MenuPreviewIframe({ mode, slug, config, postMessage }, ref) {
  // Re-post the preview message whenever the saved config changes (in case the
  // iframe just loaded or lost the previous postMessage).
  useEffect(() => {
    if (!config) return;
    const t = setTimeout(() => postMessage(config), 100);
    return () => clearTimeout(t);
  }, [config, postMessage]);

  if (!slug) {
    return (
      <div className="flex items-center justify-center text-fg-secondary text-sm h-full">
        Loading…
      </div>
    );
  }

  const src = `${WEB_URL}/r/${slug}/order?preview=1`;
  if (mode === 'mobile') {
    return (
      <div className="py-6 flex items-start justify-center w-full">
        <div className="w-[390px] h-[780px] rounded-[2rem] border border-divider shadow-lg overflow-hidden bg-bg shrink-0">
          <iframe
            ref={ref}
            src={src}
            className="w-full h-full border-0"
            title="menu-preview"
            onLoad={() => config && postMessage(config)}
          />
        </div>
      </div>
    );
  }
  return (
    <iframe
      ref={ref}
      src={src}
      className="w-full h-full border-0"
      title="menu-preview"
      onLoad={() => config && postMessage(config)}
    />
  );
});

// NavbarPanel — full customization of the landing-page top navigation.
// All fields live on the config object (persisted via the draft autosave); the
// second-logo/overlay controls only matter for the "overlay" style.
function NavbarPanel({ config, onUpdate, restaurantId }: {
  config: WebsiteConfig | null;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
  restaurantId: number;
}) {
  const cta = config?.navbar_cta || {};
  const [linkMode, setLinkMode] = useState<'order' | 'catering' | 'custom'>(
    !cta.link || cta.link === 'order' ? 'order' : cta.link === 'catering' ? 'catering' : 'custom',
  );
  if (!config) return <p className="text-xs text-fg-secondary">Chargement…</p>;

  const style = config.navbar_style || 'solid';
  const pos = config.navbar_logo_position || 'left';
  const isOverlay = style === 'overlay';
  const ctaEnabled = cta.enabled !== false;
  const setCta = (patch: Partial<NonNullable<WebsiteConfig['navbar_cta']>>) =>
    onUpdate({ navbar_cta: { ...cta, ...patch } });

  // ── Navbar typography (reuses the FontSelect + extraFonts library) ──────────
  const typo = config.typography ?? {};
  const navExtraFonts = typo.extraFonts ?? [];
  const navFont = config.navbar_font || '';
  const navType = config.navbar_type ?? {};
  const navWeights =
    navFont
      ? curatedFontWeights(navFont) ?? navExtraFonts.find((f) => f.family === navFont)?.weights ?? [400, 700]
      : [400, 700];
  const setNavType = (patch: Partial<NonNullable<WebsiteConfig['navbar_type']>>) =>
    onUpdate({ navbar_type: { ...navType, ...patch } });
  const setNavFont = (family: string, picked?: ExtraFont) => {
    if (family) {
      const src = picked?.faces?.length ? { faces: picked.faces } : picked?.url ? { url: picked.url, format: picked.format } : undefined;
      loadWebsiteFont(family, picked?.weights, src);
    }
    const extraFonts = picked && !navExtraFonts.some((f) => f.family === picked.family) ? [...navExtraFonts, picked] : navExtraFonts;
    onUpdate({ navbar_font: family, typography: { ...typo, extraFonts } });
  };

  const linkStyle = config.navbar_link_style || 'text';

  // ── Composition matrix (content vs shopping × desktop/mobile) ───────────────
  // Effective values default from the legacy navbar_* fields (mirrors foodyweb's
  // resolveNavLayout back-compat) so the UI reflects what actually renders; any
  // edit persists the full explicit nav_layout.
  const navLayout = config.nav_layout ?? null;
  const legacyContentDesktop: 'full' | 'compact' | 'hidden' =
    config.navbar_style === 'hidden' || config.navbar_hamburger === 'always'
      ? 'compact'
      : config.navbar_show_links !== false
        ? 'full'
        : 'compact';
  const eff = {
    content: {
      desktop: navLayout?.content?.desktop ?? legacyContentDesktop,
      mobile: navLayout?.content?.mobile ?? 'compact',
      bottom_bar: navLayout?.content?.bottom_bar ?? false,
    },
    shopping: {
      desktop: navLayout?.shopping?.desktop ?? 'compact',
      mobile: navLayout?.shopping?.mobile ?? 'hidden',
      bottom_bar: navLayout?.shopping?.bottom_bar ?? true,
    },
  } as const;
  const setLayout = (grp: 'content' | 'shopping', patch: Partial<{ desktop: string; mobile: string; bottom_bar: boolean }>) =>
    onUpdate({ nav_layout: { ...eff, [grp]: { ...eff[grp], ...patch } } } as Partial<WebsiteConfig>);
  const MODE_OPTS = [['full', 'Complète'], ['compact', 'Compacte'], ['hidden', 'Masquée']] as const;
  const modeRow = (label: string, value: string, onSet: (v: string) => void) => (
    <div>
      <label className="block text-[11px] text-fg-secondary mb-1">{label}</label>
      <div className="flex gap-1.5">
        {MODE_OPTS.map(([v, l]) => (
          <button key={v} onClick={() => onSet(v)}
            className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${value === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const groupBlock = (grp: 'content' | 'shopping', title: string, hint: string) => (
    <div className="rounded-lg border border-divider p-2.5 space-y-2.5">
      <div>
        <div className="text-[11px] font-medium text-fg-primary">{title}</div>
        <div className="text-[10px] text-fg-secondary leading-tight">{hint}</div>
      </div>
      {modeRow('Ordinateur', eff[grp].desktop, (v) => setLayout(grp, { desktop: v }))}
      {modeRow('Mobile', eff[grp].mobile, (v) => setLayout(grp, { mobile: v }))}
      <label className="flex items-center gap-2 text-xs text-fg-primary">
        <input type="checkbox" checked={eff[grp].bottom_bar} onChange={(e) => setLayout(grp, { bottom_bar: e.target.checked })} className="accent-brand-500" />
        Barre du bas sur mobile
      </label>
      {eff[grp].desktop === 'hidden' && (
        <p className="text-[10px] text-amber-600">Aucune barre en haut sur ordinateur pour ce type de page.</p>
      )}
    </div>
  );

  const sec = (title: string, node: React.ReactNode) => (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary">{title}</div>
      {node}
    </div>
  );
  const colorRow = (label: string, value: string | undefined, onChange: (v: string) => void, fallback: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-fg-primary">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-divider cursor-pointer" />
        <button onClick={() => onChange('')} className={`text-[10px] ${value ? 'text-fg-secondary hover:text-fg-primary' : 'text-fg-tertiary'}`}>Auto</button>
      </div>
    </div>
  );

  const styleOpts = [
    { v: 'solid', label: 'Pleine', hint: 'Fond opaque en permanence' },
    { v: 'overlay', label: 'Superposée', hint: 'Transparente sur la bannière, opaque au survol' },
    { v: 'custom', label: 'Couleur', hint: 'Fond de couleur personnalisée' },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] leading-relaxed text-fg-secondary">
        La barre de navigation est <strong>partagée par toutes les pages</strong> du site : accueil, commande, traiteur et pages personnalisées.
      </p>

      {sec('Composition par type de page',
        <div className="space-y-2">
          <p className="text-[10px] text-fg-secondary leading-tight">
            Choisissez l&apos;affichage de la navigation, séparément sur <strong>ordinateur</strong> et <strong>mobile</strong>. Complète = logo + liens + bouton ; Compacte = logo + menu hamburger + bouton ; Masquée = aucune barre en haut.
          </p>
          {groupBlock('content', 'Pages de contenu', 'Accueil et pages de contenu')}
          {groupBlock('shopping', 'Pages boutique', 'Commande, traiteur, pages boutique')}
        </div>,
      )}

      {sec('Barre du bas (mobile)',
        <div className="space-y-2">
          <p className="text-[10px] text-fg-secondary leading-tight">
            La barre du bas s&apos;affiche sur mobile pour les types de page activés ci-dessus. Onglets&nbsp;: Menu, Traiteur, Stories, Compte.
          </p>
          {config.stories_enabled ? (
            <div>
              <label className="block text-xs text-fg-primary mb-1">Onglet par défaut</label>
              <div className="flex gap-1.5">
                {([['menu', 'Menu'], ['stories', 'Stories']] as const).map(([v, l]) => {
                  const first = (config.nav_order || 'menu').split(',')[0] === v;
                  return (
                    <button key={v} onClick={() => onUpdate({ nav_order: v === 'menu' ? 'menu,stories' : 'stories,menu' })}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${first ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-fg-tertiary">Activez les Stories (page Reels) pour réordonner les onglets.</p>
          )}
        </div>,
      )}

      {sec('Style de la barre',
        <div className="grid grid-cols-2 gap-1.5">
          {styleOpts.map((o) => (
            <button key={o.v} onClick={() => onUpdate({ navbar_style: o.v })}
              className={`text-left px-2.5 py-2 rounded-lg border text-xs transition ${style === o.v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
              <div className="font-medium">{o.label}</div>
              <div className="text-[10px] text-fg-secondary leading-tight mt-0.5">{o.hint}</div>
            </button>
          ))}
        </div>,
      )}

      <>
          {sec('Logo',
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-fg-primary mb-1">Position</label>
                <div className="flex gap-1.5">
                  {(['left', 'center', 'right'] as const).map((v) => (
                    <button key={v} onClick={() => onUpdate({ navbar_logo_position: v })}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${pos === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                      {v === 'left' ? 'Gauche' : v === 'center' ? 'Centre' : 'Droite'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Taille du logo</span><span className="text-fg-secondary">{config.logo_size || 40}px</span>
                </label>
                <input type="range" min={24} max={96} step={2} value={config.logo_size || 40} onChange={(e) => onUpdate({ logo_size: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={!!config.hide_navbar_name} onChange={(e) => onUpdate({ hide_navbar_name: e.target.checked })} className="accent-brand-500" />
                Masquer le nom du restaurant
              </label>
              {isOverlay && (
                <div>
                  <label className="block text-xs text-fg-primary mb-1">Logo pour l&apos;état opaque (au survol)</label>
                  <SectionImageUploader restaurantId={restaurantId} currentUrl={config.navbar_scrolled_logo_url || ''} onUploaded={(url) => onUpdate({ navbar_scrolled_logo_url: url })} onRemove={() => onUpdate({ navbar_scrolled_logo_url: '' })} label="Téléverser un logo" />
                  <p className="text-[10px] text-fg-secondary mt-1">Optionnel. Sur la bannière on affiche le logo principal (souvent clair) ; au survol, ce logo (souvent foncé).</p>
                </div>
              )}
            </div>,
          )}

          {sec('Couleurs',
            <div className="space-y-2">
              {colorRow(isOverlay ? 'Fond au survol' : 'Fond', config.navbar_color, (v) => onUpdate({ navbar_color: v }), '#ffffff')}
              {colorRow(isOverlay ? 'Texte au survol' : 'Texte', config.navbar_text_color, (v) => onUpdate({ navbar_text_color: v }), '#111111')}
              {isOverlay && colorRow('Texte sur la bannière', config.navbar_overlay_text_color, (v) => onUpdate({ navbar_overlay_text_color: v }), '#ffffff')}
            </div>,
          )}

          {sec('Typographie',
            <div className="space-y-3">
              <div className="flex gap-1.5">
                <div className="flex-1 min-w-0">
                  <FontSelect
                    value={navFont}
                    onChange={setNavFont}
                    extraFonts={navExtraFonts}
                    defaultLabel="Police par défaut"
                    onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
                  />
                </div>
                <select
                  value={navType.weight ?? ''}
                  onChange={(e) => setNavType({ weight: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-[104px] shrink-0 px-2 py-1.5 rounded-lg border border-divider bg-[var(--surface)] text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  style={navType.weight ? { fontWeight: navType.weight } : undefined}
                >
                  <option value="">Auto</option>
                  {navWeights.map((w) => (
                    <option key={w} value={w} style={{ fontWeight: w }}>{WEIGHT_LABELS[w] ?? w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Taille des liens</span><span className="text-fg-secondary">{navType.size || 14}px</span>
                </label>
                <input type="range" min={11} max={22} step={1} value={navType.size || 14} onChange={(e) => setNavType({ size: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-fg-primary mb-1">
                  <span>Interlettrage</span><span className="text-fg-secondary">{navType.letter_spacing || 0}px</span>
                </label>
                <input type="range" min={0} max={6} step={0.5} value={navType.letter_spacing || 0} onChange={(e) => setNavType({ letter_spacing: Number(e.target.value) })} className="w-full accent-brand-500" />
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={!!navType.uppercase} onChange={(e) => setNavType({ uppercase: e.target.checked })} className="accent-brand-500" />
                Majuscules
              </label>
            </div>,
          )}

          {sec('Style des liens',
            <div className="grid grid-cols-2 gap-1.5">
              {([['text', 'Texte'], ['underline', 'Souligné'], ['pill', 'Pilule'], ['bordered', 'Encadré']] as const).map(([v, label]) => (
                <button key={v} onClick={() => onUpdate({ navbar_link_style: v })}
                  className={`px-2.5 py-2 rounded-lg border text-xs transition ${linkStyle === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                  {label}
                </button>
              ))}
            </div>,
          )}

          {sec("Bouton d'action",
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-fg-primary">
                <input type="checkbox" checked={ctaEnabled} onChange={(e) => setCta({ enabled: e.target.checked })} className="accent-brand-500" />
                Afficher le bouton
              </label>
              {ctaEnabled && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Texte</label>
                    <input className="input" value={cta.text || ''} placeholder="Commander" onChange={(e) => setCta({ text: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Lien</label>
                    <select className="input" value={linkMode} onChange={(e) => { const m = e.target.value as 'order' | 'catering' | 'custom'; setLinkMode(m); setCta({ link: m === 'custom' ? '' : m }); }}>
                      <option value="order">Commander</option>
                      <option value="catering">Traiteur</option>
                      <option value="custom">Lien personnalisé…</option>
                    </select>
                    {linkMode === 'custom' && (
                      <input className="input mt-1.5" value={cta.link || ''} placeholder="https://… ou /nom-de-page" onChange={(e) => setCta({ link: e.target.value })} />
                    )}
                  </div>
                  {colorRow('Fond du bouton', cta.bg, (v) => setCta({ bg: v }), '#ea580c')}
                  {colorRow('Texte du bouton', cta.text_color, (v) => setCta({ text_color: v }), '#ffffff')}
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Forme</label>
                    <div className="flex gap-1.5">
                      {([['pill', 'Pilule'], ['rounded', 'Arrondi'], ['square', 'Carré']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ shape: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.shape || 'pill') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Taille</label>
                    <div className="flex gap-1.5">
                      {([['sm', 'S'], ['md', 'M'], ['lg', 'L']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ size: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.size || 'md') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-primary mb-1">Style</label>
                    <div className="flex gap-1.5">
                      {([['filled', 'Plein'], ['outline', 'Contour'], ['ghost', 'Fantôme']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setCta({ variant: v })}
                          className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition ${(cta.variant || 'filled') === v ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-divider text-fg-primary hover:bg-surface-subtle'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>,
          )}
      </>
    </div>
  );
}

function SiteStylesPanel({ styles, currentPrimary, onApply, primaryColor, secondaryColor, fontFamily, onPrimaryChange, onSecondaryChange, onFontChange }: {
  styles: SiteStylePreset[];
  currentPrimary: string;
  onApply: (s: SiteStylePreset) => void;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  onPrimaryChange: (v: string) => void;
  onSecondaryChange: (v: string) => void;
  onFontChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider">Site Styles</h3>
      <div className="grid grid-cols-2 gap-2">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onApply(style)}
            className={`p-3 rounded-lg border-2 transition-all text-center ${
              currentPrimary === style.primary_color
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-[var(--divider)] hover:border-fg-secondary/30 bg-[var(--surface)]'
            }`}
          >
            <div className="text-lg font-bold" style={{ color: style.primary_color, fontFamily: `"${style.font_family}", sans-serif` }}>
              Aa
            </div>
            <div className="w-full h-1.5 rounded-full mt-1.5" style={{ backgroundColor: style.primary_color }} />
            <div className="text-[10px] text-fg-secondary mt-1 truncate">{style.name}</div>
          </button>
        ))}
      </div>

      <hr className="border-[var(--divider)]" />

      <h3 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider">Custom Colors</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-fg-secondary mb-1 block">Primary</label>
          <div className="flex gap-2">
            <input type="color" value={primaryColor} onChange={(e) => onPrimaryChange(e.target.value)} className="w-8 h-8 rounded border border-[var(--divider)] cursor-pointer" />
            <input type="text" value={primaryColor} onChange={(e) => onPrimaryChange(e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
          </div>
        </div>
        <div>
          <label className="text-xs text-fg-secondary mb-1 block">Secondary</label>
          <div className="flex gap-2">
            <input type="color" value={secondaryColor} onChange={(e) => onSecondaryChange(e.target.value)} className="w-8 h-8 rounded border border-[var(--divider)] cursor-pointer" />
            <input type="text" value={secondaryColor} onChange={(e) => onSecondaryChange(e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
          </div>
        </div>
        <div>
          <label className="text-xs text-fg-secondary mb-1 block">Font</label>
          <select value={fontFamily} onChange={(e) => onFontChange(e.target.value)} className="w-full text-xs border border-[var(--divider)] rounded px-2 py-1.5 bg-[var(--surface)] text-fg-primary">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}


function SectionListPanel({ sections, selectedId, onSelect, onMove, onToggleVisibility }: {
  sections: WebsiteSection[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-0.5">
      {sections.map((section, idx) => {
        const meta = SECTION_TYPE_META[section.section_type];
        return (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
              selectedId === section.id
                ? 'bg-brand-500/10 border border-brand-500'
                : 'hover:bg-surface-subtle border border-transparent'
            } ${!section.is_visible ? 'opacity-50' : ''}`}
          >
            <span className="text-base flex-shrink-0">{meta?.icon || '\u{1F4C4}'}</span>
            <span className="text-sm font-medium text-fg-primary flex-1 truncate">
              {meta ? t(meta.labelKey) : section.section_type}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onMove(section.id, 'up'); }} disabled={idx === 0} className="p-0.5 text-fg-secondary hover:text-fg-primary disabled:opacity-30">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onMove(section.id, 'down'); }} disabled={idx === sections.length - 1} className="p-0.5 text-fg-secondary hover:text-fg-primary disabled:opacity-30">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(section.id, !section.is_visible); }} className="p-0.5 text-fg-secondary hover:text-fg-primary">
                {section.is_visible ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                )}
              </button>
            </div>
          </div>
        );
      })}
      {sections.length === 0 && (
        <p className="text-xs text-fg-secondary text-center py-6">No sections on this page.<br />Click + to add one.</p>
      )}
    </div>
  );
}

function PreviewPanel({ mode, activePage, restaurant, primaryColor, secondaryColor, fontFamily, themeMode, menuLayout, cartStyle, navbarStyle, navbarColor, logoSize, hideNavbarName, sections, selectedSectionId }: {
  mode: 'mobile' | 'desktop';
  activePage: string;
  restaurant: Restaurant | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  themeMode: 'light' | 'dark';
  menuLayout: string;
  cartStyle: string;
  navbarStyle: string;
  navbarColor: string;
  logoSize: number;
  hideNavbarName: boolean;
  sections: WebsiteSection[];
  selectedSectionId: number | null;
}) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const slug = restaurant?.slug || String(restaurant?.id || '');
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';
  const pagePath = activePage === 'menu' ? `/r/${slug}/order` : `/r/${slug}`;
  const iframeSrc = `${webUrl}${pagePath}`;

  // Helper to send all overrides to iframe
  const sendOverrides = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Send theme overrides (includes menu page settings so order iframe updates too)
    iframe.contentWindow.postMessage({
      type: 'foody-theme-override',
      config: { primaryColor, secondaryColor, fontFamily, themeMode, menuLayout, cartStyle, navbarStyle, navbarColor, logoSize, hideNavbarName },
    }, '*');

    // Send section content overrides
    iframe.contentWindow.postMessage({
      type: 'foody-sections-override',
      sections,
    }, '*');

    // Send section highlight
    iframe.contentWindow.postMessage({
      type: 'foody-highlight-section',
      sectionId: selectedSectionId,
    }, '*');
  }, [primaryColor, secondaryColor, fontFamily, themeMode, menuLayout, cartStyle, navbarStyle, navbarColor, logoSize, hideNavbarName, sections, selectedSectionId]);

  // Send overrides whenever they change
  useEffect(() => {
    sendOverrides();
  }, [sendOverrides]);

  // Also send on iframe load — retry a few times to ensure React has mounted listeners
  const handleIframeLoad = () => {
    setTimeout(sendOverrides, 300);
    setTimeout(sendOverrides, 800);
    setTimeout(sendOverrides, 1500);
  };

  if (!slug) {
    return <div className="flex items-center justify-center h-full text-fg-secondary text-sm">{t('loading')}</div>;
  }

  if (mode === 'desktop') {
    return (
      <div className="w-full h-full">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          onLoad={handleIframeLoad}
          className="w-full h-full border-0"
          title="Website Preview"
        />
      </div>
    );
  }

  // Mobile: centered phone frame
  return (
    <div className="py-6">
      <div className="relative mx-auto rounded-[2.5rem] border-[4px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden" style={{ width: 375 }}>
        {/* Notch */}
        <div className="relative z-10 flex justify-center">
          <div className="w-28 h-6 bg-gray-900 rounded-b-2xl" />
        </div>
        {/* Screen */}
        <div className="overflow-hidden rounded-b-[2rem]" style={{ height: 700, marginTop: -2 }}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="Website Preview"
            style={{ width: 375, height: 700 }}
          />
        </div>
        {/* Home indicator */}
        <div className="flex justify-center py-2">
          <div className="w-28 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function AddSectionModal({ onAdd, onClose }: { onAdd: (type: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-fg-primary mb-4">Add Section</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(SECTION_TYPE_META).filter(([type]) => type !== 'footer').map(([type, meta]) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className="p-4 rounded-xl border border-[var(--divider)] hover:border-brand-500 hover:bg-brand-500/5 transition-all text-left"
            >
              <span className="text-2xl block mb-1">{meta.icon}</span>
              <div className="font-medium text-fg-primary text-sm">{t(meta.labelKey)}</div>
              <div className="text-xs text-fg-secondary mt-0.5">{t(meta.descKey)}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-fg-secondary hover:text-fg-primary transition">{t('cancel')}</button>
      </div>
    </div>
  );
}

// Template picker: pick a ready-made multi-page design. Applying replaces the
// current page content (with a confirm) and seeds the draft to tweak + publish.
function TemplatePickerModal({ hasCatering, onApply, onClose }: {
  hasCatering: boolean;
  onApply: (tpl: WebsiteTemplate) => void;
  onClose: () => void;
}) {
  function pick(tpl: WebsiteTemplate) {
    if (typeof window !== 'undefined' && !window.confirm('Appliquer ce modèle ? Le contenu actuel de vos pages sera remplacé (vous pourrez ensuite tout modifier avant de publier).')) return;
    onApply(tpl);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-fg-primary">Modèles de site</h2>
        <p className="text-sm text-fg-secondary mt-1 mb-4">Choisissez un modèle pour créer votre site en un clic, puis remplacez les images et les textes.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WEBSITE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => pick(tpl)}
              className="p-4 rounded-xl border border-[var(--divider)] hover:border-brand-500 hover:bg-brand-500/5 transition-all text-left"
            >
              <span className="text-3xl block mb-1.5">{tpl.emoji}</span>
              <div className="font-semibold text-fg-primary text-sm flex items-center gap-1.5">
                {tpl.name}
                {tpl.usesCatering && !hasCatering && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded px-1.5 py-0.5">Traiteur requis</span>
                )}
              </div>
              <div className="text-xs text-fg-secondary mt-1 leading-relaxed">{tpl.description}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-fg-secondary hover:text-fg-primary transition">Annuler</button>
      </div>
    </div>
  );
}
