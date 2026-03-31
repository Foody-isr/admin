'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, createCategory, updateCategory,
  Menu, MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function GroupPage() {
  const { restaurantId, menuId, groupId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const isNew = groupId === 'new';
  const gid = isNew ? null : Number(groupId);
  const router = useRouter();
  const { t } = useI18n();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [showParent, setShowParent] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listMenus(rid).then((menus) => {
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      const cats = found?.categories ?? [];
      setCategories(cats);
      if (!isNew && gid) {
        const editing = cats.find((c) => c.id === gid);
        if (editing) {
          setName(editing.name);
          setParentId(editing.parent_id ?? undefined);
          setShowParent(!!editing.parent_id);
        }
      }
    }).finally(() => setLoading(false));
  }, [rid, mid, isNew, gid]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        await createCategory(rid, { name, menu_id: mid, parent_id: parentId });
      } else if (gid) {
        await updateCategory(rid, gid, { name, menu_id: mid, parent_id: parentId });
      }
      router.push(`/${rid}/menu/menus/${mid}`);
    } finally {
      setSaving(false);
    }
  };

  const parentOptions = categories.filter((c) => c.id !== gid);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push(`/${rid}/menu/menus/${mid}`)}
          className="p-2 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold text-fg-primary">
          {isNew ? t('createGroup') : t('edit')}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm px-5 py-2 rounded-full"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-0">
        {/* Title (only on create) */}
        {isNew && (
          <h1 className="text-xl font-bold text-fg-primary mb-6">{t('createGroup')}</h1>
        )}

        {/* Name */}
        <div className="mb-6">
          <input
            autoFocus
            className="input w-full text-base"
            placeholder={t('groupName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Image placeholder */}
        <div className="border-2 border-dashed border-[var(--divider)] rounded-xl p-8 flex flex-col items-center gap-2 text-sm text-fg-tertiary mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" />
          </svg>
          <span>{t('comingSoon')}</span>
        </div>

        {/* ── Parent group ── */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-fg-primary">{t('parentGroup')}</p>
              <p className="text-xs text-fg-tertiary">{t('parentGroupDesc')}</p>
            </div>
          </div>
          <button onClick={() => setShowParent(!showParent)} className="text-sm font-medium underline text-fg-primary shrink-0">
            {t('edit')}
          </button>
        </div>
        {showParent && (
          <div className="pb-4">
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
              className="input w-full text-sm"
            >
              <option value="">— {t('none')} —</option>
              {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="border-t border-[var(--divider)]" />

        {/* ── Articles ── */}
        <div className="py-6">
          <h3 className="text-lg font-bold text-fg-primary mb-4">{t('articles')}</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-fg-primary">{t('articles')}</p>
                <p className="text-xs text-fg-tertiary">{t('noItemsSelected')}</p>
              </div>
            </div>
            <button className="text-sm font-medium underline text-fg-primary" onClick={() => alert(t('comingSoon'))}>
              {t('add')}
            </button>
          </div>
        </div>

        <div className="border-t border-[var(--divider)]" />

        {/* ── Carte et disponibilité ── */}
        <div className="py-6">
          <h3 className="text-lg font-bold text-fg-primary mb-4">{t('menuAndAvailability')}</h3>

          {/* Menu */}
          <div className="flex items-center justify-between py-3 border-b border-[var(--divider)]">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <div>
                <p className="text-sm font-medium text-fg-primary">Menu</p>
                <p className="text-xs text-fg-tertiary">{menu?.name ?? '—'}</p>
              </div>
            </div>
            <button className="text-sm font-medium underline text-fg-primary">{t('edit')}</button>
          </div>

          {/* Hours */}
          <div className="flex items-center justify-between py-3 border-b border-[var(--divider)]">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-fg-primary">{t('hoursLabel')}</p>
                <p className="text-xs text-fg-tertiary max-w-md">{t('hoursDescription')}</p>
              </div>
            </div>
            <button className="text-sm font-medium underline text-fg-primary shrink-0">{t('edit')}</button>
          </div>

          {/* Hide on all channels */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
              <div>
                <p className="text-sm font-medium text-fg-primary">{t('hideOnAllChannels')}</p>
                <p className="text-xs text-fg-tertiary max-w-md">{t('hideOnAllChannelsDesc')}</p>
              </div>
            </div>
            <div className="w-10 h-6 rounded-full bg-gray-200 relative cursor-pointer shrink-0">
              <div className="w-5 h-5 rounded-full bg-white shadow absolute top-0.5 left-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
