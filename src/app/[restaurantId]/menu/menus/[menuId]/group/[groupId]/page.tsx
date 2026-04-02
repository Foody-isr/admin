'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, getAllCategories, createGroup, updateGroup,
  getGroupHours, setGroupHours, addItemsToGroup,
  Menu, MenuGroup, MenuCategory, MenuItem, GroupAvailabilityHour,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, MagnifyingGlassIcon, PlusIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Modal types ────────────────────────────────────────────────────────────

type ModalView = null | 'addChoice' | 'pickItems' | 'pickCategory';

// ─── Main page ──────────────────────────────────────────────────────────────

export default function GroupPage() {
  const { restaurantId, menuId, groupId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const isNew = groupId === 'new';
  const gid = isNew ? null : Number(groupId);
  const router = useRouter();
  const { t } = useI18n();

  const [allCats, setAllCats] = useState<MenuCategory[]>([]);
  const [allMenus, setAllMenus] = useState<Menu[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<number>(mid);
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [showParent, setShowParent] = useState(false);
  const [followsMenuHours, setFollowsMenuHours] = useState(true);
  const [isHidden, setIsHidden] = useState(false);
  const [hours, setHours] = useState<GroupAvailabilityHour[]>([]);

  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editor visibility
  const [showHoursEditor, setShowHoursEditor] = useState(false);

  // Modal state
  const [modalView, setModalView] = useState<ModalView>(null);

  // Pending items to assign on save (for new groups)
  const [pendingItemIds, setPendingItemIds] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listMenus(rid), getAllCategories(rid)]).then(async ([menus, fullCats]) => {
      setAllCats(fullCats);
      setAllMenus(menus);
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      const grps = found?.groups ?? [];
      setGroups(grps);
      if (!isNew && gid) {
        const editing = grps.find((g) => g.id === gid);
        if (editing) {
          setName(editing.name);
          setImageUrl(editing.image_url ?? '');
          setParentId(editing.parent_id ?? undefined);
          setShowParent(!!editing.parent_id);
          setFollowsMenuHours(editing.follows_menu_hours ?? true);
          setIsHidden(editing.is_hidden ?? false);
          if (!editing.follows_menu_hours) {
            const h = await getGroupHours(rid, gid).catch(() => []);
            setHours(h);
          }
        }
      }
    }).finally(() => setLoading(false));
  }, [rid, mid, isNew, gid]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      let savedId = gid;
      if (isNew) {
        const g = await createGroup(rid, {
          name,
          menu_id: selectedMenuId,
          parent_id: parentId,
          follows_menu_hours: followsMenuHours,
          is_hidden: isHidden,
        });
        savedId = g.id;
      } else if (gid) {
        await updateGroup(rid, gid, {
          name,
          menu_id: selectedMenuId,
          parent_id: parentId,
          follows_menu_hours: followsMenuHours,
          is_hidden: isHidden,
        });
      }
      if (!followsMenuHours && savedId) {
        await setGroupHours(rid, savedId, hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({
          day_of_week, open_time, close_time, is_closed,
        })));
      }
      // Assign any pending items that were selected before save
      if (pendingItemIds.size > 0 && savedId) {
        await addItemsToGroup(rid, savedId, Array.from(pendingItemIds));
      }
      router.push(`/${rid}/menu/menus/${mid}`);
    } finally {
      setSaving(false);
    }
  };

  const setHourField = (day: number, field: string, value: string | boolean) => {
    setHours((prev) => {
      const existing = prev.find((h) => h.day_of_week === day);
      if (existing) return prev.map((h) => h.day_of_week === day ? { ...h, [field]: value } : h);
      return [...prev, { id: 0, menu_group_id: gid ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false, [field]: value }];
    });
  };

  const getHour = (day: number): GroupAvailabilityHour =>
    hours.find((h) => h.day_of_week === day) ?? { id: 0, menu_group_id: gid ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false };

  const handleImageUpload = async (_file: File) => {
    if (!gid) return;
    setUploading(true);
    try {
      // TODO: add dedicated group image upload endpoint
      // For now, images are set via updateGroup
      await updateGroup(rid, gid, { image_url: '' });
      setImageUrl('');
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

  const parentOptions = groups.filter((g: MenuGroup) => g.id !== gid);

  // All items across all categories (for item picker + resolving pending)
  const allItems = useMemo(() => {
    const items: MenuItem[] = [];
    for (const c of allCats) {
      for (const item of c.items ?? []) {
        items.push(item);
      }
    }
    return items;
  }, [allCats]);

  // Items belonging to this group (saved + pending)
  const savedGroupItems: MenuItem[] = (!isNew && gid)
    ? (groups.find((g: MenuGroup) => g.id === gid)?.items ?? [])
    : [];

  const pendingItems = useMemo(() => {
    if (pendingItemIds.size === 0) return [];
    return allItems.filter((item) => pendingItemIds.has(item.id));
  }, [allItems, pendingItemIds]);

  const groupItems = useMemo(() => {
    const savedIds = new Set(savedGroupItems.map((i) => i.id));
    return [...savedGroupItems, ...pendingItems.filter((i) => !savedIds.has(i.id))];
  }, [savedGroupItems, pendingItems]);

  // All categories (for category picker), excluding current group
  const allCategories = useMemo(() => {
    return allCats
      .filter((c) => c.id !== gid)
      .map((c) => ({ ...c, menuName: '' }));
  }, [allCats, gid]);

  const groupItemIds = useMemo(() => new Set<number>(groupItems.map((i) => i.id)), [groupItems]);

  const handleRemoveItem = async (item: MenuItem) => {
    if (!confirm(`${t('removeFromGroupConfirm')} "${item.name}"?`)) return;
    // Remove pending item (not yet saved) or do nothing for saved items
    // (saved items can be moved via the item editor's category selector)
    if (pendingItemIds.has(item.id)) {
      setPendingItemIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  // Add selected items to this group
  const handleAssignItems = async (itemIds: number[]) => {
    if (itemIds.length === 0) return;
    if (isNew) {
      setPendingItemIds((prev) => { const next = new Set(prev); itemIds.forEach((id) => next.add(id)); return next; });
      setModalView(null);
    } else if (gid) {
      await addItemsToGroup(rid, gid, itemIds);
      setModalView(null);
      load();
    }
  };

  // Import all items from selected categories into this group
  const handleImportFromCategories = async (catIds: number[]) => {
    if (catIds.length === 0) return;
    const itemsToImport: number[] = [];
    for (const cat of allCategories) {
      if (catIds.includes(cat.id)) {
        for (const item of cat.items ?? []) {
          itemsToImport.push(item.id);
        }
      }
    }
    if (itemsToImport.length === 0) return;
    if (isNew) {
      setPendingItemIds((prev) => { const next = new Set(prev); itemsToImport.forEach((id) => next.add(id)); return next; });
      setModalView(null);
    } else if (gid) {
      await addItemsToGroup(rid, gid, itemsToImport);
      setModalView(null);
      load();
    }
  };

  const openAddArticle = () => {
    setModalView('addChoice');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/${rid}/menu/menus/${mid}`)}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors rounded-full px-7 py-3 text-base"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-0">
        {isNew && (
          <h1 className="text-2xl font-bold text-fg-primary mb-8">{t('createGroup')}</h1>
        )}

        {/* Name */}
        <div className="mb-8">
          <input
            autoFocus
            className="input w-full text-lg"
            placeholder={t('groupName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            className="relative rounded-xl overflow-hidden cursor-pointer group mb-8"
            style={{ border: '2px solid var(--divider)' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <img src={imageUrl} alt={name} className="w-full h-52 object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-base font-medium">
                {t('changeImage')}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-[var(--divider)] rounded-xl p-10 flex flex-col items-center gap-3 text-fg-tertiary mb-8 cursor-pointer hover:border-brand-500 hover:text-brand-500 transition-colors"
            onClick={() => !isNew && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="animate-spin w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full" />
            ) : (
              <>
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" />
                </svg>
                {isNew ? (
                  <p className="text-base text-center">{t('saveFirstToUpload')}</p>
                ) : (
                  <p className="text-base text-center">
                    {t('dragImageHere')}{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="text-brand-500 font-medium underline hover:text-brand-600"
                    >
                      {t('uploadAction')}
                    </button>
                    {' '}{t('or')}{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="text-brand-500 font-medium underline hover:text-brand-600"
                    >
                      {t('browseGallery')}
                    </button>
                    .
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Parent group */}
        <div className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <div>
              <p className="text-base font-medium text-fg-primary">{t('parentGroup')}</p>
              <p className="text-sm text-fg-tertiary">{t('parentGroupDesc')}</p>
            </div>
          </div>
          <button onClick={() => setShowParent(!showParent)} className="text-base font-medium underline text-fg-primary shrink-0">
            {t('edit')}
          </button>
        </div>
        {showParent && (
          <div className="pb-4">
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
              className="input w-full"
            >
              <option value="">— {t('none')} —</option>
              {parentOptions.map((g: MenuGroup) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        <div className="h-1 bg-[var(--divider)] rounded-full" />

        {/* Articles */}
        <div className="py-8">
          <h3 className="text-xl font-bold text-fg-primary mb-5">{t('articlesGroup')}</h3>
          {groupItems.length > 0 ? (
            <div className="space-y-0 rounded-xl border border-[var(--divider)] overflow-hidden">
              {groupItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                  onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-fg-primary truncate">{item.name}</p>
                    <p className="text-sm text-fg-tertiary">{item.price?.toFixed(2)} ₪</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveItem(item); }}
                    className="text-sm text-red-500 hover:text-red-600 font-medium shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                  >
                    {t('removeFromGroupConfirm')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4">
              <svg className="w-6 h-6 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
              <div>
                <p className="text-base font-medium text-fg-primary">{t('articlesGroup')}</p>
                <p className="text-sm text-fg-tertiary">{t('noItemsSelected')}</p>
              </div>
              <div className="flex-1" />
              <button className="text-base font-medium underline text-fg-primary shrink-0" onClick={openAddArticle}>
                {t('add')}
              </button>
            </div>
          )}
          {groupItems.length > 0 && (
            <div className="mt-4">
              <button className="text-base font-medium underline text-fg-primary" onClick={openAddArticle}>
                {t('addArticle')}
              </button>
            </div>
          )}
        </div>

        <div className="h-1 bg-[var(--divider)] rounded-full" />

        {/* Carte et disponibilite */}
        <div className="py-8">
          <h3 className="text-xl font-bold text-fg-primary mb-5">{t('menuAndAvailability')}</h3>

          {/* Menu */}
          <div className="flex items-center justify-between py-4 border-b border-[var(--divider)]">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <div>
                <p className="text-base font-medium text-fg-primary">Menu</p>
                <p className="text-sm text-fg-tertiary">{allMenus.find((m) => m.id === selectedMenuId)?.name ?? menu?.name ?? '—'}</p>
              </div>
            </div>
            <button onClick={() => setShowMenuPicker(true)} className="text-base font-medium underline text-fg-primary">{t('edit')}</button>
          </div>

          {/* Hours */}
          <div className="py-4 border-b border-[var(--divider)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div>
                  <p className="text-base font-medium text-fg-primary">{t('hoursLabel')}</p>
                  <p className="text-sm text-fg-tertiary max-w-md">{t('hoursDescription')}</p>
                </div>
              </div>
              <button onClick={() => { setShowHoursEditor(!showHoursEditor); if (followsMenuHours) setFollowsMenuHours(false); }} className="text-base font-medium underline text-fg-primary shrink-0">
                {t('edit')}
              </button>
            </div>
            {showHoursEditor && (
              <div className="mt-4 pl-9 space-y-2">
                <label className="flex items-center gap-2 text-base mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followsMenuHours}
                    onChange={(e) => setFollowsMenuHours(e.target.checked)}
                    className="rounded"
                  />
                  {t('followsMenuHours') || 'Use menu hours'}
                </label>
                {!followsMenuHours && DAY_LABELS.map((label, day) => {
                  const h = getHour(day);
                  return (
                    <div key={day} className="flex items-center gap-3 text-sm">
                      <span className="w-10 text-fg-secondary">{label}</span>
                      <label className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={h.is_closed} onChange={(e) => setHourField(day, 'is_closed', e.target.checked)} className="rounded" />
                        {t('closed')}
                      </label>
                      {!h.is_closed && (
                        <>
                          <input type="time" value={h.open_time} onChange={(e) => setHourField(day, 'open_time', e.target.value)} className="input-sm py-1.5 px-2 text-sm w-32" />
                          <span className="text-fg-secondary">–</span>
                          <input type="time" value={h.close_time} onChange={(e) => setHourField(day, 'close_time', e.target.value)} className="input-sm py-1.5 px-2 text-sm w-32" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hide on all channels */}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
              <div>
                <p className="text-base font-medium text-fg-primary">{t('hideOnAllChannels')}</p>
                <p className="text-sm text-fg-tertiary max-w-md">{t('hideOnAllChannelsDesc')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHidden(!isHidden)}
              className={`relative w-11 h-7 rounded-full transition-colors shrink-0 ${isHidden ? 'bg-brand-500' : 'bg-gray-200'}`}
            >
              <div className={`rounded-full bg-white shadow absolute top-0.5 transition-transform ${isHidden ? 'translate-x-[18px]' : 'translate-x-0.5'}`} style={{ width: 22, height: 22 }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modalView === 'addChoice' && (
        <AddChoiceModal
          t={t}
          onClose={() => setModalView(null)}
          onPickIndividually={() => setModalView('pickItems')}
          onPickFromCategory={() => setModalView('pickCategory')}
        />
      )}
      {modalView === 'pickItems' && (
        <PickItemsModal
          t={t}
          allItems={allItems}
          groupItemIds={groupItemIds}
          onClose={() => setModalView(null)}
          onDone={handleAssignItems}
          onCreateNew={() => { setModalView(null); router.push(`/${rid}/menu/items/new${gid ? `?category=${gid}` : ''}`); }}
        />
      )}
      {modalView === 'pickCategory' && (
        <PickCategoryModal
          t={t}
          allCategories={allCategories}
          onClose={() => setModalView(null)}
          onDone={handleImportFromCategories}
        />
      )}
      {showMenuPicker && (
        <MenuPickerModal
          t={t}
          menus={allMenus}
          selectedMenuId={selectedMenuId}
          restaurantName={allMenus[0]?.name ? undefined : undefined}
          onSelect={(menuId) => { setSelectedMenuId(menuId); setShowMenuPicker(false); }}
          onClose={() => setShowMenuPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Modal 1: Add Choice ─────────────────────────────────────────────────────

function AddChoiceModal({ t, onClose, onPickIndividually, onPickFromCategory }: {
  t: (k: string) => string;
  onClose: () => void;
  onPickIndividually: () => void;
  onPickFromCategory: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-8" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center mb-5">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-fg-primary mb-6">{t('addArticle')}</h2>
        <div className="space-y-0 rounded-xl border border-[var(--divider)] overflow-hidden">
          <button
            onClick={onPickIndividually}
            className="w-full flex items-center justify-between px-6 py-5 hover:bg-[var(--surface-subtle)] transition-colors text-left"
          >
            <div>
              <p className="text-base font-bold text-fg-primary">{t('addIndividually')}</p>
              <p className="text-sm text-fg-tertiary mt-1">{t('addIndividuallyDesc')}</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-fg-tertiary shrink-0" />
          </button>
          <div className="border-t border-[var(--divider)]" />
          <button
            onClick={onPickFromCategory}
            className="w-full flex items-center justify-between px-6 py-5 hover:bg-[var(--surface-subtle)] transition-colors text-left"
          >
            <div>
              <p className="text-base font-bold text-fg-primary">{t('addFromCategory')}</p>
              <p className="text-sm text-fg-tertiary mt-1">{t('addFromCategoryDesc')}</p>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-fg-tertiary shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal 2: Pick Items Individually ────────────────────────────────────────

function PickItemsModal({ t, allItems, groupItemIds, onClose, onDone, onCreateNew }: {
  t: (k: string) => string;
  allItems: MenuItem[];
  groupItemIds: Set<number>;
  onClose: () => void;
  onDone: (ids: number[]) => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter((item) =>
      !groupItemIds.has(item.id) && (!q || item.name.toLowerCase().includes(q))
    );
  }, [allItems, groupItemIds, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 pb-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={onClose} className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => onDone(Array.from(selected))}
              disabled={selected.size === 0}
              className="btn-secondary rounded-full disabled:opacity-40"
            >
              {t('done')}
            </button>
          </div>
          <h2 className="text-2xl font-bold text-fg-primary mb-5">{t('addArticles')}</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-fg-tertiary" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="flex items-center justify-between text-sm text-fg-secondary mb-3">
            <span>{t('articlesGroup')}</span>
            <span>{selected.size} {t('selected')}</span>
          </div>
          <div className="border-t border-[var(--divider)]" />

          {/* Create new */}
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
              <PlusIcon className="w-5 h-5 text-fg-primary" />
            </div>
            <span className="text-base font-medium text-fg-primary">{t('createNewItems')}</span>
          </button>

          {/* Items list */}
          {filtered.map((item) => (
            <label
              key={item.id}
              className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-fg-primary truncate">{item.name}</p>
                {(item.variant_groups?.length ?? 0) > 0 && (
                  <p className="text-sm text-fg-tertiary">{item.variant_groups!.length} {t('variants')}</p>
                )}
              </div>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="w-5 h-5 rounded border-2 border-[var(--divider)] shrink-0"
              />
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-fg-tertiary text-center py-8">{t('noResults')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal 3: Pick from Category ─────────────────────────────────────────────

function PickCategoryModal({ t, allCategories, onClose, onDone }: {
  t: (k: string) => string;
  allCategories: (MenuCategory & { menuName: string })[];
  onClose: () => void;
  onDone: (catIds: number[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allCategories.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [allCategories, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 pb-5">
          <div className="flex items-center justify-between mb-5">
            <button onClick={onClose} className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => onDone(Array.from(selected))}
              disabled={selected.size === 0}
              className="btn-secondary rounded-full disabled:opacity-40"
            >
              {t('add')}
            </button>
          </div>
          <h2 className="text-2xl font-bold text-fg-primary mb-5">{t('addFromCategoryTitle')}</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-fg-tertiary" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('searchCategories')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {filtered.map((cat) => {
            const itemCount = cat.items?.length ?? 0;
            return (
              <label
                key={cat.id}
                className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-fg-primary truncate">{cat.name}</p>
                  <p className="text-sm text-fg-tertiary">{itemCount} {itemCount === 1 ? 'article' : 'articles'}</p>
                </div>
                <input
                  type="checkbox"
                  checked={selected.has(cat.id)}
                  onChange={() => toggle(cat.id)}
                  className="w-5 h-5 rounded border-2 border-[var(--divider)] shrink-0"
                />
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-fg-tertiary text-center py-8">{t('noResults')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Menu Picker ──────────────────────────────────────────────────────

function MenuPickerModal({ t, menus, selectedMenuId, onSelect, onClose }: {
  t: (k: string) => string;
  menus: Menu[];
  selectedMenuId: number;
  restaurantName?: string;
  onSelect: (menuId: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(selectedMenuId);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return menus.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [menus, search]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col border border-[var(--divider)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => onSelect(picked)}
              className="bg-fg-primary text-[var(--bg)] font-medium px-6 py-2.5 rounded-full text-sm hover:opacity-90 transition-opacity"
            >
              {t('save')}
            </button>
          </div>
          <h2 className="text-xl font-bold text-fg-primary mb-4">{t('assignGroupToMenu')}</h2>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-fg-tertiary" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('searchByMenuName')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Menu list */}
        <div className="px-6 pb-6">
          {filtered.map((m) => (
            <label
              key={m.id}
              className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
              onClick={() => setPicked(m.id)}
            >
              <svg className="w-6 h-6 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-fg-primary">{m.name}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${picked === m.id ? 'border-fg-primary' : 'border-[var(--divider)]'}`}>
                {picked === m.id && <div className="w-2.5 h-2.5 rounded-full bg-fg-primary" />}
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
