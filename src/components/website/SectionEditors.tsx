'use client';

// Section content editors for the website builder.
//
// Extracted verbatim from the legacy builder (website/page.tsx) so the same
// section-content editing UI can be mounted in the v2 builder. SectionSettingsPanel
// is the top-level entry point; the smaller editors + uploaders are its building
// blocks. Kept dependency-free of page.tsx to avoid a circular import.

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  uploadSectionImage,
  getAllCategories,
  WebsiteSection, MenuCategory, MenuItem,
} from '@/lib/api';
import { WEBSITE_FONT_FAMILIES } from '@/lib/website-fonts';
import { CoverFocalPicker } from '@/components/website/CoverFocalPicker';

// Font choices for the section font pickers. Sourced from the shared curated
// library (kept in sync with foodyweb's loader) so all pickers offer the same
// expanded set.
const FONT_OPTIONS = WEBSITE_FONT_FAMILIES;

export const SECTION_TYPE_META: Record<string, { labelKey: string; icon: string; descKey: string }> = {
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
  feature_cards:   { labelKey: 'featureCards',     icon: '\u{1F5C2}\u{FE0F}', descKey: 'featureCardsDesc' },
  picnic_basket:   { labelKey: 'picnicBasket',     icon: '\u{1F9FA}', descKey: 'picnicBasketDesc' },
  footer:          { labelKey: 'footer',            icon: '\u{1F3E0}', descKey: 'footerDesc' },
};

// Default content for a freshly-added section, keyed by section_type. Pure — no
// page dependencies — so the same seed powers both the legacy builder and the v2
// builder's add-section flow (kept here to avoid duplicating the defaults).
export function getDefaultContent(sectionType: string): Record<string, any> {
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
    case 'feature_cards': return { cards: [{ image_url: '', title: '', subtitle: '', link: '' }] };
    case 'order_discovery': return {
      heading_eyebrow: 'Au-delà du menu',
      heading: 'Découvrez aussi',
      show_heading: true,
      promotions: [{
        image_url: '', image_alt: '', image_focal_x: 50, image_focal_y: 50,
        eyebrow: '', title: '', description: '', cta_label: 'Découvrir',
        link: '', open_in_new_tab: false,
      }],
    };
    case 'picnic_basket': return { title: 'Preparing Your Basket', subtitle: 'Scroll to fill your Shabbat basket with love', items: [], basket_image: '', completion_text: 'Ready for Shabbat! \u{1F56F}\u{FE0F}' };
    case 'footer': return { show_logo: true, show_description: true, show_address: true, show_phone: true, show_hours: true, custom_text: '', social_links: [] };
    default: return {};
  }
}

/** Visual and placement defaults for sections that need structured settings. */
export function getDefaultSettings(sectionType: string): Record<string, any> {
  if (sectionType !== 'order_discovery') return {};
  return {
    placement_mode: 'inside_group',
    placement_edge: 'after',
    insert_after_items: 6,
    image_position: 'left',
    card_height: 'regular',
    card_radius: 'rounded',
    panel_style: 'gradient',
    show_dividers: true,
    mobile_overlay_opacity: 0.72,
  };
}

export const LAYOUT_OPTIONS: Record<string, { value: string; labelKey: string }[]> = {
  hero_banner:    [{ value: 'centered', labelKey: 'centered' }, { value: 'left_aligned', labelKey: 'leftAligned' }, { value: 'split', labelKey: 'split' }],
  text_and_image: [{ value: 'default', labelKey: 'imageRight' }, { value: 'image_left', labelKey: 'imageLeft' }],
  gallery:        [{ value: 'grid', labelKey: 'grid' }, { value: 'masonry', labelKey: 'masonry' }],
  testimonials:   [{ value: 'carousel', labelKey: 'carousel' }, { value: 'grid', labelKey: 'grid' }],
  about:          [{ value: 'centered', labelKey: 'centered' }, { value: 'split', labelKey: 'split' }, { value: 'banner', labelKey: 'banner' }],
  footer:         [{ value: 'columns', labelKey: 'columns' }, { value: 'centered', labelKey: 'centered' }, { value: 'minimal', labelKey: 'minimal' }],
};

export const COLOR_STYLES = [
  { value: 'light', labelKey: 'light' },
  { value: 'dark', labelKey: 'dark' },
  { value: 'custom', labelKey: 'custom' },
];

const ACTION_TYPES = [
  { value: 'order_pickup', labelKey: 'orderPickup' },
  { value: 'order_delivery', labelKey: 'orderDelivery' },
  { value: 'view_menu', labelKey: 'viewMenu' },
  { value: 'catering', labelKey: 'cateringAction' },
  { value: 'external_link', labelKey: 'externalLink' },
  { value: 'scroll_to_section', labelKey: 'scrollToSection' },
];

const BUTTON_STYLES = [
  { value: 'primary', labelKey: 'primary' },
  { value: 'secondary', labelKey: 'secondary' },
  { value: 'outline', labelKey: 'outline' },
];

// ─── About Blocks Editor ──────────────────────────────────────────────
export function AboutBlocksEditor({ content, updateContent, restaurantId }: {
  content: Record<string, any>;
  updateContent: (key: string, value: any) => void;
  restaurantId: number;
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
          <SectionImageUploader
            restaurantId={restaurantId}
            currentUrl={block.image_url || ''}
            onUploaded={(url) => updateBlock(idx, 'image_url', url)}
            onRemove={() => updateBlock(idx, 'image_url', '')}
            label="Block image (optional)"
          />
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

export function PicnicBasketEditor({ content, settings, updateContent, updateSettings, restaurantId }: {
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
export function MenuHighlightsEditor({ content, settings, updateContent, updateSettings, restaurantId }: {
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
export function SectionImageUploader({ restaurantId, currentUrl, onUploaded, onRemove, label, className }: {
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

export function SectionSettingsPanel({ section, restaurantId, onUpdate, onDelete }: {
  section: WebsiteSection;
  restaurantId: number;
  onUpdate: (updates: Partial<WebsiteSection>) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const meta = SECTION_TYPE_META[section.section_type];
  const content = section.content || {};
  const settings = section.settings || {};

  const aboutImg = section.section_type === 'about' && !!settings.bg_image;
  const overlayOn = aboutImg ? (settings.bg_overlay ?? true) : !!settings.bg_overlay;
  const overlayOpacity = settings.bg_overlay_opacity ?? (aboutImg ? 45 : 50);

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
            {(() => {
              const effLayout =
                section.section_type === 'about' && (!section.layout || section.layout === 'default')
                  ? 'centered'
                  : section.layout;
              return layouts.map(l => (
                <button
                  key={l.value}
                  onClick={() => onUpdate({ layout: l.value })}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    effLayout === l.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'
                  }`}
                >
                  {t(l.labelKey)}
                </button>
              ));
            })()}
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

        {/* Background Image — for About, only meaningful in the Banner layout */}
        {(section.section_type !== 'about' || section.layout === 'banner') && (
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
                  onClick={() => updateSettings('bg_overlay', !overlayOn)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${overlayOn ? 'bg-[var(--brand)]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${overlayOn ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              {overlayOn && (
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
                      <span className="text-xs text-fg-secondary">{overlayOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={overlayOpacity}
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
        )}
      </div>

      {/* Typography */}
      {['hero_banner', 'text_and_image', 'about', 'promo_banner', 'scrolling_text', 'footer'].includes(section.section_type) && (
        <div>
          <h3 className="text-sm font-semibold text-fg-secondary mb-2">{section.section_type === 'about' ? 'Default typography (all blocks)' : 'Typography'}</h3>
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

      {/* About — design controls */}
      {section.section_type === 'about' && (
        <div className="space-y-4">
          {section.layout === 'split' && (
            <div className="space-y-2">
              <label className="text-xs text-fg-secondary font-medium block">Side Image</label>
              <SectionImageUploader
                restaurantId={restaurantId}
                currentUrl={settings.image_url || ''}
                onUploaded={(url) => updateSettings('image_url', url)}
                onRemove={() => updateSettings('image_url', '')}
              />
              <div>
                <label className="text-xs text-fg-secondary mb-1 block">Image Side</label>
                <div className="flex gap-1.5">
                  {[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }].map(opt => (
                    <button key={opt.value} type="button" onClick={() => updateSettings('image_side', opt.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.image_side || 'left') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Text Alignment</label>
            <div className="flex gap-1.5">
              {[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }].map(opt => {
                const def = section.layout === 'split' ? 'left' : 'center';
                return (
                  <button key={opt.value} type="button" onClick={() => updateSettings('text_align', opt.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.text_align || def) === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Content Width</label>
            <div className="flex gap-1.5">
              {[{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => updateSettings('content_width', opt.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.content_width || 'normal') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-secondary mb-1 block">Vertical Spacing</label>
            <div className="flex gap-1.5">
              {[{ value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'spacious', label: 'Spacious' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => updateSettings('padding', opt.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.padding || 'normal') === opt.value ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-fg-secondary font-medium block">Button (optional)</label>
            <input type="text" value={settings.cta_label || ''} onChange={e => updateSettings('cta_label', e.target.value)} className={inputClass} placeholder="Button label (e.g. Commander)" />
            <input type="text" value={settings.cta_link || ''} onChange={e => updateSettings('cta_link', e.target.value)} className={inputClass} placeholder="Link (e.g. /order)" />
          </div>
        </div>
      )}

      {/* Content fields */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-fg-secondary">Content</h3>

        {/* About — multi-block editor */}
        {section.section_type === 'about' && (
          <AboutBlocksEditor content={content} updateContent={updateContent} restaurantId={restaurantId} />
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
            {/* Text position in the banner (horizontal + vertical → 9-way). */}
            <div className="space-y-1.5">
              <label className={labelClass}>Position du texte</label>
              <div className="flex gap-1.5">
                {[{ v: 'left', l: 'Gauche' }, { v: 'center', l: 'Centre' }, { v: 'right', l: 'Droite' }].map(o => (
                  <button key={o.v} type="button" onClick={() => updateSettings('text_align', o.v)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.text_align || 'center') === o.v ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>{o.l}</button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {[{ v: 'top', l: 'Haut' }, { v: 'center', l: 'Milieu' }, { v: 'bottom', l: 'Bas' }].map(o => (
                  <button key={o.v} type="button" onClick={() => updateSettings('vertical_align', o.v)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${(settings.vertical_align || 'center') === o.v ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-[var(--divider)] text-fg-secondary hover:border-fg-secondary/30'}`}>{o.l}</button>
                ))}
              </div>
            </div>

            {/* Button: text + typography (font/size/weight/color) + background color. */}
            <TextFieldWithTypography
              label="Bouton — texte"
              value={content.cta_text || ''}
              onChange={v => updateContent('cta_text', v)}
              placeholder="Commander"
              fieldPrefix="cta"
              settings={settings}
              onSettingChange={updateSettings}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Lien du bouton</label>
                <input type="text" value={content.cta_link || ''} onChange={e => updateContent('cta_link', e.target.value)} className={inputClass} placeholder="/order" />
              </div>
              <div>
                <label className={labelClass}>Couleur du bouton</label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={settings.cta_bg_color || '#000000'} onChange={e => updateSettings('cta_bg_color', e.target.value)} className="w-8 h-8 rounded border border-[var(--divider)] cursor-pointer shrink-0" />
                  <input type="text" value={settings.cta_bg_color || ''} onChange={e => updateSettings('cta_bg_color', e.target.value)} className={inputClass} placeholder="défaut" />
                </div>
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

        {section.section_type === 'feature_cards' && (
          <FeatureCardsEditor content={content} updateContent={updateContent} restaurantId={restaurantId} />
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

export function ActionButtonsEditor({ content, updateContent }: {
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

// Editor for the feature_cards section: a grid of image cards, each with an
// image, a title (rendered as a button label), an optional subtitle, and a link
// to a page/URL. Modeled on ActionButtonsEditor, adding per-card image upload.
export function FeatureCardsEditor({ content, updateContent, restaurantId }: {
  content: Record<string, any>;
  updateContent: (key: string, value: any) => void;
  restaurantId: number;
}) {
  const cards: any[] = content.cards || [];

  function updateCard(idx: number, field: string, value: string) {
    updateContent('cards', cards.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }
  function addCard() {
    updateContent('cards', [...cards, { image_url: '', title: '', subtitle: '', link: '' }]);
  }
  function removeCard(idx: number) {
    updateContent('cards', cards.filter((_, i) => i !== idx));
  }

  const inputClass = "w-full border border-[var(--divider)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-fg-primary";
  const labelClass = "text-xs text-fg-secondary mb-1 block";

  return (
    <div className="space-y-4">
      {cards.map((card, idx) => (
        <div key={idx} className="p-4 rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg-primary">Card {idx + 1}</span>
            <button onClick={() => removeCard(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
          <SectionImageUploader
            restaurantId={restaurantId}
            currentUrl={card.image_url}
            onUploaded={(url) => updateCard(idx, 'image_url', url)}
            onRemove={() => updateCard(idx, 'image_url', '')}
            label="Image"
          />
          <div>
            <label className={labelClass}>Title</label>
            <input type="text" value={card.title || ''} onChange={e => updateCard(idx, 'title', e.target.value)} className={inputClass} placeholder="Nos Plateaux" />
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <input type="text" value={card.subtitle || ''} onChange={e => updateCard(idx, 'subtitle', e.target.value)} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className={labelClass}>Link</label>
            <input type="text" value={card.link || ''} onChange={e => updateCard(idx, 'link', e.target.value)} className={inputClass} placeholder="/catering, /order, a page slug, or https://..." />
          </div>
        </div>
      ))}
      <button
        onClick={addCard}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--divider)] text-sm font-medium text-fg-secondary hover:border-brand-500 hover:text-brand-500 transition-all"
      >
        + Add Card
      </button>
    </div>
  );
}
