"use client";

import { useState, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { uploadSectionImage } from "@/lib/api";
import { WEBSITE_FONT_FAMILIES } from "@/lib/website-fonts";

const FONT_OPTIONS = WEBSITE_FONT_FAMILIES;

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

/** Edits image and text blocks preserved in published About sections. */
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

/** Edits the items and presentation of a picnic basket section. */
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


/** Uploads an image for the current restaurant and reports upload failures. */
export function SectionImageUploader({ restaurantId, currentUrl, onUploaded, onRemove, label, className, alwaysShowActions = false, mediaField, actionLabels }: {
  restaurantId: number;
  currentUrl?: string;
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  label?: string;
  className?: string;
  alwaysShowActions?: boolean;
  mediaField?: string;
  actionLabels?: { upload: string; replace: string; remove: string; uploading: string };
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
        <div className={alwaysShowActions ? 'overflow-hidden rounded-lg border border-[var(--divider)]' : 'relative group'}>
          <img src={currentUrl} alt="" className="rounded-lg max-h-32 object-cover w-full" />
          <div className={alwaysShowActions ? 'flex items-center gap-2 p-2' : 'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2'}>
            <button type="button" onClick={() => inputRef.current?.click()} className="px-2 py-1 bg-white rounded text-xs font-medium" disabled={uploading}>
              {uploading ? actionLabels?.uploading ?? 'Uploading...' : actionLabels?.replace ?? 'Replace'}
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium">{actionLabels?.remove ?? 'Remove'}</button>
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
            <span>{actionLabels?.uploading ?? 'Uploading...'}</span>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>{actionLabels?.upload ?? 'Click to upload image'}</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" data-media-field={mediaField} />
    </div>
  );
}


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

/** Edits a section’s configured action links. */
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
