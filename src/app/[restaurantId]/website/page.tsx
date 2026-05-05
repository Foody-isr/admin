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
  WebsiteConfig, WebsiteSection, SiteStylePreset, Restaurant, MenuCategory, MenuItem,
  ThemeCatalog,
} from '@/lib/api';
import { ThemesPanel } from '@/components/website-menu/ThemesPanel';
import { TypographyPanel } from '@/components/website-menu/TypographyPanel';
import { BrandingPanel } from '@/components/website-menu/BrandingPanel';
import { CoverFocalPicker } from '@/components/website/CoverFocalPicker';

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
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      // Mirror to local form state for branding fields the parent also tracks.
      if (patch.logo_size !== undefined) setLogoSize(patch.logo_size);
      if (patch.hide_navbar_name !== undefined) setHideNavbarName(patch.hide_navbar_name);
      postMenuPreview(next);
      return next;
    });
    if (menuSaveTimerRef.current) clearTimeout(menuSaveTimerRef.current);
    menuSaveTimerRef.current = setTimeout(async () => {
      try {
        const updated = await updateWebsiteConfig(restaurantId, patch);
        setConfig(updated);
      } catch (e) {
        setError((e as Error).message || 'Save failed');
      }
    }, 500);
  }, [restaurantId, postMenuPreview]);

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

  useEffect(() => {
    async function load() {
      try {
        const [cfg, rest, sects, styles] = await Promise.all([
          getWebsiteConfig(restaurantId),
          getRestaurant(restaurantId),
          listWebsiteSections(restaurantId),
          listSiteStyles(),
        ]);
        setConfig(cfg);
        setRestaurant(rest);
        setSiteStyles(styles);

        // Auto-create default sections if restaurant has none
        if (sects.length === 0) {
          const defaults = [
            { section_type: 'hero_banner', page: 'home', is_visible: true, layout: 'centered', sort_order: 0, content: getDefaultContent('hero_banner'), settings: { color_style: 'brand', text_alignment: 'center', padding: 'normal' } },
            { section_type: 'action_buttons', page: 'home', is_visible: true, layout: 'default', sort_order: 1, content: getDefaultContent('action_buttons'), settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' } },
            { section_type: 'footer', page: 'home', is_visible: true, layout: 'columns', sort_order: 99, content: getDefaultContent('footer'), settings: { color_style: 'dark' } },
          ];
          const created = await Promise.all(defaults.map(d => createWebsiteSection(restaurantId, d)));
          setSections(created);
        } else {
          // Auto-create missing essential sections for existing restaurants
          const existingTypes = new Set(sects.map(s => s.section_type));
          const missing: { section_type: string; sort_order: number; layout: string; content: Record<string, any>; settings: Record<string, any> }[] = [];
          if (!existingTypes.has('footer')) {
            missing.push({ section_type: 'footer', sort_order: 99, layout: 'columns', content: getDefaultContent('footer'), settings: { color_style: 'dark' } });
          }
          if (!existingTypes.has('action_buttons')) {
            missing.push({ section_type: 'action_buttons', sort_order: sects.length, layout: 'default', content: getDefaultContent('action_buttons'), settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' } });
          }
          if (missing.length > 0) {
            const created = await Promise.all(missing.map(d => createWebsiteSection(restaurantId, { ...d, page: 'home', is_visible: true })));
            setSections([...sects, ...created]);
          } else {
            setSections(sects);
          }
        }

        setTagline(cfg.tagline || '');
        setShowAddress(cfg.show_address ?? true);
        setShowPhone(cfg.show_phone ?? true);
        setShowHours(cfg.show_hours ?? true);
        setNavbarStyle(cfg.navbar_style || 'solid');
        setNavbarColor(cfg.navbar_color || '');
        setLogoSize(cfg.logo_size > 0 ? cfg.logo_size : 40);
        setHideNavbarName(cfg.hide_navbar_name || false);
        setHeroNameFont(cfg.hero_name_font || '');
        setCategoryBannerStyle((cfg.category_banner_style as typeof categoryBannerStyle) || 'image-overlay');
      } catch (err: any) {
        setError(err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [restaurantId]);

  // ─── Save Config ────────────────────────────────────────────────

  const handleSaveConfig = useCallback(async () => {
    // Flush any pending debounced section save
    if (sectionSaveTimerRef.current) {
      clearTimeout(sectionSaveTimerRef.current);
      sectionSaveTimerRef.current = null;
    }

    setSaving(true); setSaved(false); setError('');
    try {
      // Save any unsaved section changes first
      const savePromises = sections.map(s =>
        updateWebsiteSection(restaurantId, s.id, {
          content: s.content,
          settings: s.settings,
          layout: s.layout,
          is_visible: s.is_visible,
        }).catch(() => {}) // ignore individual failures
      );
      await Promise.all(savePromises);

      const updated = await updateWebsiteConfig(restaurantId, {
        tagline,
        show_address: showAddress,
        show_phone: showPhone,
        show_hours: showHours,
        navbar_style: navbarStyle,
        navbar_color: navbarColor,
        logo_size: logoSize,
        hide_navbar_name: hideNavbarName,
        hero_name_font: heroNameFont,
        category_banner_style: categoryBannerStyle,
      });
      setConfig(updated);
      setSaved(true);

      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [restaurantId, tagline, showAddress, showPhone, showHours, navbarStyle, navbarColor, logoSize, hideNavbarName, heroNameFont, categoryBannerStyle, sections]);

  const handleResetConfig = useCallback(async () => {
    try {
      const data = await resetWebsiteConfig(restaurantId);
      const cfg = data.website_config;
      setConfig(cfg);
      setTagline(cfg.tagline || '');
      setShowAddress(cfg.show_address ?? true);
      setShowPhone(cfg.show_phone ?? true);
      setShowHours(cfg.show_hours ?? true);
      setNavbarStyle(cfg.navbar_style || 'solid');
      setNavbarColor(cfg.navbar_color || '');
      setLogoSize(cfg.logo_size > 0 ? cfg.logo_size : 40);
      setHideNavbarName(cfg.hide_navbar_name || false);
      setHeroNameFont(cfg.hero_name_font || '');
      setCategoryBannerStyle((cfg.category_banner_style as typeof categoryBannerStyle) || 'image-overlay');
      // Also refresh sections from reset response
      if (data.sections) {
        setSections(data.sections);
        setSelectedSectionId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset');
    }
  }, [restaurantId]);

  // ─── Section CRUD ───────────────────────────────────────────────

  async function handleAddSection(sectionType: string) {
    setShowAddModal(false);
    try {
      const section = await createWebsiteSection(restaurantId, {
        section_type: sectionType,
        page: activePage,
        is_visible: true,
        layout: 'default',
        content: getDefaultContent(sectionType),
        settings: { color_style: 'light', text_alignment: 'center', padding: 'normal' },
      });
      setSections(prev => [...prev, section]);
      setSelectedSectionId(section.id);

    } catch (err: any) {
      setError(err.message || 'Failed to add section');
    }
  }

  async function handleDeleteSection(sectionId: number) {
    try {
      await deleteWebsiteSection(restaurantId, sectionId);
      setSections(prev => prev.filter(s => s.id !== sectionId));
      if (selectedSectionId === sectionId) setSelectedSectionId(null);

    } catch (err: any) {
      setError(err.message || 'Failed to delete section');
    }
  }

  // Debounced API save for section updates
  const sectionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUpdateSection(sectionId: number, updates: Partial<WebsiteSection>) {
    // Optimistic local update — immediate, so iframe gets it right away
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        ...updates,
        content: updates.content ? { ...s.content, ...updates.content } : s.content,
        settings: updates.settings ? { ...s.settings, ...updates.settings } : s.settings,
      };
    }));

    // Debounce the actual API save (500ms)
    if (sectionSaveTimerRef.current) clearTimeout(sectionSaveTimerRef.current);
    sectionSaveTimerRef.current = setTimeout(async () => {
      try {
        await updateWebsiteSection(restaurantId, sectionId, updates);
      } catch (err: any) {
        setError(err.message || 'Failed to update section');
      }
    }, 500);
  }

  async function handleMoveSection(sectionId: number, direction: 'up' | 'down') {
    const pageSections = filteredSections;
    const idx = pageSections.findIndex(s => s.id === sectionId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= pageSections.length) return;

    const reordered = [...pageSections];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const order = reordered.map((s, i) => ({ id: s.id, sort_order: i }));

    // Update full sections array
    const newSections = sections.map(s => {
      const updated = order.find(o => o.id === s.id);
      return updated ? { ...s, sort_order: updated.sort_order } : s;
    });
    setSections(newSections);

    try {
      const updated = await reorderWebsiteSections(restaurantId, order);
      setSections(prev => {
        const updatedMap = new Map(updated.map(u => [u.id, u]));
        return prev.map(s => updatedMap.get(s.id) || s);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar — Wix-style */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-divider" style={{ background: 'var(--surface)' }}>
        {/* Left: back + title */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/${restaurantId}/dashboard`)} className="w-8 h-8 rounded-full border border-divider flex items-center justify-center text-fg-secondary hover:bg-surface-subtle transition" title={t('backToDashboard')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-subtle">
            <svg className="w-4 h-4 text-fg-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            <span className="text-sm font-semibold text-fg-primary">{t('siteDesign')}</span>
          </div>
        </div>

        {/* Center: device toggle + undo/redo */}
        <div className="flex items-center gap-2">
          {/* Device dropdown */}
          <div className="relative">
            <button
              onClick={() => setPreviewMode(previewMode === 'desktop' ? 'mobile' : 'desktop')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-divider hover:bg-surface-subtle transition text-fg-secondary"
            >
              {previewMode === 'desktop' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              )}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>

        {/* Right: Preview Live + Publish */}
        <div className="flex items-center gap-3">
          {restaurant?.slug && (
            <a
              href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/r/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-500 hover:text-brand-600 font-medium"
            >
              Preview
            </a>
          )}
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn-primary px-5 py-2 rounded-lg disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? t('saving') : saved ? 'Saved!' : t('publish')}
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 font-bold">&times;</button>
        </div>
      )}

      {/* Main Layout: Left sidebar + Full preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (resizable) */}
        <div
          className="border-r border-divider overflow-y-auto flex-shrink-0 flex flex-col relative"
          style={{ width: `${sidebarWidth}px`, background: 'var(--surface)' }}
        >
          {/* Resize handle — drag the right edge */}
          <div
            onMouseDown={startSidebarResize}
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/40 active:bg-brand-500/60 transition-colors z-10"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            title="Drag to resize"
          />
          {/* Page tabs + gear + add */}
          <div className="px-3 pt-3 pb-2 space-y-2">
            <div className="flex rounded-lg border border-divider overflow-hidden">
              {pages.map(p => (
                <button
                  key={p}
                  onClick={() => setActivePage(p)}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                    activePage === p
                      ? 'bg-brand-500 text-white'
                      : 'bg-[var(--surface)] text-fg-secondary hover:bg-surface-subtle'
                  }`}
                >
                  {p === 'home' ? t('home') : p === 'menu' ? t('viewMenu') : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (activeTab === 'styles' && showSettingsPanel) {
                    setActiveTab('sections');
                    setShowSettingsPanel(false);
                  } else {
                    setActiveTab('styles');
                    setSelectedSectionId(null);
                    setShowSettingsPanel(true);
                  }
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${activeTab === 'styles' && showSettingsPanel ? 'bg-brand-500 text-white' : 'border border-divider text-fg-secondary hover:bg-surface-subtle'}`}
                title="Site settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              {activePage === 'home' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition text-lg font-bold"
                  title="Add section"
                >
                  +
                </button>
              )}
              <span className="text-xs text-fg-secondary ml-auto">
                {activePage === 'home' ? t('editSections') : t('menuSettings')}
              </span>
            </div>
          </div>

          {/* Section list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {activePage === 'home' ? (
              <SectionListPanel
                sections={filteredSections}
                selectedId={selectedSectionId}
                onSelect={setSelectedSectionId}
                onMove={handleMoveSection}
                onToggleVisibility={(id, visible) => handleUpdateSection(id, { is_visible: visible })}
              />
            ) : (
              <div className="px-3 py-3 flex flex-col gap-3">
                {/* Inner pill tabs */}
                <div className="flex rounded-lg border border-divider overflow-hidden">
                  {(['themes', 'typography', 'branding'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMenuSubTab(tab)}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                        menuSubTab === tab
                          ? 'bg-brand-500 text-white'
                          : 'bg-[var(--surface)] text-fg-secondary hover:bg-surface-subtle'
                      }`}
                    >
                      {t(`menuTab_${tab}`)}
                    </button>
                  ))}
                </div>

                {/* Active panel */}
                {!themeCatalog || !config ? (
                  <p className="text-xs text-fg-secondary py-2">{t('loading')}…</p>
                ) : menuSubTab === 'themes' ? (
                  <ThemesPanel config={config} catalog={themeCatalog} onUpdate={handleMenuConfigUpdate} />
                ) : menuSubTab === 'typography' ? (
                  <TypographyPanel config={config} catalog={themeCatalog} onUpdate={handleMenuConfigUpdate} />
                ) : (
                  <BrandingPanel config={config} onUpdate={handleMenuConfigUpdate} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 overflow-auto flex items-start justify-center" style={{ background: previewMode === 'mobile' ? 'var(--surface-subtle)' : undefined }}>
          {activePage === 'menu' ? (
            <MenuPreviewIframe
              ref={menuIframeRef}
              mode={previewMode}
              slug={restaurant?.slug}
              config={config}
              postMessage={postMenuPreview}
            />
          ) : (
            <PreviewPanel
              mode={previewMode}
              activePage={activePage}
              restaurant={restaurant}
              primaryColor={config?.brand_color || '#EB5204'}
              secondaryColor={'#C94400'}
              fontFamily={'Switzer'}
              themeMode={'light'}
              menuLayout={config?.layout_default || 'magazine'}
              cartStyle={'bar-bottom'}
              navbarStyle={navbarStyle}
              navbarColor={navbarColor}
              logoSize={logoSize}
              hideNavbarName={hideNavbarName}
              sections={sections}
              selectedSectionId={selectedSectionId}
            />
          )}
        </div>

        {/* Right slide-in settings panel */}
        {showSettingsPanel && (selectedSection || activeTab === 'styles') && (
          <div className="w-80 border-l border-divider overflow-y-auto flex-shrink-0 animate-in slide-in-from-right" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
              <h3 className="text-sm font-semibold text-fg-primary">
                {activeTab === 'styles' ? 'Site Settings' : 'Section Settings'}
              </h3>
              <button onClick={closeSettings} className="w-6 h-6 rounded-full hover:bg-surface-subtle flex items-center justify-center text-fg-secondary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              {activeTab === 'styles' ? (
                <StyleSettingsPanel
                  restaurantId={restaurantId}
                  restaurant={restaurant}
                  tagline={tagline}
                  themeMode={'light'}
                  showAddress={showAddress}
                  showPhone={showPhone}
                  showHours={showHours}
                  navbarStyle={navbarStyle}
                  navbarColor={navbarColor}
                  logoSize={logoSize}
                  hideNavbarName={hideNavbarName}
                  heroNameFont={heroNameFont}
                  categoryBannerStyle={categoryBannerStyle}
                  onTaglineChange={setTagline}
                  onThemeModeChange={() => {}}
                  onShowAddressChange={setShowAddress}
                  onShowPhoneChange={setShowPhone}
                  onShowHoursChange={setShowHours}
                  onNavbarStyleChange={setNavbarStyle}
                  onNavbarColorChange={setNavbarColor}
                  onLogoSizeChange={setLogoSize}
                  onHideNavbarNameChange={setHideNavbarName}
                  onHeroNameFontChange={setHeroNameFont}
                  onCategoryBannerStyleChange={setCategoryBannerStyle}
                  onRestaurantUpdate={setRestaurant}
                  onReset={handleResetConfig}
                />
              ) : selectedSection ? (
                <SectionSettingsPanel
                  section={selectedSection}
                  restaurantId={restaurantId}
                  onUpdate={(updates) => handleUpdateSection(selectedSection.id, updates)}
                  onDelete={() => { handleDeleteSection(selectedSection.id); closeSettings(); }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Add Section Modal */}
      {showAddModal && (
        <AddSectionModal
          onAdd={handleAddSection}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

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
            onUploaded={(url) => updateContent('image_url', url)}
            onRemove={() => updateContent('image_url', '')}
            label="Image"
          />
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
