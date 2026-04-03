'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, createMenuItem, uploadMenuItemImage, updateMenuItem,
  listMenus, addItemsToGroup, createGroup,
  MenuCategory, Menu,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, ChevronDownIcon, ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

export default function NewItemPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const defaultCatId = searchParams.get('category') ? Number(searchParams.get('category')) : 0;

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCatId);
  const [isActive, setIsActive] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Menus / Cartes state
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(new Set());
  const [menuSearch, setMenuSearch] = useState('');

  useEffect(() => {
    Promise.all([
      getAllCategories(rid),
      listMenus(rid),
    ]).then(([cats, m]) => {
      setCategories(cats);
      if (!categoryId && cats.length > 0) setCategoryId(cats[0].id);
      setMenus(m);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      const item = await createMenuItem(rid, {
        name: name.trim(),
        description,
        price: parseFloat(price),
        is_active: isActive,
        category_id: categoryId,
      });
      // Upload image if pending
      if (pendingImage) {
        const url = await uploadMenuItemImage(rid, item.id, pendingImage);
        await updateMenuItem(rid, item.id, { image_url: url });
      }
      // Assign to selected menus
      for (const menuId of Array.from(selectedMenuIds)) {
        const menu = menus.find((m) => m.id === menuId);
        const groups = menu?.groups ?? [];
        let groupId: number;
        if (groups.length > 0) {
          groupId = groups[0].id;
        } else {
          const newGroup = await createGroup(rid, { menu_id: menuId, name: menu?.name ?? 'Default' });
          groupId = newGroup.id;
        }
        await addItemsToGroup(rid, groupId, [item.id]);
      }
      router.push(`/${rid}/menu/items`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
  };

  const goBack = () => router.push(`/${rid}/menu/items`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
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
        <h1 className="text-2xl font-bold text-fg-primary mb-8">{t('createItem')}</h1>

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
                if (file) handleFileSelect(file);
              }}
            />
            {imagePreview ? (
              <div
                className="relative rounded-card overflow-hidden cursor-pointer group"
                style={{ border: '2px solid var(--divider)' }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover" />
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
                <ArrowUpTrayIcon className="w-8 h-8 text-fg-secondary mb-2" />
                <p className="text-sm text-fg-secondary">
                  {t('dropImagesHere')}, <span className="text-brand-500 underline cursor-pointer">{t('browse')}</span>
                </p>
              </div>
            )}
            {/* Variants */}
            <div style={{ borderTop: '1px solid var(--divider)' }} className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('variants')}</h3>
                <span className="text-sm text-fg-secondary">{t('saveFirstToAdd')}</span>
              </div>
              <p className="text-sm text-fg-secondary">{t('variantsDescription')}</p>
            </div>

            {/* Modifiers */}
            <div style={{ borderTop: '1px solid var(--divider)' }} className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-fg-primary">{t('modifiers')}</h3>
                <span className="text-sm text-fg-secondary">{t('saveFirstToAdd')}</span>
              </div>
              <p className="text-sm text-fg-secondary">{t('modifiersDescription')}</p>
            </div>
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

            <div className="card space-y-3">
              <h3 className="font-bold text-fg-primary">{t('menus')}</h3>
              <p className="text-xs text-fg-secondary">{t('cartesDescription')}</p>
              <input
                type="text"
                placeholder={t('addToMenus')}
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="input text-sm"
              />
              {menus.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {menus
                    .filter((m) => !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase()))
                    .map((menu) => (
                    <label key={menu.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMenuIds.has(menu.id)}
                        onChange={() => {
                          const next = new Set(selectedMenuIds);
                          if (next.has(menu.id)) next.delete(menu.id);
                          else next.add(menu.id);
                          setSelectedMenuIds(next);
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-fg-primary">{menu.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-secondary italic">{t('noMenusAvailable') || 'No menus available'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
