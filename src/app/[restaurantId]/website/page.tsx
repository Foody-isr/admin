'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getWebsiteConfig, updateWebsiteConfig, getRestaurant,
  listWebsiteSections, createWebsiteSection, updateWebsiteSection,
  deleteWebsiteSection, reorderWebsiteSections, listSiteStyles,
  WebsiteConfig, WebsiteSection, SiteStylePreset, Restaurant,
} from '@/lib/api';

// ─── Constants ──────────────────────────────────────────────────────

const FONT_OPTIONS = ['Nunito Sans', 'Inter', 'Poppins', 'Rubik', 'Open Sans', 'Playfair Display'];

const SECTION_TYPE_META: Record<string, { label: string; icon: string; desc: string }> = {
  hero_banner:     { label: 'Hero Banner',      icon: '\u{1F5BC}\u{FE0F}', desc: 'Full-width image with headline & CTA' },
  scrolling_text:  { label: 'Scrolling Text',   icon: '\u{1F4DC}', desc: 'Horizontal scrolling marquee text' },
  text_and_image:  { label: 'Text & Image',     icon: '\u{1F4DD}', desc: 'Split layout \u2014 text and photo' },
  gallery:         { label: 'Gallery',           icon: '\u{1F3A8}', desc: 'Photo grid showcase' },
  testimonials:    { label: 'Testimonials',      icon: '\u{1F4AC}', desc: 'Customer reviews carousel' },
  about:           { label: 'About',             icon: '\u{1F4A1}', desc: 'About your restaurant' },
  menu_highlights: { label: 'Menu Highlights',   icon: '\u{2B50}', desc: 'Featured dishes' },
  promo_banner:    { label: 'Promo Banner',      icon: '\u{1F3F7}\u{FE0F}', desc: 'Promotional offer banner' },
  social_feed:     { label: 'Social Links',      icon: '\u{1F4F1}', desc: 'Social media profile links' },
  action_buttons:  { label: 'Action Buttons',    icon: '\u{1F518}', desc: 'Configurable CTA buttons (order, menu, links)' },
};

const LAYOUT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  hero_banner:    [{ value: 'centered', label: 'Centered' }, { value: 'left_aligned', label: 'Left Aligned' }, { value: 'split', label: 'Split' }],
  text_and_image: [{ value: 'default', label: 'Image Right' }, { value: 'image_left', label: 'Image Left' }],
  gallery:        [{ value: 'grid', label: 'Grid' }, { value: 'masonry', label: 'Masonry' }],
  testimonials:   [{ value: 'carousel', label: 'Carousel' }, { value: 'grid', label: 'Grid' }],
};

const COLOR_STYLES = [
  { value: 'brand', label: 'Brand' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'transparent', label: 'Transparent' },
];

const ACTION_TYPES = [
  { value: 'order_pickup', label: 'Order Pickup' },
  { value: 'order_delivery', label: 'Order Delivery' },
  { value: 'view_menu', label: 'View Menu' },
  { value: 'external_link', label: 'External Link' },
  { value: 'scroll_to_section', label: 'Scroll to Section' },
];

const BUTTON_STYLES = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'outline', label: 'Outline' },
];

const RESERVED_PAGES = new Set(['order', 'orders', 'table', 'payment', 'pickup', 'delivery']);

// ─── Main Component ─────────────────────────────────────────────────

type Tab = 'styles' | 'sections';

export default function WebsitePage() {
  const params = useParams();
  const restaurantId = Number(params.restaurantId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('sections');
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');

  // Data
  const [config, setConfig] = useState<WebsiteConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [sections, setSections] = useState<WebsiteSection[]>([]);
  const [siteStyles, setSiteStyles] = useState<SiteStylePreset[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activePage, setActivePage] = useState('home');

  // Config form state
  const [primaryColor, setPrimaryColor] = useState('#EB5204');
  const [secondaryColor, setSecondaryColor] = useState('#C94400');
  const [fontFamily, setFontFamily] = useState('Nunito Sans');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [tagline, setTagline] = useState('');
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showHours, setShowHours] = useState(true);

  const selectedSection = sections.find(s => s.id === selectedSectionId) || null;

  // Derive unique pages from sections
  const pages = Array.from(new Set(sections.map(s => s.page || 'home'))).sort((a, b) =>
    a === 'home' ? -1 : b === 'home' ? 1 : a.localeCompare(b)
  );

  // Filter sections by active page
  const filteredSections = sections.filter(s => (s.page || 'home') === activePage);

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
        setSections(sects);
        setSiteStyles(styles);

        setPrimaryColor(cfg.primary_color || '#EB5204');
        setSecondaryColor(cfg.secondary_color || '#C94400');
        setFontFamily(cfg.font_family || 'Nunito Sans');
        setThemeMode((cfg.theme_mode as 'light' | 'dark') || 'light');
        setTagline(cfg.tagline || '');
        setShowAddress(cfg.show_address ?? true);
        setShowPhone(cfg.show_phone ?? true);
        setShowHours(cfg.show_hours ?? true);
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
    setSaving(true); setSaved(false); setError('');
    try {
      const updated = await updateWebsiteConfig(restaurantId, {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        font_family: fontFamily,
        theme_mode: themeMode,
        tagline,
        show_address: showAddress,
        show_phone: showPhone,
        show_hours: showHours,
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [restaurantId, primaryColor, secondaryColor, fontFamily, themeMode, tagline, showAddress, showPhone, showHours]);

  // ─── Apply Site Style ───────────────────────────────────────────

  async function applySiteStyle(style: SiteStylePreset) {
    setPrimaryColor(style.primary_color);
    setSecondaryColor(style.secondary_color);
    setFontFamily(style.font_family);
    try {
      const updated = await updateWebsiteConfig(restaurantId, {
        primary_color: style.primary_color,
        secondary_color: style.secondary_color,
        font_family: style.font_family,
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to apply style');
    }
  }

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

  async function handleUpdateSection(sectionId: number, updates: Partial<WebsiteSection>) {
    try {
      const updated = await updateWebsiteSection(restaurantId, sectionId, updates);
      setSections(prev => prev.map(s => s.id === sectionId ? updated : s));
    } catch (err: any) {
      setError(err.message || 'Failed to update section');
    }
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

  function handleAddPage() {
    const name = prompt('Enter page name (e.g., about, info, gallery):');
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return;
    if (RESERVED_PAGES.has(slug)) {
      setError(`"${slug}" is a reserved page name.`);
      return;
    }
    if (pages.includes(slug)) {
      setActivePage(slug);
      return;
    }
    setActivePage(slug);
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
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-divider" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-fg-primary">Site Design</h1>
          <div className="flex rounded-lg border border-divider overflow-hidden">
            <button
              onClick={() => setActiveTab('sections')}
              className={`px-4 py-1.5 text-sm font-medium ${activeTab === 'sections' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:bg-surface-subtle'}`}
            >
              Sections
            </button>
            <button
              onClick={() => setActiveTab('styles')}
              className={`px-4 py-1.5 text-sm font-medium ${activeTab === 'styles' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:bg-surface-subtle'}`}
            >
              Site Styles
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Preview toggle */}
          <div className="flex rounded-lg border border-divider overflow-hidden">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 ${previewMode === 'desktop' ? 'bg-surface-subtle' : ''}`}
              title="Desktop preview"
            >
              <svg className="w-5 h-5 text-fg-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 ${previewMode === 'mobile' ? 'bg-surface-subtle' : ''}`}
              title="Mobile preview"
            >
              <svg className="w-5 h-5 text-fg-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {restaurant?.slug && (
            <a
              href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/r/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-500 hover:text-brand-600 font-medium"
            >
              Preview Live
            </a>
          )}
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn-primary px-5 py-2 disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Publish'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 font-bold">&times;</button>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Section List (or Site Styles tab) */}
        <div className="w-64 border-r border-divider overflow-y-auto flex-shrink-0" style={{ background: 'var(--surface-subtle)' }}>
          {activeTab === 'styles' ? (
            <SiteStylesPanel
              styles={siteStyles}
              currentPrimary={primaryColor}
              onApply={applySiteStyle}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              fontFamily={fontFamily}
              onPrimaryChange={setPrimaryColor}
              onSecondaryChange={setSecondaryColor}
              onFontChange={setFontFamily}
            />
          ) : (
            <SectionListPanel
              sections={filteredSections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              onAdd={() => setShowAddModal(true)}
              onMove={handleMoveSection}
              onToggleVisibility={(id, visible) => handleUpdateSection(id, { is_visible: visible })}
              pages={pages}
              activePage={activePage}
              onPageChange={setActivePage}
              onAddPage={handleAddPage}
            />
          )}
        </div>

        {/* Column 2: Section Settings */}
        <div className="flex-1 overflow-y-auto p-6 min-w-0" style={{ background: 'var(--surface)' }}>
          {activeTab === 'styles' ? (
            <StyleSettingsPanel
              tagline={tagline}
              themeMode={themeMode}
              showAddress={showAddress}
              showPhone={showPhone}
              showHours={showHours}
              onTaglineChange={setTagline}
              onThemeModeChange={setThemeMode}
              onShowAddressChange={setShowAddress}
              onShowPhoneChange={setShowPhone}
              onShowHoursChange={setShowHours}
            />
          ) : selectedSection ? (
            <SectionSettingsPanel
              section={selectedSection}
              onUpdate={(updates) => handleUpdateSection(selectedSection.id, updates)}
              onDelete={() => handleDeleteSection(selectedSection.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-fg-secondary">
              <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              <p className="font-medium">Select a section to edit</p>
              <p className="text-sm opacity-60 mt-1">Or add a new one with the + button</p>
            </div>
          )}
        </div>

        {/* Column 3: Preview */}
        <div className={`border-l border-divider overflow-y-auto flex-shrink-0 flex items-start justify-center p-6 transition-all ${previewMode === 'desktop' ? 'w-[520px]' : 'w-[340px]'}`} style={{ background: 'var(--surface-subtle)' }}>
          <PreviewPanel
            mode={previewMode}
            restaurant={restaurant}
            activePage={activePage}
          />
        </div>
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
    <div className="p-4 space-y-4">
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

function StyleSettingsPanel({ tagline, themeMode, showAddress, showPhone, showHours, onTaglineChange, onThemeModeChange, onShowAddressChange, onShowPhoneChange, onShowHoursChange }: {
  tagline: string;
  themeMode: 'light' | 'dark';
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  onTaglineChange: (v: string) => void;
  onThemeModeChange: (v: 'light' | 'dark') => void;
  onShowAddressChange: (v: boolean) => void;
  onShowPhoneChange: (v: boolean) => void;
  onShowHoursChange: (v: boolean) => void;
}) {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-fg-primary mb-4">Global Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1">Tagline</label>
            <input type="text" value={tagline} onChange={e => onTaglineChange(e.target.value)} className="w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary" placeholder="Fresh food, fast delivery" />
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
    </div>
  );
}

function SectionListPanel({ sections, selectedId, onSelect, onAdd, onMove, onToggleVisibility, pages, activePage, onPageChange, onAddPage }: {
  sections: WebsiteSection[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
  pages: string[];
  activePage: string;
  onPageChange: (page: string) => void;
  onAddPage: () => void;
}) {
  return (
    <div className="p-3">
      {/* Page selector */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {pages.map(page => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activePage === page
                  ? 'bg-brand-500 text-white'
                  : 'bg-[var(--surface)] text-fg-secondary hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {page.charAt(0).toUpperCase() + page.slice(1)}
            </button>
          ))}
          <button
            onClick={onAddPage}
            className="px-2 py-1 rounded-md text-xs font-medium text-fg-secondary hover:bg-[var(--surface)] transition-all"
            title="Add page"
          >
            + Page
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider">Sections</h3>
        <button
          onClick={onAdd}
          className="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-colors text-lg font-bold"
        >
          +
        </button>
      </div>
      <div className="space-y-1">
        {sections.map((section, idx) => {
          const meta = SECTION_TYPE_META[section.section_type];
          return (
            <div
              key={section.id}
              onClick={() => onSelect(section.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
                selectedId === section.id
                  ? 'bg-brand-500/10 border border-brand-500'
                  : 'hover:bg-[var(--surface)] border border-transparent'
              } ${!section.is_visible ? 'opacity-50' : ''}`}
            >
              <span className="text-base flex-shrink-0">{meta?.icon || '\u{1F4C4}'}</span>
              <span className="text-sm font-medium text-fg-primary flex-1 truncate">
                {meta?.label || section.section_type}
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
          <p className="text-xs text-fg-secondary text-center py-4">No sections on this page. Click + to add one.</p>
        )}
      </div>
    </div>
  );
}

function SectionSettingsPanel({ section, onUpdate, onDelete }: {
  section: WebsiteSection;
  onUpdate: (updates: Partial<WebsiteSection>) => void;
  onDelete: () => void;
}) {
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
          <h2 className="text-lg font-semibold text-fg-primary">{meta?.label || section.section_type}</h2>
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
                {l.label}
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
              {cs.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content fields */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-fg-secondary">Content</h3>

        {/* Common text fields based on section type */}
        {(section.section_type === 'hero_banner' || section.section_type === 'text_and_image' || section.section_type === 'about' || section.section_type === 'promo_banner') && (
          <>
            {section.section_type !== 'about' && (
              <div>
                <label className={labelClass}>Headline</label>
                <input type="text" value={content.headline || content.title || ''} onChange={e => updateContent(section.section_type === 'hero_banner' ? 'headline' : 'title', e.target.value)} className={inputClass} placeholder="Your headline here" />
              </div>
            )}
            {section.section_type === 'about' && (
              <div>
                <label className={labelClass}>Title</label>
                <input type="text" value={content.title || ''} onChange={e => updateContent('title', e.target.value)} className={inputClass} placeholder="About Us" />
              </div>
            )}
            <div>
              <label className={labelClass}>{section.section_type === 'hero_banner' ? 'Subheadline' : 'Body'}</label>
              <textarea value={content.subheadline || content.body || ''} onChange={e => updateContent(section.section_type === 'hero_banner' ? 'subheadline' : 'body', e.target.value)} className={`${inputClass} min-h-[80px]`} placeholder="Description text..." />
            </div>
            {section.section_type === 'hero_banner' && (
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
            )}
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
          <div>
            <label className={labelClass}>Image URLs (one per line)</label>
            <textarea
              value={(content.images || []).map((img: any) => img.url).join('\n')}
              onChange={e => {
                const images = e.target.value.split('\n').filter(Boolean).map(url => ({ url: url.trim(), alt: '' }));
                updateContent('images', images);
              }}
              className={`${inputClass} min-h-[80px] font-mono`}
              placeholder="https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
            />
          </div>
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
          <div>
            <label className={labelClass}>Section Title</label>
            <input type="text" value={content.title || ''} onChange={e => updateContent('title', e.target.value)} className={inputClass} placeholder="Chef's Picks" />
            <p className="text-xs text-fg-secondary mt-2">Featured items will be auto-populated from your most popular menu items.</p>
          </div>
        )}

        {/* Action Buttons Editor */}
        {section.section_type === 'action_buttons' && (
          <ActionButtonsEditor content={content} updateContent={updateContent} />
        )}

        {/* Image URL for sections that support it */}
        {['hero_banner', 'text_and_image', 'promo_banner'].includes(section.section_type) && (
          <div>
            <label className={labelClass}>Image URL</label>
            <input type="url" value={content.image_url || ''} onChange={e => updateContent('image_url', e.target.value)} className={inputClass} placeholder="https://..." />
            {content.image_url && (
              <img src={content.image_url} alt="" className="mt-2 rounded-lg max-h-32 object-cover" />
            )}
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
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Style</label>
              <select value={btn.style || 'primary'} onChange={e => updateButton(idx, 'style', e.target.value)} className={inputClass}>
                {BUTTON_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

function PreviewPanel({ mode, restaurant, activePage }: {
  mode: 'mobile' | 'desktop';
  restaurant: Restaurant | null;
  activePage: string;
}) {
  const slug = restaurant?.slug || String(restaurant?.id || '');
  const baseUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';
  const pagePath = activePage === 'home' ? '' : `/${activePage}`;
  const iframeSrc = slug ? `${baseUrl}/r/${slug}${pagePath}` : '';

  const [iframeKey, setIframeKey] = useState(0);

  // Refresh iframe when page or mode changes
  useEffect(() => {
    setIframeKey(k => k + 1);
  }, [activePage]);

  if (!slug) {
    return (
      <div className="flex items-center justify-center h-64 text-fg-secondary text-sm">
        No restaurant to preview
      </div>
    );
  }

  if (mode === 'desktop') {
    return (
      <div className="sticky top-6 w-full">
        {/* Desktop monitor frame */}
        <div className="rounded-lg border-2 border-gray-700 overflow-hidden bg-white shadow-2xl">
          {/* Browser chrome */}
          <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 bg-gray-700 rounded px-2 py-0.5 text-[9px] text-gray-400 truncate">
              {iframeSrc}
            </div>
          </div>
          {/* Content */}
          <iframe
            key={iframeKey}
            src={iframeSrc}
            className="w-full border-0"
            style={{ height: 520 }}
            title="Desktop preview"
          />
        </div>
        {/* Refresh hint */}
        <button
          onClick={() => setIframeKey(k => k + 1)}
          className="mt-3 w-full text-center text-xs text-fg-secondary hover:text-brand-500 transition-colors"
        >
          Click to refresh preview
        </button>
      </div>
    );
  }

  // Mobile frame
  return (
    <div className="sticky top-6">
      <div className="relative rounded-[2.5rem] border-[4px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden" style={{ width: 290 }}>
        {/* Notch */}
        <div className="relative z-10 flex justify-center">
          <div className="w-24 h-5 bg-gray-900 rounded-b-2xl" />
        </div>
        {/* Screen */}
        <div className="bg-white overflow-hidden rounded-b-[2rem]" style={{ marginTop: -2 }}>
          <iframe
            key={iframeKey}
            src={iframeSrc}
            className="w-full border-0"
            style={{ height: 560 }}
            title="Mobile preview"
          />
        </div>
        {/* Home indicator */}
        <div className="flex justify-center py-1.5">
          <div className="w-24 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
      {/* Refresh hint */}
      <button
        onClick={() => setIframeKey(k => k + 1)}
        className="mt-3 w-full text-center text-xs text-fg-secondary hover:text-brand-500 transition-colors"
      >
        Click to refresh preview
      </button>
    </div>
  );
}

function AddSectionModal({ onAdd, onClose }: { onAdd: (type: string) => void; onClose: () => void }) {
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
              <div className="font-medium text-fg-primary text-sm">{meta.label}</div>
              <div className="text-xs text-fg-secondary mt-0.5">{meta.desc}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-fg-secondary hover:text-fg-primary transition">Cancel</button>
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
    case 'about': return { title: 'About Us', body: 'Tell your customers about your restaurant, your story, and what makes your food special.' };
    case 'menu_highlights': return { title: "Chef's Picks", item_ids: [], auto_populate: true };
    case 'promo_banner': return { title: 'Special Offer', body: 'Check out our latest deals!' };
    case 'social_feed': return { links: [] };
    case 'action_buttons': return { buttons: [{ label: 'Order Now', action: 'view_menu', style: 'primary' }] };
    default: return {};
  }
}
