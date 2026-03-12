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
  hero_banner:     { label: 'Hero Banner',      icon: '🖼️', desc: 'Full-width image with headline & CTA' },
  scrolling_text:  { label: 'Scrolling Text',   icon: '📜', desc: 'Horizontal scrolling marquee text' },
  text_and_image:  { label: 'Text & Image',     icon: '📝', desc: 'Split layout — text and photo' },
  gallery:         { label: 'Gallery',           icon: '🎨', desc: 'Photo grid showcase' },
  testimonials:    { label: 'Testimonials',      icon: '💬', desc: 'Customer reviews carousel' },
  about:           { label: 'About',             icon: '💡', desc: 'About your restaurant' },
  menu_highlights: { label: 'Menu Highlights',   icon: '⭐', desc: 'Featured dishes' },
  promo_banner:    { label: 'Promo Banner',      icon: '🏷️', desc: 'Promotional offer banner' },
  social_feed:     { label: 'Social Links',      icon: '📱', desc: 'Social media profile links' },
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

  // Config form state
  const [primaryColor, setPrimaryColor] = useState('#EB5204');
  const [secondaryColor, setSecondaryColor] = useState('#C94400');
  const [fontFamily, setFontFamily] = useState('Nunito Sans');
  const [tagline, setTagline] = useState('');
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showHours, setShowHours] = useState(true);

  const selectedSection = sections.find(s => s.id === selectedSectionId) || null;

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
  }, [restaurantId, primaryColor, secondaryColor, fontFamily, tagline, showAddress, showPhone, showHours]);

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
    const idx = sections.findIndex(s => s.id === sectionId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sections.length) return;

    const reordered = [...sections];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const order = reordered.map((s, i) => ({ id: s.id, sort_order: i }));

    setSections(reordered);
    try {
      const updated = await reorderWebsiteSections(restaurantId, order);
      setSections(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-900">Site Design</h1>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('sections')}
              className={`px-4 py-1.5 text-sm font-medium ${activeTab === 'sections' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Sections
            </button>
            <button
              onClick={() => setActiveTab('styles')}
              className={`px-4 py-1.5 text-sm font-medium ${activeTab === 'styles' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Site Styles
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Preview toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 ${previewMode === 'desktop' ? 'bg-gray-100' : ''}`}
              title="Desktop preview"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 ${previewMode === 'mobile' ? 'bg-gray-100' : ''}`}
              title="Mobile preview"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {restaurant?.slug && (
            <a
              href={`${process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il'}/r/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Preview Live
            </a>
          )}
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Publish'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 font-bold">&times;</button>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Section List (or Site Styles tab) */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
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
              sections={sections}
              selectedId={selectedSectionId}
              onSelect={setSelectedSectionId}
              onAdd={() => setShowAddModal(true)}
              onMove={handleMoveSection}
              onToggleVisibility={(id, visible) => handleUpdateSection(id, { is_visible: visible })}
            />
          )}
        </div>

        {/* Column 2: Section Settings */}
        <div className="flex-1 overflow-y-auto bg-white p-6 min-w-0">
          {activeTab === 'styles' ? (
            <StyleSettingsPanel
              tagline={tagline}
              showAddress={showAddress}
              showPhone={showPhone}
              showHours={showHours}
              onTaglineChange={setTagline}
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
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              <p className="font-medium text-gray-500">Select a section to edit</p>
              <p className="text-sm text-gray-400 mt-1">Or add a new one with the + button</p>
            </div>
          )}
        </div>

        {/* Column 3: Preview */}
        <div className="w-[380px] border-l border-gray-200 bg-gray-100 overflow-y-auto flex-shrink-0 flex items-start justify-center p-6">
          <PreviewPanel
            mode={previewMode}
            restaurant={restaurant}
            primaryColor={primaryColor}
            fontFamily={fontFamily}
            tagline={tagline}
            showAddress={showAddress}
            showPhone={showPhone}
            showHours={showHours}
            sections={sections}
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
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Site Styles</h3>
      <div className="grid grid-cols-2 gap-2">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onApply(style)}
            className={`p-3 rounded-lg border-2 transition-all text-center ${
              currentPrimary === style.primary_color
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="text-lg font-bold" style={{ color: style.primary_color, fontFamily: `"${style.font_family}", sans-serif` }}>
              Aa
            </div>
            <div className="w-full h-1.5 rounded-full mt-1.5" style={{ backgroundColor: style.primary_color }} />
            <div className="text-[10px] text-gray-500 mt-1 truncate">{style.name}</div>
          </button>
        ))}
      </div>

      <hr className="border-gray-200" />

      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Custom Colors</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Primary</label>
          <div className="flex gap-2">
            <input type="color" value={primaryColor} onChange={(e) => onPrimaryChange(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
            <input type="text" value={primaryColor} onChange={(e) => onPrimaryChange(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Secondary</label>
          <div className="flex gap-2">
            <input type="color" value={secondaryColor} onChange={(e) => onSecondaryChange(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
            <input type="text" value={secondaryColor} onChange={(e) => onSecondaryChange(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Font</label>
          <select value={fontFamily} onChange={(e) => onFontChange(e.target.value)} className="w-full text-xs border rounded px-2 py-1.5">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function StyleSettingsPanel({ tagline, showAddress, showPhone, showHours, onTaglineChange, onShowAddressChange, onShowPhoneChange, onShowHoursChange }: {
  tagline: string;
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  onTaglineChange: (v: string) => void;
  onShowAddressChange: (v: boolean) => void;
  onShowPhoneChange: (v: boolean) => void;
  onShowHoursChange: (v: boolean) => void;
}) {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Global Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
            <input type="text" value={tagline} onChange={e => onTaglineChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Fresh food, fast delivery" />
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Visibility</h3>
        {[
          { label: 'Show Address', value: showAddress, setter: onShowAddressChange },
          { label: 'Show Phone', value: showPhone, setter: onShowPhoneChange },
          { label: 'Show Hours', value: showHours, setter: onShowHoursChange },
        ].map(t => (
          <label key={t.label} className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-700">{t.label}</span>
            <button type="button" onClick={() => t.setter(!t.value)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${t.value ? 'bg-orange-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${t.value ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}

function SectionListPanel({ sections, selectedId, onSelect, onAdd, onMove, onToggleVisibility }: {
  sections: WebsiteSection[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Sections</h3>
        <button
          onClick={onAdd}
          className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors text-lg font-bold"
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
                  ? 'bg-orange-100 border border-orange-300'
                  : 'hover:bg-gray-100 border border-transparent'
              } ${!section.is_visible ? 'opacity-50' : ''}`}
            >
              <span className="text-base flex-shrink-0">{meta?.icon || '📄'}</span>
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                {meta?.label || section.section_type}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onMove(section.id, 'up'); }} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); onMove(section.id, 'down'); }} disabled={idx === sections.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(section.id, !section.is_visible); }} className="p-0.5 text-gray-400 hover:text-gray-600">
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
          <p className="text-xs text-gray-400 text-center py-4">No sections yet. Click + to add one.</p>
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

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta?.icon || '📄'}</span>
          <h2 className="text-lg font-semibold text-gray-900">{meta?.label || section.section_type}</h2>
        </div>
        <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
      </div>

      {/* Layout variants */}
      {layouts && layouts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Layout</h3>
          <div className="flex gap-2">
            {layouts.map(l => (
              <button
                key={l.value}
                onClick={() => onUpdate({ layout: l.value })}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  section.layout === l.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Color Style</h3>
        <div className="flex gap-2">
          {COLOR_STYLES.map(cs => (
            <button
              key={cs.value}
              onClick={() => updateSettings('color_style', cs.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                settings.color_style === cs.value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {cs.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content fields — vary by section type */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Content</h3>

        {/* Common text fields based on section type */}
        {(section.section_type === 'hero_banner' || section.section_type === 'text_and_image' || section.section_type === 'about' || section.section_type === 'promo_banner') && (
          <>
            {section.section_type !== 'about' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Headline</label>
                <input type="text" value={content.headline || content.title || ''} onChange={e => updateContent(section.section_type === 'hero_banner' ? 'headline' : 'title', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Your headline here" />
              </div>
            )}
            {section.section_type === 'about' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Title</label>
                <input type="text" value={content.title || ''} onChange={e => updateContent('title', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="About Us" />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{section.section_type === 'hero_banner' ? 'Subheadline' : 'Body'}</label>
              <textarea value={content.subheadline || content.body || ''} onChange={e => updateContent(section.section_type === 'hero_banner' ? 'subheadline' : 'body', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]" placeholder="Description text..." />
            </div>
            {section.section_type === 'hero_banner' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">CTA Text</label>
                  <input type="text" value={content.cta_text || ''} onChange={e => updateContent('cta_text', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Order Now" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">CTA Link</label>
                  <input type="text" value={content.cta_link || ''} onChange={e => updateContent('cta_link', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="#menu" />
                </div>
              </div>
            )}
          </>
        )}

        {section.section_type === 'scrolling_text' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Text (use | to separate phrases)</label>
            <input type="text" value={content.text || ''} onChange={e => updateContent('text', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Fresh daily | Family recipes | Handmade pasta" />
          </div>
        )}

        {section.section_type === 'testimonials' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Reviews (one per line: Name | Text | Rating)</label>
            <textarea
              value={(content.reviews || []).map((r: any) => `${r.name} | ${r.text} | ${r.rating}`).join('\n')}
              onChange={e => {
                const reviews = e.target.value.split('\n').filter(Boolean).map(line => {
                  const [name = '', text = '', rating = '5'] = line.split('|').map(s => s.trim());
                  return { name, text, rating: parseInt(rating) || 5 };
                });
                updateContent('reviews', reviews);
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px] font-mono"
              placeholder="John D. | Amazing food! | 5&#10;Sarah M. | Best hummus in town | 5"
            />
          </div>
        )}

        {section.section_type === 'gallery' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Image URLs (one per line)</label>
            <textarea
              value={(content.images || []).map((img: any) => img.url).join('\n')}
              onChange={e => {
                const images = e.target.value.split('\n').filter(Boolean).map(url => ({ url: url.trim(), alt: '' }));
                updateContent('images', images);
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] font-mono"
              placeholder="https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
            />
          </div>
        )}

        {section.section_type === 'social_feed' && (
          <div className="space-y-2">
            {['instagram', 'facebook', 'tiktok'].map(platform => (
              <div key={platform}>
                <label className="text-xs text-gray-500 mb-1 block capitalize">{platform}</label>
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
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder={`https://${platform}.com/yourrestaurant`}
                />
              </div>
            ))}
          </div>
        )}

        {section.section_type === 'menu_highlights' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Section Title</label>
            <input type="text" value={content.title || ''} onChange={e => updateContent('title', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Chef's Picks" />
            <p className="text-xs text-gray-400 mt-2">Featured items will be auto-populated from your most popular menu items.</p>
          </div>
        )}

        {/* Image URL for sections that support it */}
        {['hero_banner', 'text_and_image', 'promo_banner'].includes(section.section_type) && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Image URL</label>
            <input type="url" value={content.image_url || ''} onChange={e => updateContent('image_url', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
            {content.image_url && (
              <img src={content.image_url} alt="" className="mt-2 rounded-lg max-h-32 object-cover" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewPanel({ mode, restaurant, primaryColor, fontFamily, tagline, showAddress, showPhone, showHours, sections }: {
  mode: 'mobile' | 'desktop';
  restaurant: Restaurant | null;
  primaryColor: string;
  fontFamily: string;
  tagline: string;
  showAddress: boolean;
  showPhone: boolean;
  showHours: boolean;
  sections: WebsiteSection[];
}) {
  const width = mode === 'mobile' ? 320 : 768;

  return (
    <div className="sticky top-6">
      <div className="rounded-[2rem] border-[6px] border-gray-800 overflow-hidden bg-white shadow-2xl" style={{ width }}>
        {/* Status bar */}
        <div className="bg-gray-800 text-white text-[10px] flex justify-between px-4 py-1">
          <span>9:41</span>
          <span>...</span>
        </div>

        {/* Mini hero */}
        <div className="relative h-28" style={{ backgroundColor: primaryColor }}>
          {restaurant?.cover_url && (
            <img src={restaurant.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-end gap-2">
            {restaurant?.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="w-8 h-8 rounded-md bg-white border border-white object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: primaryColor }}>
                {restaurant?.name?.charAt(0) || 'R'}
              </div>
            )}
            <div>
              <div className="text-white font-bold text-xs" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
                {restaurant?.name || 'Restaurant'}
              </div>
              {tagline && <div className="text-white/70 text-[10px] truncate max-w-[160px]">{tagline}</div>}
            </div>
          </div>
        </div>

        {/* Info bar */}
        <div className="px-2 py-1.5 border-b border-gray-100 flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-[9px] font-medium text-white" style={{ backgroundColor: primaryColor }}>Pickup</span>
          {showHours && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[9px] text-gray-500">10:00-22:00</span>}
          {showAddress && restaurant?.address && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[9px] text-gray-500 truncate max-w-[100px]">{restaurant.address}</span>}
        </div>

        {/* Sections preview */}
        {sections.filter(s => s.is_visible).map(section => (
          <SectionPreviewMini key={section.id} section={section} primaryColor={primaryColor} />
        ))}

        {/* Menu skeleton */}
        <div className="p-2 space-y-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-gray-50">
              <div className="w-8 h-8 rounded bg-gray-200" />
              <div className="flex-1">
                <div className="h-2 bg-gray-200 rounded w-3/4 mb-1" />
                <div className="h-1.5 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="text-[10px] font-bold" style={{ color: primaryColor }}>&#8362;32</div>
            </div>
          ))}
        </div>

        {/* Cart button */}
        <div className="px-2 pb-2">
          <div className="w-full py-2 rounded-lg text-white text-center text-[10px] font-bold" style={{ backgroundColor: primaryColor }}>
            View Cart &middot; &#8362;96.00
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionPreviewMini({ section, primaryColor }: { section: WebsiteSection; primaryColor: string }) {
  const content = section.content || {};
  const meta = SECTION_TYPE_META[section.section_type];

  if (section.section_type === 'hero_banner') {
    return (
      <div className="relative h-20 bg-gray-200 overflow-hidden">
        {content.image_url && <img src={content.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white px-3">
          <div className="text-xs font-bold text-center truncate w-full">{content.headline || 'Hero Banner'}</div>
          {content.subheadline && <div className="text-[9px] opacity-80 truncate w-full text-center">{content.subheadline}</div>}
          {content.cta_text && (
            <div className="mt-1 px-2 py-0.5 rounded text-[8px] font-bold text-white" style={{ backgroundColor: primaryColor }}>{content.cta_text}</div>
          )}
        </div>
      </div>
    );
  }

  if (section.section_type === 'scrolling_text') {
    return (
      <div className="py-1.5 overflow-hidden border-b border-gray-100">
        <div className="text-[9px] font-bold text-gray-600 whitespace-nowrap animate-marquee">
          {content.text || 'Scrolling text here...'}
        </div>
      </div>
    );
  }

  // Generic fallback for other section types
  return (
    <div className="px-2 py-2 border-b border-gray-100">
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{meta?.icon || '📄'}</span>
        <span className="text-[10px] font-medium text-gray-500">{meta?.label || section.section_type}</span>
      </div>
    </div>
  );
}

function AddSectionModal({ onAdd, onClose }: { onAdd: (type: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Add Section</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(SECTION_TYPE_META).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className="p-4 rounded-xl border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
            >
              <span className="text-2xl block mb-1">{meta.icon}</span>
              <div className="font-medium text-gray-900 text-sm">{meta.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{meta.desc}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
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
    default: return {};
  }
}
