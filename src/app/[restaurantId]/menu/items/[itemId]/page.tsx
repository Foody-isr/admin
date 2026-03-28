'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getMenu, updateMenuItem, deleteModifier, uploadMenuItemImage,
  MenuCategory, MenuItem, MenuItemModifier,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, PhotoIcon, ChevronDownIcon, TrashIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

export default function EditItemPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const cats = await getMenu(rid);
      setCategories(cats);
      // Find the item across all categories
      for (const cat of cats) {
        const found = (cat.items ?? []).find((i) => i.id === iid);
        if (found) {
          setItem(found);
          setName(found.name);
          setPrice(String(found.price));
          setDescription(found.description ?? '');
          setCategoryId(found.category_id);
          setIsActive(found.is_active);
          setImageUrl(found.image_url ?? '');
          break;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      await updateMenuItem(rid, iid, {
        name: name.trim(),
        description,
        price: parseFloat(price),
        is_active: isActive,
        category_id: categoryId,
        image_url: imageUrl,
      });
      router.push(`/${rid}/menu/items`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadMenuItemImage(rid, iid, file);
      setImageUrl(url);
      // Also persist to DB immediately
      await updateMenuItem(rid, iid, { image_url: url });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageUpload(file);
  };

  const handleDeleteModifier = async (modId: number) => {
    if (!confirm(t('deleteThisModifier'))) return;
    await deleteModifier(rid, modId);
    loadData();
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-20">
        <p className="text-fg-secondary">Item not found</p>
        <button onClick={goBack} className="mt-4 text-brand-500 hover:underline">{t('back')}</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <button onClick={goBack}
          className="w-10 h-10 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
          style={{ border: '1px solid var(--divider)' }}>
          <XMarkIcon className="w-5 h-5" />
        </button>
        <button onClick={handleSave} disabled={saving || !name.trim() || !price}
          className="btn-primary px-6 disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-fg-primary mb-8">{t('editItem')}</h1>

        <div className="flex gap-8">
          {/* Left column — main form */}
          <div className="flex-1 space-y-5">
            {/* Name */}
            <div className="card p-0">
              <label className="block text-xs font-medium text-fg-secondary px-4 pt-3">{t('nameRequired')}</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 pb-3 pt-1 text-base bg-transparent border-0 outline-none text-fg-primary"
              />
            </div>

            {/* Price */}
            <div className="card p-0">
              <label className="block text-xs font-medium text-fg-secondary px-4 pt-3">{t('price')}</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-4 pb-3 pt-1 text-base bg-transparent border-0 outline-none text-fg-primary pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-secondary">ea</span>
              </div>
            </div>

            {/* Description */}
            <div className="card p-0">
              <textarea
                placeholder={t('customerDescription')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 text-sm bg-transparent border-0 outline-none text-fg-primary resize-y"
              />
            </div>

            {/* Image upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            {imageUrl ? (
              <div
                className="relative rounded-card overflow-hidden cursor-pointer group"
                style={{ border: '2px solid var(--divider)' }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <img src={imageUrl} alt={name} className="w-full h-48 object-cover" />
                {uploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                  <ArrowUpTrayIcon className="w-8 h-8 text-white mb-2" />
                  <p className="text-sm text-white">{t('dropImagesHere')}</p>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center py-12 rounded-card cursor-pointer hover:border-brand-500 transition-colors"
                style={{ border: '2px dashed var(--divider)', background: 'var(--surface-subtle)' }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-8 h-8 text-fg-secondary mb-2" />
                    <p className="text-sm text-fg-secondary">
                      {t('dropImagesHere')}, <span className="text-brand-500 underline cursor-pointer">{t('browse')}</span>
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Modifiers */}
            {(item.modifiers ?? []).length > 0 && (
              <div>
                <h3 className="text-base font-bold text-fg-primary mb-3">{t('modifiers')}</h3>
                <div className="space-y-2">
                  {(item.modifiers ?? []).map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between py-2.5 px-4 rounded-standard" style={{ background: 'var(--surface-subtle)' }}>
                      <div>
                        <span className="text-sm font-medium text-fg-primary">{mod.name}</span>
                        <span className="text-xs text-fg-secondary ml-2">({mod.action})</span>
                        {mod.category && <span className="text-xs text-fg-secondary ml-2">· {mod.category}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {mod.price_delta !== 0 && (
                          <span className="text-sm text-fg-secondary">
                            {mod.price_delta > 0 ? '+' : ''}₪{mod.price_delta.toFixed(2)}
                          </span>
                        )}
                        <button onClick={() => handleDeleteModifier(mod.id)} className="p-1 rounded-md hover:bg-red-500/10">
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — sidebar cards */}
          <div className="w-72 space-y-4 flex-shrink-0">
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-fg-primary">{t('status')}</h3>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`text-sm font-medium px-3 py-1 rounded-standard flex items-center gap-1 ${
                    isActive ? 'text-status-ready' : 'text-fg-secondary'
                  }`}
                  style={{ background: isActive ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}
                >
                  {isActive ? t('available') : t('unavailable')}
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-fg-primary">{t('categories')}</h3>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="input text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
