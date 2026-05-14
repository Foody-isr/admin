'use client';

import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import {
  getWebsiteConfig, updateWebsiteConfig, resetWebsiteConfig, getRestaurant, updateRestaurant,
  listWebsiteSections, createWebsiteSection, updateWebsiteSection,
  deleteWebsiteSection, reorderWebsiteSections, listSiteStyles,
  uploadRestaurantLogo, uploadRestaurantBackground, uploadSectionImage,
  getAllCategories, getThemeCatalog,
  getWebsiteDraft, saveWebsiteDraft, publishWebsiteDraft, discardWebsiteDraft,
  DraftStatePayload, DraftSectionPayload,
  WebsiteConfig, WebsiteSection, SiteStylePreset, Restaurant, MenuCategory, MenuItem,
  ThemeCatalog,
} from '@/lib/api';
import { ThemesPanel } from '@/components/website-menu/ThemesPanel';
import { TypographyPanel } from '@/components/website-menu/TypographyPanel';
import { BrandingPanel } from '@/components/website-menu/BrandingPanel';
import { CoverFocalPicker } from '@/components/website/CoverFocalPicker';
import { SelectionOverlay, SectionBounds } from '@/components/website/SelectionOverlay';

type MenuSubTab = 'themes' | 'typography' | 'branding';
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

type PreviewMessage = {
  type: 'foody-theme-preview';
  themeId: string;
  pairingId: string;
  brandColor: string | null;
  layoutDefault: 'compact' | 'magazine';
  logoSize: number;
  hideNavbarName: boolean;
  faviconURL: string;
  direction: 'ltr' | 'rtl';
};

// ─── Constants ──────────────────────────────────────────────────────

const FONT_OPTIONS = [
  'Nunito Sans', 'Inter', 'Poppins', 'Rubik', 'Open Sans',
  'Playfair Display', 'Cinzel Decorative', 'Cormorant Garamond',
  'Lora', 'Montserrat', 'Oswald', 'Raleway', 'Dancing Script',
  'Great Vibes', 'Merriweather', 'Bitter', 'Crimson Text', 'Eros',
];

const SECTION_TYPE_META: Record<string, { labelKey: string; icon: string; descKey: string }> = {
  hero_banner:     { labelKey: 'heroBanner',      icon: '\u{1F5BC}\u{FE0F}', descKey: 'heroBannerDesc' },
  scrolling_text:  { labelKey: 'scrollingText',   icon: '\u{1F4DC}', descKey: 'scrollingTextDesc' },
  text_and_image:  { labelKey: 'textAndImage',     icon: '\u{1F4DD}', descKey: 'textAndImageDesc' },
  gallery:         { labelKey: 'gallery',           icon: '\u{1F3A8}', descKey: 'galleryDesc' },
  testimonials:    { labelKey: 'testimonials',      icon: '\u{1F4AC}', descKey: 'testimonialsDesc' },
  about:           { labelKey: 'about',             icon: '\u{1F4A1}', descKey: 'aboutDesc' },
  menu_highlights: { labelKey: 'menuHighlights',   icon: '\u{2B50}', descKey: 'menuHighlightsDesc' },
  promo_banner:    { labelKey: 'promoBanner',      icon: '\u{1F3F7}\u{FE0F}', descKey: 'promoBannerDesc' },
  social_feed:     { labelKey: 'socialLinks',      icon: '\u{1F4F1}', descKey: 'socialLinksDesc' },
  action_buttons:  { labelKey: 'actionButtons',    icon: '\u{1F518}', descKey: 'actionButtonsDesc' },
  picnic_basket:   { labelKey: 'picnicBasket',     icon: '\u{1F9FA}', descKey: 'picnicBasketDesc' },
  footer:          { labelKey: 'footer',            icon: '\u{1F3E0}', descKey: 'footerDesc' },
};

const LAYOUT_OPTIONS: Record<string, { value: string; labelKey: string }[]> = {
  hero_banner:    [{ value: 'centered', labelKey: 'centered' }, { value: 'left_aligned', labelKey: 'leftAligned' }, { value: 'split', labelKey: 'split' }],
  text_and_image: [{ value: 'default', labelKey: 'imageRight' }, { value: 'image_left', labelKey: 'imageLeft' }],
  gallery:        [{ value: 'grid', labelKey: 'grid' }, { value: 'masonry', labelKey: 'masonry' }],
  testimonials:   [{ value: 'carousel', labelKey: 'carousel' }, { value: 'grid', labelKey: 'grid' }],
  footer:         [{ value: 'columns', labelKey: 'columns' }, { value: 'centered', labelKey: 'centered' }, { value: 'minimal', labelKey: 'minimal' }],
};

const COLOR_STYLES = [
  { value: 'light', labelKey: 'light' },
  { value: 'dark', labelKey: 'dark' },
  { value: 'custom', labelKey: 'custom' },
];

const ACTION_TYPES = [
  { value: 'order_pickup', labelKey: 'orderPickup' },
  { value: 'order_delivery', labelKey: 'orderDelivery' },
  { value: 'view_menu', labelKey: 'viewMenu' },
  { value: 'external_link', labelKey: 'externalLink' },
  { value: 'scroll_to_section', labelKey: 'scrollToSection' },
];

const BUTTON_STYLES = [
  { value: 'primary', labelKey: 'primary' },
  { value: 'secondary', labelKey: 'secondary' },
  { value: 'outline', labelKey: 'outline' },
];

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
  type EditorMode = 'pages' | 'theme' | 'settings';
  type ThemeSubMode = 'colors' | 'typography' | 'logo';
  type SettingsSubMode = 'general' | 'contact' | 'social' | 'seo';
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [activePage, setActivePage] = useState('home');

  // Config form state — landing-page concerns only.
  // Menu/order page styling lives under /website/menu/{themes,typography,branding}.
  const [tagline, setTagline] = useState('');
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showHours, setShowHours] = useState(true);
  const [navbarStyle, setNavbarStyle] = useState<string>('solid');
  const [navbarColor, setNavbarColor] = useState<string>('');
  const [logoSize, setLogoSize] = useState<number>(40);
  const [hideNavbarName, setHideNavbarName] = useState<boolean>(false);
  const [heroNameFont, setHeroNameFont] = useState<string>('');
  const [categoryBannerStyle, setCategoryBannerStyle] = useState<'' | 'image-overlay' | 'text-block' | 'striped-rule' | 'none'>('image-overlay');

  const selectedSection = sections.find(s => s.id === selectedSectionId) || null;
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
      logoSize: next.logo_size,
      hideNavbarName: next.hide_navbar_name,
      faviconURL: next.favicon_url || '',
      direction: 'ltr',
    };
    win.postMessage(message, '*');
  }, []);

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

  // Listen for section clicks from inside the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'foody-select-section' && typeof e.data.sectionId === 'number') {
        setSelectedSectionId(e.data.sectionId);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function closeSettings() {
    setShowSettingsPanel(false);
    setSelectedSectionId(null);
  }

  const pages: string[] = ['home', 'menu'];

  // Filter sections by active page, footer always last
  const filteredSections = sections
    .filter(s => (s.page || 'home') === activePage)
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
    setNavbarStyle(stateConfig.navbar_style || 'solid');
    setNavbarColor(stateConfig.navbar_color || '');
    setLogoSize(stateConfig.logo_size > 0 ? stateConfig.logo_size : 40);
    setHideNavbarName(stateConfig.hide_navbar_name || false);
    setHeroNameFont(stateConfig.hero_name_font || '');
    setCategoryBannerStyle((stateConfig.category_banner_style as typeof categoryBannerStyle) || 'image-overlay');

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
          hero_name_font: stateConfig.hero_name_font || '',
          category_banner_style: stateConfig.category_banner_style || 'image-overlay',
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

        // Auto-create essential sections (footer, action_buttons) if missing.
        // Done locally so it lands in the draft without touching live state.
        const existingTypes = new Set((draft.state.sections || []).map((s) => s.section_type));
        const missing: DraftSectionPayload[] = [];
        if (!existingTypes.has('footer')) {
          missing.push({
            tmp_id: `tmp_${Date.now()}_footer`, section_type: 'footer', page: 'home',
            is_visible: true, layout: 'columns', sort_order: 99,
            content: getDefaultContent('footer'), settings: { color_style: 'dark' },
          });
        }
        if (!existingTypes.has('action_buttons')) {
          missing.push({
            tmp_id: `tmp_${Date.now()}_action`, section_type: 'action_buttons', page: 'home',
            is_visible: true, layout: 'default', sort_order: (draft.state.sections?.length || 0),
            content: getDefaultContent('action_buttons'),
            settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' },
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
        navbar_style: navbarStyle,
        navbar_color: navbarColor,
        logo_size: logoSize,
        hide_navbar_name: hideNavbarName,
        hero_name_font: heroNameFont,
        category_banner_style: categoryBannerStyle,
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
  }, [config, tagline, showAddress, showPhone, showHours, navbarStyle, navbarColor, logoSize, hideNavbarName, heroNameFont, categoryBannerStyle, sections, deletedIds]);

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
      page: activePage,
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
            <span className="text-[9px] uppercase tracking-[0.12em] text-fg-secondary">Site web</span>
            <span className="text-[13px] font-semibold text-fg-primary truncate max-w-[180px]">
              {restaurant?.name ?? 'Sans titre'}
            </span>
          </div>
        </div>

        {/* Center: mode tabs (Pages / Thème / Paramètres) */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-subtle)' }}>
          {(['pages', 'theme', 'settings'] as EditorMode[]).map((m) => {
            const label = m === 'pages' ? 'Pages' : m === 'theme' ? 'Thème' : 'Paramètres';
            const active = editorMode === m;
            return (
              <button
                key={m}
                onClick={() => { setEditorMode(m); if (m !== 'pages') setSelectedSectionId(null); }}
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
            <PagesLeftRail
              activePage={activePage}
              onActivePageChange={setActivePage}
              sections={filteredSections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              onMove={handleMoveSection}
              onToggleVisibility={(id, visible) => handleUpdateSection(id, { is_visible: visible })}
              onAddSection={() => setShowAddModal(true)}
            />
          )}
          {editorMode === 'theme' && (
            <ThemeLeftRail
              subMode={themeSubMode}
              onSubModeChange={setThemeSubMode}
              config={config}
              themeCatalog={themeCatalog}
              onConfigUpdate={handleMenuConfigUpdate}
              restaurantId={restaurantId}
              restaurant={restaurant}
              logoSize={logoSize}
              hideNavbarName={hideNavbarName}
              heroNameFont={heroNameFont}
              onLogoSizeChange={setLogoSize}
              onHideNavbarNameChange={setHideNavbarName}
              onHeroNameFontChange={setHeroNameFont}
              onRestaurantUpdate={setRestaurant}
            />
          )}
          {editorMode === 'settings' && (
            <SettingsLeftRail
              subMode={settingsSubMode}
              onSubModeChange={setSettingsSubMode}
              restaurant={restaurant}
              tagline={tagline}
              navbarStyle={navbarStyle}
              navbarColor={navbarColor}
              showAddress={showAddress}
              showPhone={showPhone}
              showHours={showHours}
              socialLinks={(config?.social_links as Record<string, string>) ?? {}}
              onTaglineChange={setTagline}
              onNavbarStyleChange={setNavbarStyle}
              onNavbarColorChange={setNavbarColor}
              onShowAddressChange={setShowAddress}
              onShowPhoneChange={setShowPhone}
              onShowHoursChange={setShowHours}
              onSocialLinksChange={(links) => setConfig((c) => (c ? ({ ...c, social_links: links } as WebsiteConfig) : c))}
            />
          )}
        </div>

        {/* Center: live preview iframe */}
        <div
          className="flex-1 overflow-auto flex items-start justify-center py-6"
          style={{ background: previewMode === 'mobile' ? 'var(--surface-subtle)' : 'var(--bg-page)' }}
        >
          {editorMode === 'pages' && activePage === 'menu' ? (
            <MenuPreviewIframe
              ref={menuIframeRef}
              mode={previewMode}
              slug={restaurant?.slug}
              config={config}
              postMessage={postMenuPreview}
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
        </div>

        {/* Right panel — section settings (Pages mode, home page, section selected) */}
        {editorMode === 'pages' && activePage === 'home' && selectedSection && (
          <div className="border-l border-divider flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 340, background: 'var(--surface)' }}>
            <div className="flex items-start justify-between px-4 py-3 border-b border-divider sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] uppercase tracking-[0.12em] text-fg-secondary">
                  Pages › {activePage === 'home' ? 'Landing' : 'Order'}
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
          onSelect={(id) => { if (typeof id === 'number') setSelectedSectionId(id); }}
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

function PagesLeftRail({ activePage, onActivePageChange, sections, selectedId, onSelect, onMove, onToggleVisibility, onAddSection }: {
  activePage: string;
  onActivePageChange: (p: string) => void;
  sections: WebsiteSection[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
  onAddSection: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Page switcher */}
      <div className="px-4 pt-4 pb-3 border-b border-divider">
        <label className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-1.5">Page</label>
        <select
          value={activePage}
          onChange={(e) => onActivePageChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="home">Landing</option>
          <option value="menu">Page de commande</option>
        </select>
      </div>

      {/* Section list */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-fg-secondary">Sections</span>
        {activePage === 'home' && (
          <button
            onClick={onAddSection}
            className="text-[11px] font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1"
          >
            + Ajouter
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {activePage === 'home' ? (
          <SectionListPanel
            sections={sections}
            selectedId={selectedId}
            onSelect={onSelect}
            onMove={onMove}
            onToggleVisibility={onToggleVisibility}
          />
        ) : (
          <div className="px-3 py-6 text-xs text-fg-secondary">
            La page de commande utilise le catalogue de menu existant. Les ajustements de mise en page se font via le mode <strong>Thème</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeLeftRail({ subMode, onSubModeChange, config, themeCatalog, onConfigUpdate, restaurantId, restaurant, logoSize, hideNavbarName, heroNameFont, onLogoSizeChange, onHideNavbarNameChange, onHeroNameFontChange, onRestaurantUpdate }: {
  subMode: 'colors' | 'typography' | 'logo';
  onSubModeChange: (m: 'colors' | 'typography' | 'logo') => void;
  config: WebsiteConfig | null;
  themeCatalog: ThemeCatalog | null;
  onConfigUpdate: (patch: Partial<WebsiteConfig>) => void;
  restaurantId: number;
  restaurant: Restaurant | null;
  logoSize: number;
  hideNavbarName: boolean;
  heroNameFont: string;
  onLogoSizeChange: (n: number) => void;
  onHideNavbarNameChange: (v: boolean) => void;
  onHeroNameFontChange: (f: string) => void;
  onRestaurantUpdate: (r: Restaurant) => void;
}) {
  const tabs: { id: typeof subMode; label: string }[] = [
    { id: 'colors', label: 'Couleurs' },
    { id: 'typography', label: 'Typographie' },
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
          <div className="space-y-4">
            <TypographyPanel config={config} catalog={themeCatalog} onUpdate={onConfigUpdate} />
            <div className="border-t border-divider pt-4">
              <label className="block text-xs font-medium text-fg-primary mb-1.5">Police du nom du restaurant (hero)</label>
              <select
                value={heroNameFont}
                onChange={(e) => onHeroNameFontChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="">Par défaut (typographie du thème)</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <BrandingPanel config={config} onUpdate={onConfigUpdate} />
            <div className="border-t border-divider pt-4 space-y-3">
              <div>
                <label className="flex items-center justify-between text-xs font-medium text-fg-primary mb-1.5">
                  <span>Taille du logo (navbar)</span>
                  <span className="text-fg-secondary">{logoSize}px</span>
                </label>
                <input
                  type="range" min={24} max={80}
                  value={logoSize}
                  onChange={(e) => onLogoSizeChange(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideNavbarName}
                  onChange={(e) => onHideNavbarNameChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Masquer le nom du restaurant dans la navbar</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsLeftRail({ subMode, onSubModeChange, restaurant, tagline, navbarStyle, navbarColor, showAddress, showPhone, showHours, socialLinks, onTaglineChange, onNavbarStyleChange, onNavbarColorChange, onShowAddressChange, onShowPhoneChange, onShowHoursChange, onSocialLinksChange }: {
  subMode: 'general' | 'contact' | 'social' | 'seo';
  onSubModeChange: (m: 'general' | 'contact' | 'social' | 'seo') => void;
  restaurant: Restaurant | null;
  tagline: string;
  navbarStyle: string;
  navbarColor: string;
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  socialLinks: Record<string, string>;
  onTaglineChange: (v: string) => void;
  onNavbarStyleChange: (v: string) => void;
  onNavbarColorChange: (v: string) => void;
  onShowAddressChange: (v: boolean) => void;
  onShowPhoneChange: (v: boolean) => void;
  onShowHoursChange: (v: boolean) => void;
  onSocialLinksChange: (links: Record<string, string>) => void;
}) {
  const tabs: { id: typeof subMode; label: string }[] = [
    { id: 'general', label: 'Général' },
    { id: 'contact', label: 'Contact' },
    { id: 'social', label: 'Réseaux sociaux' },
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
            <div>
              <label className="block text-xs font-medium text-fg-primary mb-1.5">Style de la barre de navigation</label>
              <select
                value={navbarStyle}
                onChange={(e) => onNavbarStyleChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-divider bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="solid">Plein</option>
                <option value="transparent">Transparent</option>
                <option value="hidden">Masqué</option>
                <option value="custom">Sur mesure</option>
              </select>
            </div>
            {navbarStyle === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-fg-primary mb-1.5">Couleur de la navbar</label>
                <input
                  type="color"
                  value={navbarColor || '#000000'}
                  onChange={(e) => onNavbarColorChange(e.target.value)}
                  className="w-full h-9 rounded-lg border border-divider cursor-pointer"
                />
              </div>
            )}
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
          </>
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

function LiveHomePreviewIframe({ mode, slug, draftPayload, onSectionClick, onBoundsUpdate, onIframeRectUpdate }: {
  mode: 'mobile' | 'desktop';
  slug: string | undefined;
  draftPayload: DraftStatePayload;
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
        src={`${WEB_URL}/r/${slug}?preview=1`}
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

function StyleSettingsPanel({ restaurantId, restaurant, tagline, themeMode, showAddress, showPhone, showHours, navbarStyle, navbarColor, logoSize, hideNavbarName, heroNameFont, categoryBannerStyle, onTaglineChange, onThemeModeChange, onShowAddressChange, onShowPhoneChange, onShowHoursChange, onNavbarStyleChange, onNavbarColorChange, onLogoSizeChange, onHideNavbarNameChange, onHeroNameFontChange, onCategoryBannerStyleChange, onRestaurantUpdate, onReset }: {
  restaurantId: number;
  restaurant: Restaurant | null;
  tagline: string;
  themeMode: 'light' | 'dark';
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  navbarStyle: string;
  navbarColor: string;
  logoSize: number;
  hideNavbarName: boolean;
  heroNameFont: string;
  categoryBannerStyle: '' | 'image-overlay' | 'text-block' | 'striped-rule' | 'none';
  onTaglineChange: (v: string) => void;
  onThemeModeChange: (v: 'light' | 'dark') => void;
  onShowAddressChange: (v: boolean) => void;
  onShowPhoneChange: (v: boolean) => void;
  onShowHoursChange: (v: boolean) => void;
  onNavbarStyleChange: (v: string) => void;
  onNavbarColorChange: (v: string) => void;
  onLogoSizeChange: (v: number) => void;
  onHideNavbarNameChange: (v: boolean) => void;
  onHeroNameFontChange: (v: string) => void;
  onCategoryBannerStyleChange: (v: '' | 'image-overlay' | 'text-block' | 'striped-rule' | 'none') => void;
  onRestaurantUpdate: (r: Restaurant) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState(restaurant?.background_color || '#EB5204');

  const coverMode = restaurant?.cover_display_mode || 'cover';

  // Load the selected hero name font so the inline preview renders correctly.
  useEffect(() => {
    if (!heroNameFont || typeof document === 'undefined') return;
    const id = `gf-${heroNameFont.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    const family = heroNameFont.replace(/\s+/g, '+');
    link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [heroNameFont]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const imageUrl = await uploadRestaurantLogo(restaurantId, file);
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, logo_url: imageUrl } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch {
      // Error is shown at parent level
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    try {
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, logo_url: '' } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch { /* */ }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const imageUrl = await uploadRestaurantBackground(restaurantId, file);
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, cover_url: imageUrl } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch {
      // Error is shown at parent level
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleRemoveCover() {
    try {
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, cover_url: '', background_color: '' } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch { /* */ }
  }

  async function handleSetDisplayMode(mode: string) {
    try {
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, cover_display_mode: mode } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch { /* */ }
  }

  async function handleSetBackgroundColor(hex: string) {
    try {
      const updated = await updateRestaurant(restaurantId, { name: restaurant?.name, background_color: hex, cover_url: '' } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch { /* */ }
  }

  // Debounced focal-point save: drag fires many onChange events, but we only
  // want one network round-trip per drag. Optimistic update keeps the marker
  // tracking the pointer in real time.
  const focalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function handleFocalChange(x: number, y: number) {
    if (!restaurant) return;
    onRestaurantUpdate({ ...restaurant, cover_focal_x: x, cover_focal_y: y });
    if (focalSaveTimer.current) clearTimeout(focalSaveTimer.current);
    focalSaveTimer.current = setTimeout(async () => {
      try {
        const updated = await updateRestaurant(restaurantId, {
          name: restaurant.name,
          cover_focal_x: x,
          cover_focal_y: y,
        } as Partial<Restaurant>);
        onRestaurantUpdate(updated);
      } catch (err) {
        console.error('Failed to save focal point', err);
      }
    }, 400);
  }

  const DISPLAY_MODES = [
    { value: 'cover', label: 'Fill', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>) },
    { value: 'contain', label: 'Fit', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>) },
    { value: 'repeat', label: 'Repeat', icon: (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>) },
  ];

  const PRESET_COLORS = [
    '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
    '#2196F3', '#03A9F4', '#009688', '#4CAF50', '#8BC34A',
    '#FF9800', '#FF5722', '#795548', '#607D8B', '#212121',
  ];

  return (
    <div className="max-w-xl space-y-6">
      {/* Branding */}
      <div>
        <h2 className="text-lg font-semibold text-fg-primary mb-1">Branding</h2>
        <p className="text-xs text-fg-secondary mb-4">Customize your online menu appearance. Customers will see your logo and background image.</p>
        <div className="space-y-6">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-2">Logo</label>
            <div className="flex items-center gap-3">
              {restaurant?.logo_url ? (
                <img src={restaurant.logo_url} alt="Logo" className="w-20 h-20 rounded-full object-cover border-2 border-[var(--divider)]" />
              ) : (
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-[var(--divider)] flex items-center justify-center text-fg-secondary">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--divider)] text-xs font-medium cursor-pointer hover:bg-[var(--surface-hover)] transition ${uploadingLogo ? 'opacity-50 pointer-events-none' : 'text-fg-primary'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  {uploadingLogo ? 'Uploading...' : (restaurant?.logo_url ? 'Change' : 'Upload')}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {restaurant?.logo_url && (
                  <button onClick={handleRemoveLogo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-600 hover:bg-red-50 transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Background */}
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-2">Background</label>

            {/* Preview */}
            <div className="relative rounded-lg overflow-hidden border border-[var(--divider)] mb-3" style={{ height: 180 }}>
              {restaurant?.cover_url ? (
                coverMode === 'repeat' ? (
                  <div className="absolute inset-0" style={{ backgroundImage: `url(${restaurant.cover_url})`, backgroundRepeat: 'repeat', backgroundSize: 'auto 50%', backgroundPosition: 'left top' }} />
                ) : (
                  <img src={restaurant.cover_url} alt="Cover" className={`w-full h-full ${coverMode === 'contain' ? 'object-contain' : 'object-cover'}`} />
                )
              ) : restaurant?.background_color ? (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: restaurant.background_color }}>
                  <div className="text-center text-white/80">
                    <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" /></svg>
                    <span className="text-xs font-medium">{restaurant.background_color}</span>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-hover)]">
                  <div className="text-center text-fg-secondary">
                    <svg className="w-10 h-10 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-xs">No background set</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            {restaurant?.cover_url && (
              <p className="text-xs text-fg-secondary mb-2">Using uploaded image</p>
            )}
            {!restaurant?.cover_url && restaurant?.background_color && (
              <p className="text-xs text-fg-secondary mb-2">Using solid color</p>
            )}

            {/* Display Mode (only when cover image is set) */}
            {restaurant?.cover_url && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-fg-secondary mb-2">Display Mode</label>
                <div className="flex gap-2">
                  {DISPLAY_MODES.map(m => (
                    <button
                      key={m.value}
                      onClick={() => handleSetDisplayMode(m.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition ${
                        coverMode === m.value
                          ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                          : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/40'
                      }`}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Focal point picker — only meaningful for "cover" display mode */}
            {restaurant?.cover_url && coverMode === 'cover' && (
              <div className="mb-3">
                <CoverFocalPicker
                  src={restaurant.cover_url}
                  focalX={typeof restaurant.cover_focal_x === 'number' ? restaurant.cover_focal_x : 50}
                  focalY={typeof restaurant.cover_focal_y === 'number' ? restaurant.cover_focal_y : 50}
                  onChange={handleFocalChange}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium cursor-pointer hover:bg-brand-600 transition ${uploadingCover ? 'opacity-50 pointer-events-none' : ''}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                {uploadingCover ? 'Uploading...' : 'Upload Image'}
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
              </label>
              <button onClick={() => { setPickerColor(restaurant?.background_color || '#EB5204'); setShowColorPicker(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--divider)] text-xs font-medium text-fg-primary hover:bg-[var(--surface-hover)] transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" /></svg>
                Pick Color
              </button>
              {(restaurant?.cover_url || restaurant?.background_color) && (
                <button onClick={handleRemoveCover} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-600 hover:bg-red-50 transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Color Picker Modal */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowColorPicker(false)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-fg-primary mb-3">Pick Background Color</h3>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setPickerColor(c)}
                  className={`w-10 h-10 rounded-lg border-2 transition ${pickerColor === c ? 'border-brand-500 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input type="color" value={pickerColor} onChange={e => setPickerColor(e.target.value)} className="w-10 h-10 rounded border border-[var(--divider)] cursor-pointer" />
              <input type="text" value={pickerColor} onChange={e => setPickerColor(e.target.value)} className="flex-1 text-sm border border-[var(--divider)] rounded-lg px-3 py-2 bg-[var(--surface)] text-fg-primary font-mono" placeholder="#000000" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowColorPicker(false)} className="flex-1 px-3 py-2 rounded-lg border border-[var(--divider)] text-xs font-medium text-fg-secondary hover:bg-[var(--surface-hover)] transition">{t('cancel')}</button>
              <button onClick={() => { handleSetBackgroundColor(pickerColor); setShowColorPicker(false); }} className="flex-1 px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition">Apply</button>
            </div>
          </div>
        </div>
      )}

      <hr className="border-divider" />

      <div>
        <h2 className="text-lg font-semibold text-fg-primary mb-4">Global Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">Tagline</label>
            <input type="text" value={tagline} onChange={e => onTaglineChange(e.target.value)} className="w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary" placeholder="Fresh food, fast delivery" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">Restaurant name font</label>
            <p className="text-xs text-fg-secondary mb-2">Font used for the restaurant name overlay on the order-page hero.</p>
            <select
              value={heroNameFont}
              onChange={e => onHeroNameFontChange(e.target.value)}
              className="w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary"
              style={heroNameFont ? { fontFamily: `"${heroNameFont}", sans-serif` } : undefined}
            >
              <option value="">Default (theme font)</option>
              {FONT_OPTIONS.map(f => (
                <option key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>{f}</option>
              ))}
            </select>
            {heroNameFont && restaurant?.name && (
              <div className="mt-3 p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)]">
                <span className="text-xs text-fg-secondary block mb-1">Preview</span>
                <span className="text-2xl font-bold text-fg-primary" style={{ fontFamily: `"${heroNameFont}", serif` }}>
                  {restaurant.name}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">Category section style</label>
            <p className="text-xs text-fg-secondary mb-2">How the category dividers appear on the order page. Image banners fall back to a text heading when a category has no image.</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'image-overlay', label: 'Image banner', desc: 'Full-width image with category name overlay' },
                { value: 'text-block', label: 'Text only', desc: 'Large text heading with underline' },
                { value: 'striped-rule', label: 'Text with rules', desc: 'Centered text between two lines' },
                { value: 'none', label: 'No divider', desc: 'Items flow continuously' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onCategoryBannerStyleChange(opt.value)}
                  className={`text-left p-3 rounded-lg border-2 transition ${
                    categoryBannerStyle === opt.value
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-[var(--divider)] hover:border-fg-secondary/30'
                  }`}
                >
                  <div className="text-sm font-medium text-fg-primary">{opt.label}</div>
                  <div className="text-xs text-fg-secondary mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Theme Mode */}
      <div>
        <h3 className="text-sm font-semibold text-fg-secondary mb-3">Site Theme</h3>
        <div className="flex gap-3">
          <button
            onClick={() => onThemeModeChange('light')}
            className={`flex-1 p-4 rounded-xl border-2 text-center transition-all ${
              themeMode === 'light'
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-[var(--divider)] hover:border-fg-secondary/30'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white border border-gray-200 mx-auto mb-2 flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" />
                <path d="M18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-fg-primary">Light</span>
          </button>
          <button
            onClick={() => onThemeModeChange('dark')}
            className={`flex-1 p-4 rounded-xl border-2 text-center transition-all ${
              themeMode === 'dark'
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-[var(--divider)] hover:border-fg-secondary/30'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-gray-900 border border-gray-700 mx-auto mb-2 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-300" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-sm font-medium text-fg-primary">Dark</span>
          </button>
        </div>
      </div>

      {/* Navbar Style */}
      <div>
        <h3 className="text-sm font-semibold text-fg-secondary mb-3">Navigation Bar</h3>
        <div className="flex gap-2 mb-3">
          {[
            { value: 'solid', label: 'Solid' },
            { value: 'transparent', label: 'Transparent' },
            { value: 'custom', label: 'Custom' },
            { value: 'hidden', label: 'Hidden' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => onNavbarStyleChange(opt.value)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                navbarStyle === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {navbarStyle === 'custom' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-secondary w-20">Color</label>
            <input type="color" value={navbarColor || '#1f2937'} onChange={e => onNavbarColorChange(e.target.value)} className="w-7 h-7 rounded border border-[var(--divider)] cursor-pointer" />
            <input type="text" value={navbarColor || '#1f2937'} onChange={e => onNavbarColorChange(e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
          </div>
        )}
        {/* Logo size */}
        <div className="mt-3">
          <label className="text-xs text-fg-secondary block mb-1">Logo Size ({logoSize}px)</label>
          <input
            type="range"
            min={20}
            max={120}
            step={4}
            value={logoSize}
            onChange={e => onLogoSizeChange(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
            <span>20px</span>
            <span>120px</span>
          </div>
        </div>
        {/* Hide restaurant name */}
        <label className="flex items-center justify-between py-2 mt-1">
          <span className="text-sm text-fg-primary">Hide Restaurant Name</span>
          <button type="button" onClick={() => onHideNavbarNameChange(!hideNavbarName)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideNavbarName ? 'bg-brand-500' : 'bg-[var(--divider)]'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hideNavbarName ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </label>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg-secondary mb-3">Visibility</h3>
        {[
          { label: 'Show Address', value: showAddress, setter: onShowAddressChange },
          { label: 'Show Phone', value: showPhone, setter: onShowPhoneChange },
          { label: 'Show Hours', value: showHours, setter: onShowHoursChange },
        ].map(t => (
          <label key={t.label} className="flex items-center justify-between py-2">
            <span className="text-sm text-fg-primary">{t.label}</span>
            <button type="button" onClick={() => t.setter(!t.value)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${t.value ? 'bg-brand-500' : 'bg-[var(--divider)]'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${t.value ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        ))}
      </div>

      {/* Reset to Default */}
      <div className="mt-6 pt-4 border-t border-divider">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all site settings to default? This cannot be undone.')) {
              onReset();
            }
          }}
          className="w-full px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
        >
          Reset to Default
        </button>
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

// ─── About Blocks Editor ──────────────────────────────────────────────
function AboutBlocksEditor({ content, updateContent }: {
  content: Record<string, any>;
  updateContent: (key: string, value: any) => void;
}) {
  // Backward compat: migrate legacy {title, body} to blocks
  const blocks: Record<string, any>[] =
    Array.isArray(content.blocks) && content.blocks.length > 0
      ? content.blocks
      : [{ title: content.title || '', body: content.body || '' }];

  function setBlocks(newBlocks: Record<string, any>[]) {
    updateContent('blocks', newBlocks);
  }

  function updateBlock(index: number, key: string, value: string) {
    const updated = blocks.map((b, i) => i === index ? { ...b, [key]: value } : b);
    setBlocks(updated);
  }

  function addBlock() {
    setBlocks([...blocks, { title: '', body: '' }]);
  }

  function removeBlock(index: number) {
    if (blocks.length <= 1) return;
    setBlocks(blocks.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <div key={idx} className="border border-[var(--divider)] rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg-secondary">Block {idx + 1}</span>
            {blocks.length > 1 && (
              <button type="button" onClick={() => removeBlock(idx)} className="text-xs text-red-500 hover:text-red-700 transition">Remove</button>
            )}
          </div>
          <TextFieldWithTypography
            label="Title"
            value={block.title || ''}
            onChange={v => updateBlock(idx, 'title', v)}
            placeholder="Section title"
            fieldPrefix="title"
            settings={block}
            onSettingChange={(key, val) => updateBlock(idx, key, val)}
          />
          <TextFieldWithTypography
            label="Text"
            value={block.body || ''}
            onChange={v => updateBlock(idx, 'body', v)}
            placeholder="Section text"
            fieldPrefix="text"
            settings={block}
            onSettingChange={(key, val) => updateBlock(idx, key, val)}
            multiline
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addBlock}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--divider)] text-sm font-medium text-fg-secondary hover:border-brand-500 hover:text-brand-500 transition-all"
      >
        + Add Block
      </button>
    </div>
  );
}

// ─── Picnic Basket Editor ─────────────────────────────────────────────
function TextFieldWithTypography({ label, value, onChange, placeholder, fieldPrefix, settings, onSettingChange, multiline }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fieldPrefix: string;
  settings: Record<string, any>;
  onSettingChange: (key: string, value: string) => void;
  multiline?: boolean;
}) {
  const inputClass = "w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary";
  const labelClass = "text-xs text-fg-secondary mb-1 block";
  const smallSelectClass = "text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary";
  const colorKey = `${fieldPrefix}_color`;
  const fontKey = `${fieldPrefix}_font`;
  const sizeKey = `${fieldPrefix}_size`;
  const weightKey = `${fieldPrefix}_weight`;

  const sizes = fieldPrefix.includes('subtitle') || fieldPrefix.includes('completion')
    ? ['sm', 'md', 'lg']
    : ['sm', 'md', 'lg', 'xl'];

  return (
    <div className="border border-[var(--divider)] rounded-lg p-3 space-y-2">
      <div>
        <label className={labelClass}>{label}</label>
        {multiline ? (
          <textarea value={value} onChange={e => onChange(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder={placeholder} />
        ) : (
          <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputClass} placeholder={placeholder} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelClass}>Color</label>
          <div className="flex items-center gap-1">
            <input type="color" value={settings[colorKey] || '#000000'} onChange={e => onSettingChange(colorKey, e.target.value)} className="w-6 h-6 rounded border border-[var(--divider)] cursor-pointer" />
            <input type="text" value={settings[colorKey] || ''} onChange={e => onSettingChange(colorKey, e.target.value)} className={`${smallSelectClass} flex-1 w-0`} placeholder="inherit" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Font</label>
          <select value={settings[fontKey] || ''} onChange={e => onSettingChange(fontKey, e.target.value)} className={`${smallSelectClass} w-full`}>
            <option value="">Default</option>
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Size</label>
          <div className="flex gap-0.5">
            {sizes.map(s => (
              <button key={s} type="button" onClick={() => onSettingChange(sizeKey, s)} className={`flex-1 px-1 py-0.5 rounded text-[10px] font-medium border transition-all ${(settings[sizeKey] || 'md') === s ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary'}`}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className={labelClass}>Weight</label>
        <div className="flex gap-1">
          {[{ value: 'normal', label: 'Regular' }, { value: 'medium', label: 'Medium' }, { value: 'bold', label: 'Bold' }].map(opt => (
            <button key={opt.value} type="button" onClick={() => onSettingChange(weightKey, opt.value)} className={`flex-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${(settings[weightKey] || (fieldPrefix === 'title' ? 'bold' : 'normal')) === opt.value ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PicnicBasketEditor({ content, settings, updateContent, updateSettings, restaurantId }: {
  content: Record<string, any>;
  settings: Record<string, any>;
  updateContent: (key: string, value: any) => void;
  updateSettings: (key: string, value: any) => void;
  restaurantId: number;
}) {
  return (
    <div className="space-y-3">
      <TextFieldWithTypography
        label="Title"
        value={content.title || ''}
        onChange={v => updateContent('title', v)}
        placeholder="Preparing Your Basket"
        fieldPrefix="title"
        settings={settings}
        onSettingChange={updateSettings}
      />
      <TextFieldWithTypography
        label="Subtitle"
        value={content.subtitle || ''}
        onChange={v => updateContent('subtitle', v)}
        placeholder="Scroll to fill your Shabbat basket"
        fieldPrefix="subtitle"
        settings={settings}
        onSettingChange={updateSettings}
      />
      <TextFieldWithTypography
        label="Completion Text"
        value={content.completion_text || ''}
        onChange={v => updateContent('completion_text', v)}
        placeholder="Ready for Shabbat! 🕯️"
        fieldPrefix="completion"
        settings={settings}
        onSettingChange={updateSettings}
      />
      <div>
        <label className="text-xs text-fg-secondary mb-1 block">Basket Link</label>
        <input type="text" value={content.basket_link || ''} onChange={e => updateContent('basket_link', e.target.value)} className="w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary" placeholder="/order (default)" />
        <p className="text-xs text-fg-secondary mt-1">Where the basket links to when clicked. Default: /order</p>
      </div>
      <SectionImageUploader
        restaurantId={restaurantId}
        currentUrl={content.basket_image || ''}
        onUploaded={(url) => updateContent('basket_image', url)}
        onRemove={() => updateContent('basket_image', '')}
        label="Basket Image (optional — uses default illustration if empty)"
      />
      {/* Basket Layout Controls */}
      <div className="border-t border-[var(--divider)] pt-3 mt-3">
        <p className="text-xs font-medium text-fg-primary mb-2">Basket Layout</p>
        {/* Scale */}
        <div>
          <label className="text-xs text-fg-secondary block mb-1">Basket Size ({content.basket_scale ?? 100}%)</label>
          <input type="range" min={50} max={250} step={5} value={content.basket_scale ?? 100} onChange={e => updateContent('basket_scale', Number(e.target.value))} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
            <span>50%</span><span>250%</span>
          </div>
        </div>
        {/* Vertical Position */}
        <div className="mt-2">
          <label className="text-xs text-fg-secondary block mb-1">Vertical Position ({content.basket_offset_y ?? 0}px)</label>
          <input type="range" min={-200} max={200} step={5} value={content.basket_offset_y ?? 0} onChange={e => updateContent('basket_offset_y', Number(e.target.value))} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
            <span>Up (-200)</span><span>Down (+200)</span>
          </div>
        </div>
        {/* Horizontal Position */}
        <div className="mt-2">
          <label className="text-xs text-fg-secondary block mb-1">Horizontal Position ({content.basket_offset_x ?? 0}px)</label>
          <input type="range" min={-150} max={150} step={5} value={content.basket_offset_x ?? 0} onChange={e => updateContent('basket_offset_x', Number(e.target.value))} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
            <span>Left (-150)</span><span>Right (+150)</span>
          </div>
        </div>
        {/* Item Landing Distance */}
        <div className="mt-2">
          <label className="text-xs text-fg-secondary block mb-1">Item Landing Distance ({content.item_gap ?? 70}px)</label>
          <input type="range" min={0} max={200} step={5} value={content.item_gap ?? 70} onChange={e => updateContent('item_gap', Number(e.target.value))} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[10px] text-fg-secondary mt-0.5">
            <span>0px (top)</span><span>200px (deep)</span>
          </div>
        </div>
        {/* Reset */}
        <button type="button" onClick={() => { updateContent('basket_scale', 100); updateContent('basket_offset_y', 0); updateContent('basket_offset_x', 0); updateContent('item_gap', 70); }} className="mt-2 text-xs text-brand-500 hover:underline">
          Reset to defaults
        </button>
      </div>

      <SectionMultiImageUploader
        restaurantId={restaurantId}
        images={(content.items || []).filter((img: any) => img.url)}
        onUpdate={(items) => updateContent('items', items)}
        label="Food Item Images"
        hint="Add 4-8 dish images for the best effect. They will float down into the basket as visitors scroll. Uses emoji placeholders if empty."
      />
    </div>
  );
}

// ─── Menu Highlights Editor ──────────────────────────────────────────
function MenuHighlightsEditor({ content, settings, updateContent, updateSettings, restaurantId }: {
  content: Record<string, any>;
  settings: Record<string, any>;
  updateContent: (key: string, value: any) => void;
  updateSettings: (key: string, value: any) => void;
  restaurantId: number;
}) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [search, setSearch] = useState('');
  const selectedIds: number[] = content.item_ids || [];

  useEffect(() => {
    getAllCategories(restaurantId)
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
      .finally(() => setLoadingMenu(false));
  }, [restaurantId]);

  const allItems = categories.flatMap(cat =>
    (cat.items || []).map(item => ({ ...item, categoryName: cat.name }))
  );

  const selectedItems = selectedIds
    .map(id => allItems.find(i => i.id === id))
    .filter(Boolean) as (MenuItem & { categoryName: string })[];

  const filtered = search.trim()
    ? allItems.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.categoryName.toLowerCase().includes(search.toLowerCase())
      )
    : allItems;

  function toggleItem(id: number) {
    const ids = [...selectedIds];
    const idx = ids.indexOf(id);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(id);
    }
    updateContent('item_ids', ids);
  }

  function removeItem(id: number) {
    updateContent('item_ids', selectedIds.filter(i => i !== id));
  }

  function moveItem(index: number, dir: -1 | 1) {
    const ids = [...selectedIds];
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    updateContent('item_ids', ids);
  }

  const inputClass = "w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary";

  return (
    <div className="space-y-3">
      <TextFieldWithTypography
        label="Title"
        value={content.title || ''}
        onChange={v => updateContent('title', v)}
        placeholder="Chef's Picks"
        fieldPrefix="title"
        settings={settings}
        onSettingChange={updateSettings}
      />
      <TextFieldWithTypography
        label="Subtitle"
        value={content.subtitle || ''}
        onChange={v => updateContent('subtitle', v)}
        placeholder="Our most popular dishes"
        fieldPrefix="subtitle"
        settings={settings}
        onSettingChange={updateSettings}
      />

      {/* Selected items */}
      {selectedItems.length > 0 && (
        <div>
          <label className="text-xs text-fg-secondary mb-1 block">Selected Items ({selectedItems.length})</label>
          <div className="space-y-1">
            {selectedItems.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 bg-[var(--surface-subtle)] rounded-lg px-2 py-1.5 text-sm">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-[var(--divider)] flex items-center justify-center text-xs flex-shrink-0">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-fg-primary truncate">{item.name}</p>
                  <p className="text-[10px] text-fg-secondary">{item.categoryName} · ₪{item.price}</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="w-5 h-5 flex items-center justify-center rounded text-fg-secondary hover:bg-[var(--divider)] disabled:opacity-30" title="Move up">↑</button>
                  <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === selectedItems.length - 1} className="w-5 h-5 flex items-center justify-center rounded text-fg-secondary hover:bg-[var(--divider)] disabled:opacity-30" title="Move down">↓</button>
                  <button type="button" onClick={() => removeItem(item.id)} className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10" title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item picker */}
      <div>
        <label className="text-xs text-fg-secondary mb-1 block">Add Items</label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={inputClass}
          placeholder="Search menu items..."
        />
        {loadingMenu ? (
          <p className="text-xs text-fg-secondary mt-2">Loading menu...</p>
        ) : (
          <div className="mt-2 max-h-48 overflow-y-auto border border-[var(--divider)] rounded-lg">
            {filtered.length === 0 ? (
              <p className="text-xs text-fg-secondary p-3 text-center">No items found</p>
            ) : (
              filtered.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--surface-subtle)] transition ${isSelected ? 'bg-brand-500/10' : ''}`}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[var(--divider)] flex items-center justify-center text-[10px] flex-shrink-0">🍽️</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-fg-primary truncate">{item.name}</p>
                      <p className="text-[10px] text-fg-secondary">{item.categoryName} · ₪{item.price}</p>
                    </div>
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'border-[var(--divider)]'}`}>
                      {isSelected && <span className="text-[10px]">✓</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Image Uploader ──────────────────────────────────────────
function SectionImageUploader({ restaurantId, currentUrl, onUploaded, onRemove, label, className }: {
  restaurantId: number;
  currentUrl?: string;
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  label?: string;
  className?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSectionImage(restaurantId, file);
      onUploaded(url);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={className}>
      {label && <label className="text-xs text-fg-secondary mb-1 block">{label}</label>}
      {currentUrl ? (
        <div className="relative group">
          <img src={currentUrl} alt="" className="rounded-lg max-h-32 object-cover w-full" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="px-2 py-1 bg-white rounded text-xs font-medium" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Replace'}
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium">Remove</button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full py-6 border-2 border-dashed border-[var(--divider)] rounded-lg text-xs text-fg-secondary hover:border-[var(--brand)] hover:text-[var(--brand)] transition-all flex flex-col items-center gap-1"
        >
          {uploading ? (
            <span>Uploading...</span>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Click to upload image</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  );
}

// ─── Multi-Image Uploader (for gallery, picnic basket items) ──────────
function SectionMultiImageUploader({ restaurantId, images, onUpdate, label, hint }: {
  restaurantId: number;
  images: { url: string; alt?: string }[];
  onUpdate: (images: { url: string; alt?: string }[]) => void;
  label?: string;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newImages = [...images];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadSectionImage(restaurantId, files[i]);
        newImages.push({ url, alt: '' });
      }
      onUpdate(newImages);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeImage(index: number) {
    onUpdate(images.filter((_, i) => i !== index));
  }

  function moveImage(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= images.length) return;
    const updated = [...images];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onUpdate(updated);
  }

  return (
    <div>
      {label && <label className="text-xs text-fg-secondary mb-1 block">{label}</label>}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-[var(--divider)]">
              <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {i > 0 && (
                  <button type="button" onClick={() => moveImage(i, 'up')} className="p-1 bg-white rounded text-xs">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <button type="button" onClick={() => removeImage(i)} className="p-1 bg-red-500 text-white rounded text-xs">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                {i < images.length - 1 && (
                  <button type="button" onClick={() => moveImage(i, 'down')} className="p-1 bg-white rounded text-xs">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full py-3 border-2 border-dashed border-[var(--divider)] rounded-lg text-xs text-fg-secondary hover:border-[var(--brand)] hover:text-[var(--brand)] transition-all"
      >
        {uploading ? 'Uploading...' : '+ Add Images'}
      </button>
      {hint && <p className="text-xs text-fg-secondary mt-1">{hint}</p>}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
    </div>
  );
}

function SectionSettingsPanel({ section, restaurantId, onUpdate, onDelete }: {
  section: WebsiteSection;
  restaurantId: number;
  onUpdate: (updates: Partial<WebsiteSection>) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const meta = SECTION_TYPE_META[section.section_type];
  const content = section.content || {};
  const settings = section.settings || {};

  function updateContent(key: string, value: any) {
    onUpdate({ content: { ...content, [key]: value } as any });
  }

  function updateSettings(key: string, value: any) {
    onUpdate({ settings: { ...settings, [key]: value } as any });
  }

  const layouts = LAYOUT_OPTIONS[section.section_type];

  const inputClass = "w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary";
  const labelClass = "text-xs text-fg-secondary mb-1 block";

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta?.icon || '\u{1F4C4}'}</span>
          <h2 className="text-lg font-semibold text-fg-primary">{meta ? t(meta.labelKey) : section.section_type}</h2>
        </div>
        <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
      </div>

      {/* Layout variants */}
      {layouts && layouts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-fg-secondary mb-2">Layout</h3>
          <div className="flex gap-2">
            {layouts.map(l => (
              <button
                key={l.value}
                onClick={() => onUpdate({ layout: l.value })}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  section.layout === l.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
                }`}
              >
                {t(l.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color Style */}
      <div>
        <h3 className="text-sm font-semibold text-fg-secondary mb-2">Color Style</h3>
        <div className="flex gap-2">
          {COLOR_STYLES.map(cs => (
            <button
              key={cs.value}
              onClick={() => updateSettings('color_style', cs.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                settings.color_style === cs.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
              }`}
            >
              {t(cs.labelKey)}
            </button>
          ))}
        </div>
        {settings.color_style === 'custom' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-fg-secondary w-20">Background</label>
              <input type="color" value={settings.custom_bg || '#ffffff'} onChange={e => updateSettings('custom_bg', e.target.value)} className="w-7 h-7 rounded border border-[var(--divider)] cursor-pointer" />
              <input type="text" value={settings.custom_bg || '#ffffff'} onChange={e => updateSettings('custom_bg', e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-fg-secondary w-20">Text</label>
              <input type="color" value={settings.custom_text || '#000000'} onChange={e => updateSettings('custom_text', e.target.value)} className="w-7 h-7 rounded border border-[var(--divider)] cursor-pointer" />
              <input type="text" value={settings.custom_text || '#000000'} onChange={e => updateSettings('custom_text', e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
            </div>
          </div>
        )}

        {/* Background Image */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-fg-secondary font-medium">Background Image</label>
            {settings.bg_image && (
              <button type="button" onClick={() => { updateSettings('bg_image', ''); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
          </div>
          <SectionImageUploader
            restaurantId={restaurantId}
            currentUrl={settings.bg_image || ''}
            onUploaded={(url) => updateSettings('bg_image', url)}
            onRemove={() => updateSettings('bg_image', '')}
          />
          {settings.bg_image && (
            <div className="space-y-3 pt-1">
              {/* Overlay toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-fg-secondary">Overlay</label>
                <button
                  type="button"
                  onClick={() => updateSettings('bg_overlay', !settings.bg_overlay)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${settings.bg_overlay ? 'bg-[var(--brand)]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.bg_overlay ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              {settings.bg_overlay && (
                <>
                  {/* Overlay color */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-fg-secondary w-20">Overlay Color</label>
                    <input type="color" value={settings.bg_overlay_color || '#000000'} onChange={e => updateSettings('bg_overlay_color', e.target.value)} className="w-7 h-7 rounded border border-[var(--divider)] cursor-pointer" />
                    <input type="text" value={settings.bg_overlay_color || '#000000'} onChange={e => updateSettings('bg_overlay_color', e.target.value)} className="flex-1 text-xs border border-[var(--divider)] rounded px-2 py-1 bg-[var(--surface)] text-fg-primary" />
                  </div>
                  {/* Overlay opacity */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-fg-secondary">Overlay Opacity</label>
                      <span className="text-xs text-fg-secondary">{settings.bg_overlay_opacity ?? 50}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={settings.bg_overlay_opacity ?? 50}
                      onChange={e => updateSettings('bg_overlay_opacity', Number(e.target.value))}
                      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-[var(--brand)]"
                    />
                  </div>
                </>
              )}
              {/* Background size */}
              <div>
                <label className="text-xs text-fg-secondary mb-1 block">Image Fit</label>
                <div className="flex gap-1.5">
                  {[
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'repeat', label: 'Repeat' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateSettings('bg_size', opt.value)}
                      className={`flex-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${(settings.bg_size || 'cover') === opt.value ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Background position */}
              <div>
                <label className="text-xs text-fg-secondary mb-1 block">Image Position</label>
                <div className="grid grid-cols-3 gap-1">
                  {['top', 'center', 'bottom'].map(pos => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => updateSettings('bg_position', pos)}
                      className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all capitalize ${(settings.bg_position || 'center') === pos ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary'}`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Typography */}
      {['hero_banner', 'text_and_image', 'about', 'promo_banner', 'scrolling_text', 'footer'].includes(section.section_type) && (
        <div>
          <h3 className="text-sm font-semibold text-fg-secondary mb-2">Typography</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-fg-secondary mb-1.5 block">Heading Size</label>
              <div className="flex gap-1.5">
                {[
                  { value: 'sm', label: 'S' },
                  { value: 'md', label: 'M' },
                  { value: 'lg', label: 'L' },
                  { value: 'xl', label: 'XL' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings('heading_size', opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      (settings.heading_size || 'md') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-fg-secondary mb-1.5 block">Body Size</label>
              <div className="flex gap-1.5">
                {[
                  { value: 'sm', label: 'S' },
                  { value: 'md', label: 'M' },
                  { value: 'lg', label: 'L' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings('body_size', opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      (settings.body_size || 'md') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-fg-secondary mb-1.5 block">Font Weight</label>
              <div className="flex gap-1.5">
                {[
                  { value: 'normal', label: 'Regular' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'bold', label: 'Bold' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings('font_weight', opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      (settings.font_weight || 'normal') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content fields */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-fg-secondary">Content</h3>

        {/* About — multi-block editor */}
        {section.section_type === 'about' && (
          <AboutBlocksEditor content={content} updateContent={updateContent} />
        )}

        {/* Hero Banner — per-field typography */}
        {section.section_type === 'hero_banner' && (
          <>
            <TextFieldWithTypography
              label="Headline"
              value={content.headline || ''}
              onChange={v => updateContent('headline', v)}
              placeholder="Your headline here"
              fieldPrefix="headline"
              settings={settings}
              onSettingChange={updateSettings}
            />
            <TextFieldWithTypography
              label="Subheadline"
              value={content.subheadline || ''}
              onChange={v => updateContent('subheadline', v)}
              placeholder="Description text..."
              fieldPrefix="subheadline"
              settings={settings}
              onSettingChange={updateSettings}
              multiline
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>CTA Text</label>
                <input type="text" value={content.cta_text || ''} onChange={e => updateContent('cta_text', e.target.value)} className={inputClass} placeholder="Order Now" />
              </div>
              <div>
                <label className={labelClass}>CTA Link</label>
                <input type="text" value={content.cta_link || ''} onChange={e => updateContent('cta_link', e.target.value)} className={inputClass} placeholder="#menu" />
              </div>
            </div>
          </>
        )}

        {/* Text & Image — per-field typography */}
        {section.section_type === 'text_and_image' && (
          <>
            <TextFieldWithTypography
              label="Title"
              value={content.title || ''}
              onChange={v => updateContent('title', v)}
              placeholder="Our Story"
              fieldPrefix="title"
              settings={settings}
              onSettingChange={updateSettings}
            />
            <TextFieldWithTypography
              label="Body"
              value={content.body || ''}
              onChange={v => updateContent('body', v)}
              placeholder="Tell your customers about your restaurant..."
              fieldPrefix="body"
              settings={settings}
              onSettingChange={updateSettings}
              multiline
            />
          </>
        )}

        {/* Promo Banner — per-field typography */}
        {section.section_type === 'promo_banner' && (
          <>
            <TextFieldWithTypography
              label="Title"
              value={content.title || ''}
              onChange={v => updateContent('title', v)}
              placeholder="Special Offer"
              fieldPrefix="title"
              settings={settings}
              onSettingChange={updateSettings}
            />
            <TextFieldWithTypography
              label="Body"
              value={content.body || ''}
              onChange={v => updateContent('body', v)}
              placeholder="Check out our latest deals!"
              fieldPrefix="body"
              settings={settings}
              onSettingChange={updateSettings}
              multiline
            />
          </>
        )}

        {section.section_type === 'scrolling_text' && (
          <div>
            <label className={labelClass}>Text (use | to separate phrases)</label>
            <input type="text" value={content.text || ''} onChange={e => updateContent('text', e.target.value)} className={inputClass} placeholder="Fresh daily | Family recipes | Handmade pasta" />
          </div>
        )}

        {section.section_type === 'testimonials' && (
          <div>
            <label className={labelClass}>Reviews (one per line: Name | Text | Rating)</label>
            <textarea
              value={(content.reviews || []).map((r: any) => `${r.name} | ${r.text} | ${r.rating}`).join('\n')}
              onChange={e => {
                const reviews = e.target.value.split('\n').filter(Boolean).map(line => {
                  const [name = '', text = '', rating = '5'] = line.split('|').map(s => s.trim());
                  return { name, text, rating: parseInt(rating) || 5 };
                });
                updateContent('reviews', reviews);
              }}
              className={`${inputClass} min-h-[100px] font-mono`}
              placeholder="John D. | Amazing food! | 5&#10;Sarah M. | Best hummus in town | 5"
            />
          </div>
        )}

        {section.section_type === 'gallery' && (
          <SectionMultiImageUploader
            restaurantId={restaurantId}
            images={(content.images || []).filter((img: any) => img.url)}
            onUpdate={(images) => updateContent('images', images)}
            label="Gallery Images"
            hint="Upload photos to showcase your restaurant."
          />
        )}

        {section.section_type === 'social_feed' && (
          <div className="space-y-2">
            {['instagram', 'facebook', 'tiktok'].map(platform => (
              <div key={platform}>
                <label className={`${labelClass} capitalize`}>{platform}</label>
                <input
                  type="url"
                  value={(content.links || []).find((l: any) => l.platform === platform)?.url || ''}
                  onChange={e => {
                    const links = [...(content.links || [])];
                    const idx = links.findIndex((l: any) => l.platform === platform);
                    if (idx >= 0) {
                      links[idx] = { platform, url: e.target.value };
                    } else if (e.target.value) {
                      links.push({ platform, url: e.target.value });
                    }
                    updateContent('links', links.filter((l: any) => l.url));
                  }}
                  className={inputClass}
                  placeholder={`https://${platform}.com/yourrestaurant`}
                />
              </div>
            ))}
          </div>
        )}

        {section.section_type === 'menu_highlights' && (
          <MenuHighlightsEditor content={content} settings={settings} updateContent={updateContent} updateSettings={updateSettings} restaurantId={restaurantId} />
        )}

        {/* Picnic Basket Editor */}
        {section.section_type === 'picnic_basket' && (
          <PicnicBasketEditor content={content} settings={settings} updateContent={updateContent} updateSettings={updateSettings} restaurantId={restaurantId} />
        )}

        {/* Action Buttons Editor */}
        {section.section_type === 'action_buttons' && (
          <ActionButtonsEditor content={content} updateContent={updateContent} />
        )}

        {/* Footer Editor */}
        {section.section_type === 'footer' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { key: 'show_logo', label: 'Show Logo & Name' },
                { key: 'show_description', label: 'Show Description' },
                { key: 'show_address', label: 'Show Address' },
                { key: 'show_phone', label: 'Show Phone' },
                { key: 'show_hours', label: 'Show Hours' },
              ].map(t => (
                <label key={t.key} className="flex items-center justify-between py-1">
                  <span className="text-xs text-fg-primary">{t.label}</span>
                  <button type="button" onClick={() => updateContent(t.key, !content[t.key])} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${content[t.key] !== false ? 'bg-brand-500' : 'bg-[var(--divider)]'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${content[t.key] !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
            </div>
            <div>
              <label className={labelClass}>Copyright Text</label>
              <input type="text" value={content.custom_text || ''} onChange={e => updateContent('custom_text', e.target.value)} className={inputClass} placeholder="© 2026 Restaurant. Powered by Foody." />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Social Links</label>
              {['instagram', 'facebook', 'tiktok', 'whatsapp'].map(platform => (
                <div key={platform}>
                  <label className={`${labelClass} capitalize`}>{platform}</label>
                  <input
                    type="url"
                    value={(content.social_links || []).find((l: any) => l.platform === platform)?.url || ''}
                    onChange={e => {
                      const links = [...(content.social_links || [])];
                      const idx = links.findIndex((l: any) => l.platform === platform);
                      if (idx >= 0) {
                        links[idx] = { platform, url: e.target.value };
                      } else if (e.target.value) {
                        links.push({ platform, url: e.target.value });
                      }
                      updateContent('social_links', links.filter((l: any) => l.url));
                    }}
                    className={inputClass}
                    placeholder={`https://${platform}.com/yourrestaurant`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image upload for sections that support it */}
        {['hero_banner', 'text_and_image', 'promo_banner'].includes(section.section_type) && (
          <SectionImageUploader
            restaurantId={restaurantId}
            currentUrl={content.image_url || ''}
            onUploaded={(url) => {
              // Reset focal to center on new upload — same rule as Restaurant cover.
              onUpdate({ content: { ...content, image_url: url, image_focal_x: 50, image_focal_y: 50 } as any });
            }}
            onRemove={() => updateContent('image_url', '')}
            label="Image"
          />
        )}

        {/* Focal-point picker — Hero Banner only, when an image is set. Both
            axes saved in one onUpdate call so the debounced save can't drop
            one of them. */}
        {section.section_type === 'hero_banner' && content.image_url && (
          <div>
            <CoverFocalPicker
              src={content.image_url}
              focalX={typeof content.image_focal_x === 'number' ? content.image_focal_x : 50}
              focalY={typeof content.image_focal_y === 'number' ? content.image_focal_y : 50}
              onChange={(x, y) => {
                onUpdate({ content: { ...content, image_focal_x: x, image_focal_y: y } as any });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButtonsEditor({ content, updateContent }: {
  content: Record<string, any>;
  updateContent: (key: string, value: any) => void;
}) {
  const { t } = useI18n();
  const buttons: any[] = content.buttons || [];

  function updateButton(idx: number, field: string, value: string) {
    const updated = buttons.map((b, i) => i === idx ? { ...b, [field]: value } : b);
    updateContent('buttons', updated);
  }

  function addButton() {
    updateContent('buttons', [...buttons, { label: 'Button', action: 'view_menu', style: 'primary' }]);
  }

  function removeButton(idx: number) {
    updateContent('buttons', buttons.filter((_, i) => i !== idx));
  }

  const inputClass = "w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary";
  const labelClass = "text-xs text-fg-secondary mb-1 block";

  return (
    <div className="space-y-4">
      {buttons.map((btn, idx) => (
        <div key={idx} className="p-4 rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg-primary">Button {idx + 1}</span>
            <button onClick={() => removeButton(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
          <div>
            <label className={labelClass}>Label</label>
            <input type="text" value={btn.label || ''} onChange={e => updateButton(idx, 'label', e.target.value)} className={inputClass} placeholder="Order Now" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Action</label>
              <select value={btn.action || 'view_menu'} onChange={e => updateButton(idx, 'action', e.target.value)} className={inputClass}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{t(a.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Style</label>
              <select value={btn.style || 'primary'} onChange={e => updateButton(idx, 'style', e.target.value)} className={inputClass}>
                {BUTTON_STYLES.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
              </select>
            </div>
          </div>
          {(btn.action === 'external_link' || btn.action === 'scroll_to_section') && (
            <div>
              <label className={labelClass}>{btn.action === 'external_link' ? 'URL' : 'Section ID'}</label>
              <input type="text" value={btn.target || ''} onChange={e => updateButton(idx, 'target', e.target.value)} className={inputClass} placeholder={btn.action === 'external_link' ? 'https://...' : 'section-id'} />
            </div>
          )}
        </div>
      ))}
      <button
        onClick={addButton}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--divider)] text-sm font-medium text-fg-secondary hover:border-brand-500 hover:text-brand-500 transition-all"
      >
        + Add Button
      </button>
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
          {Object.entries(SECTION_TYPE_META).map(([type, meta]) => (
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

// ─── Helpers ────────────────────────────────────────────────────────

function getDefaultContent(sectionType: string): Record<string, any> {
  switch (sectionType) {
    case 'hero_banner': return { headline: 'Welcome', subheadline: 'Fresh food, made with love', cta_text: 'Order Now', cta_link: '#menu' };
    case 'scrolling_text': return { text: 'Fresh ingredients daily | Family recipes | Handmade with love' };
    case 'text_and_image': return { title: 'Our Story', body: 'Tell your customers about your restaurant...', image_position: 'right' };
    case 'gallery': return { images: [] };
    case 'testimonials': return { reviews: [] };
    case 'about': return { blocks: [{ title: 'About Us', body: 'Tell your customers about your restaurant, your story, and what makes your food special.' }] };
    case 'menu_highlights': return { title: "Chef's Picks", subtitle: 'Our most popular dishes', item_ids: [] };
    case 'promo_banner': return { title: 'Special Offer', body: 'Check out our latest deals!' };
    case 'social_feed': return { links: [] };
    case 'action_buttons': return { buttons: [{ label: 'Order Now', action: 'view_menu', style: 'primary' }] };
    case 'picnic_basket': return { title: 'Preparing Your Basket', subtitle: 'Scroll to fill your Shabbat basket with love', items: [], basket_image: '', completion_text: 'Ready for Shabbat! \u{1F56F}\u{FE0F}' };
    case 'footer': return { show_logo: true, show_description: true, show_address: true, show_phone: true, show_hours: true, custom_text: '', social_links: [] };
    default: return {};
  }
}
