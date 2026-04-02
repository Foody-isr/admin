'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, createMenu, updateMenu, deleteMenu,
  setMenuHours, getMenuHours, getRestaurant,
  Menu, MenuAvailabilityHour, Restaurant,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EllipsisHorizontalIcon,
  Bars3Icon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type TFn = (k: string) => string;

function menuAbbr(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function channelCount(m: Menu): number {
  return (m.pos_enabled ? 1 : 0) + (m.web_enabled ? 1 : 0);
}

function channelsSummary(m: Menu, t: TFn): string {
  const n = channelCount(m);
  if (n === 0) return t('noChannels');
  return t('nChannels').replace('{n}', String(n));
}

function channelsMeta(m: Menu, t: TFn): string {
  const parts = [m.pos_enabled && t('posSystem'), m.web_enabled && 'Web'].filter(Boolean) as string[];
  if (parts.length === 0) return t('noChannels');
  if (parts.length === 1) return parts[0];
  return `${parts[0]}+ ${parts.length - 1} ${t('andNMore').replace('{n}', String(parts.length - 1)).replace(/^\+ \d+ /, '')}`;
}

function hoursRange(hours: MenuAvailabilityHour[]): string | null {
  if (!hours || hours.length === 0) return null;
  const open = hours.filter((h) => !h.is_closed);
  if (open.length === 0) return null;
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const first = open[0];
  const last = open[open.length - 1];
  const firstName = dayNames[(first.day_of_week + 6) % 7] ?? DAY_LABELS[first.day_of_week];
  const lastName = dayNames[(last.day_of_week + 6) % 7] ?? DAY_LABELS[last.day_of_week];
  if (first.day_of_week === last.day_of_week) return `${firstName}, ${first.open_time} - ${first.close_time}`;
  return `${firstName} - ${lastName}, ${first.open_time} - ${last.close_time}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenusPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'pos' | 'web'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isReordering, setIsReordering] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: Menu }>({ open: false });
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    return listMenus(rid).then(setMenus).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); getRestaurant(rid).then(setRestaurant).catch(() => null); }, [reload, rid]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenDropdown(null);
      if (channelRef.current && !channelRef.current.contains(e.target as Node)) setChannelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (m: Menu) => {
    if (!confirm(`${t('deleteMenu')} "${m.name}"?`)) return;
    await deleteMenu(rid, m.id);
    setOpenDropdown(null);
    reload();
  };

  // Drag-to-reorder
  const dragSource = useRef<number | null>(null);
  const handleDragStart = (index: number) => { dragSource.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragSource.current;
    if (from === null || from === index) return;
    const reordered = [...menus];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(index, 0, moved);
    dragSource.current = index;
    setMenus(reordered);
  };
  const handleDrop = async () => {
    dragSource.current = null;
    await Promise.all(menus.map((m, i) => updateMenu(rid, m.id, { sort_order: i })));
  };

  const filtered = menus.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (channelFilter === 'pos' && !m.pos_enabled) return false;
    if (channelFilter === 'web' && !m.web_enabled) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg-primary">{t('menus')}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setIsReordering(!isReordering); if (!isReordering) setViewMode('grid'); }}
            className="btn-secondary text-sm px-5 py-2 rounded-full"
          >
            {isReordering ? t('doneReordering') : t('reorder')}
          </button>
          <button
            onClick={() => setEditModal({ open: true })}
            className="btn-primary flex items-center gap-1.5 text-sm px-5 py-2 rounded-full"
          >
            {t('createMenu')}
          </button>
        </div>
      </div>

      <p className="text-sm text-fg-secondary max-w-3xl leading-relaxed">
        {t('carteDescription')}
      </p>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xl">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-tertiary pointer-events-none" />
          <input
            className="input pl-10 text-sm h-11 w-full rounded-full"
            placeholder={t('searchByMenuName')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Channel filter dropdown */}
        <div className="relative" ref={channelRef}>
          <button
            onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
            className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
          >
            <span>{t('salesChannels')}</span>
            <span className="font-bold">
              {channelFilter === 'all' ? t('all') : channelFilter === 'pos' ? 'POS' : 'Web'}
            </span>
            <ChevronDownIcon className="w-4 h-4 text-fg-tertiary" />
          </button>
          {channelDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-44 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
              {(['all', 'pos', 'web'] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => { setChannelFilter(val); setChannelDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${channelFilter === val ? 'bg-[var(--surface-subtle)] font-medium' : 'hover:bg-[var(--surface-subtle)]'}`}
                >
                  {val === 'all' ? t('all') : val === 'pos' ? 'POS' : 'Web'}
                </button>
              ))}
            </div>
          )}
        </div>
        {!isReordering && (
          <div className="flex items-center border border-[var(--divider)] rounded-full overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-[var(--surface-subtle)]' : 'hover:bg-[var(--surface-subtle)]'}`}
            >
              <Squares2X2Icon className="w-4 h-4 text-fg-secondary" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 border-l border-[var(--divider)] transition-colors ${viewMode === 'list' ? 'bg-[var(--surface-subtle)]' : 'hover:bg-[var(--surface-subtle)]'}`}
            >
              <ListBulletIcon className="w-4 h-4 text-fg-secondary" />
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <svg className="w-12 h-12 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-base text-fg-secondary text-center max-w-md">{t('noMenusYet')}</p>
          <button onClick={() => setEditModal({ open: true })} className="btn-primary mt-2 rounded-full">
            {t('createMenu')}
          </button>
        </div>
      )}

      {/* ── Grid mode: stacked full-width cards ── */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className="space-y-3">
          {filtered.map((m, index) => (
            <div
              key={m.id}
              draggable={isReordering}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onClick={() => !isReordering && router.push(`/${rid}/menu/menus/${m.id}`)}
              className={`flex items-center gap-4 px-5 py-4 rounded-xl border border-[var(--divider)] bg-[var(--surface)] hover:shadow-sm transition-shadow${isReordering ? ' cursor-grab active:cursor-grabbing' : ' cursor-pointer'}`}
            >
              {isReordering && <Bars3Icon className="w-4 h-4 text-fg-tertiary shrink-0" />}
              {/* Avatar */}
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-fg-secondary">{menuAbbr(m.name)}</span>
              </div>
              {/* Name + metadata */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-fg-primary">{m.name}</p>
                <div className="flex items-center gap-0 mt-0.5 text-xs text-fg-tertiary">
                  {restaurant?.name && (
                    <>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                        {restaurant.name}
                      </span>
                      <span className="mx-2 text-fg-tertiary">|</span>
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                    {channelsMeta(m, t)}
                  </span>
                  {!m.follows_restaurant_hours && m.availability_hours && hoursRange(m.availability_hours) && (
                    <>
                      <span className="mx-2 text-fg-tertiary">|</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        {hoursRange(m.availability_hours)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Dropdown */}
              {!isReordering && (
                <MenuDropdown
                  menu={m}
                  isOpen={openDropdown === m.id}
                  onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === m.id ? null : m.id); }}
                  onEdit={(e) => { e.stopPropagation(); setOpenDropdown(null); router.push(`/${rid}/menu/menus/${m.id}/edit`); }}
                  onDuplicate={(e) => { e.stopPropagation(); setOpenDropdown(null); alert(t('comingSoon')); }}
                  onDelete={(e) => { e.stopPropagation(); setOpenDropdown(null); handleDelete(m); }}
                  t={t}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── List mode: table with columns ── */}
      {filtered.length > 0 && viewMode === 'list' && (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider border-b-2 border-fg-primary">
                <th className="py-3 px-2 font-medium">{t('name')}</th>
                <th className="py-3 px-2 font-medium">{t('pointOfSale')}</th>
                <th className="py-3 px-2 font-medium">{t('salesChannels')}</th>
                <th className="py-3 px-2 font-medium w-12" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/${rid}/menu/menus/${m.id}`)}
                  className="border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-fg-secondary">{menuAbbr(m.name)}</span>
                      </div>
                      <span className="font-medium text-fg-primary">{m.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-2 text-fg-secondary">{restaurant?.name ?? '—'}</td>
                  <td className="py-3.5 px-2 text-fg-secondary">{channelsSummary(m, t)}</td>
                  <td className="py-3.5 px-2">
                    <MenuDropdown
                      menu={m}
                      isOpen={openDropdown === m.id}
                      onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === m.id ? null : m.id); }}
                      onEdit={(e) => { e.stopPropagation(); setOpenDropdown(null); router.push(`/${rid}/menu/menus/${m.id}/edit`); }}
                      onDuplicate={(e) => { e.stopPropagation(); setOpenDropdown(null); alert(t('comingSoon')); }}
                      onDelete={(e) => { e.stopPropagation(); setOpenDropdown(null); handleDelete(m); }}
                      t={t}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModal.open && (
        <MenuEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

// ─── Dropdown component ───────────────────────────────────────────────────────

function MenuDropdown({ menu: m, isOpen, onToggle, onEdit, onDuplicate, onDelete, t }: {
  menu: Menu;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  t: TFn;
}) {
  return (
    <div className="relative shrink-0">
      <button onClick={onToggle} className="p-1.5 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] text-fg-primary transition-colors">
        <EllipsisHorizontalIcon className="w-5 h-5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-10 z-30 w-64 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
          <button onClick={onEdit} className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-[var(--surface-subtle)] transition-colors">
            {t('editMenuDetails')}
          </button>
          <div className="border-t border-[var(--divider)]" />
          <button onClick={onDuplicate} className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-[var(--surface-subtle)] transition-colors">
            {t('duplicateMenu')}
          </button>
          <div className="border-t border-[var(--divider)]" />
          <button onClick={onDelete} className="w-full text-left px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors">
            {t('deleteMenu')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Edit / Create modal ──────────────────────────────────────────────────────

function MenuEditModal({ restaurantId, editing, onClose, onSaved }: {
  restaurantId: number;
  editing?: Menu;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [posEnabled, setPosEnabled] = useState(editing?.pos_enabled ?? true);
  const [webEnabled, setWebEnabled] = useState(editing?.web_enabled ?? true);
  const [followsRestaurantHours, setFollowsRestaurantHours] = useState(editing?.follows_restaurant_hours ?? true);
  const [hours, setHours] = useState<MenuAvailabilityHour[]>([]);
  const [loadingHours, setLoadingHours] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing && !followsRestaurantHours) {
      setLoadingHours(true);
      getMenuHours(restaurantId, editing.id).then(setHours).finally(() => setLoadingHours(false));
    }
  }, [editing, followsRestaurantHours, restaurantId]);

  const setHourField = (day: number, field: keyof Omit<MenuAvailabilityHour, 'id' | 'menu_id'>, value: string | boolean) => {
    setHours((prev) => {
      const existing = prev.find((h) => h.day_of_week === day);
      if (existing) return prev.map((h) => h.day_of_week === day ? { ...h, [field]: value } : h);
      return [...prev, { id: 0, menu_id: editing?.id ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false, [field]: value }];
    });
  };

  const getHour = (day: number): MenuAvailabilityHour =>
    hours.find((h) => h.day_of_week === day) ?? { id: 0, menu_id: editing?.id ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input = { name, is_active: isActive, pos_enabled: posEnabled, web_enabled: webEnabled, follows_restaurant_hours: followsRestaurantHours };
      const saved = editing ? await updateMenu(restaurantId, editing.id, input) : await createMenu(restaurantId, input);
      if (!followsRestaurantHours) {
        await setMenuHours(restaurantId, saved.id, hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({ day_of_week, open_time, close_time, is_closed })));
      }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={editing ? t('editMenu') : t('createMenu')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('menuName')}</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-2">{t('channels')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" checked={posEnabled} onChange={(e) => setPosEnabled(e.target.checked)} className="rounded" /> POS</label>
            <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" checked={webEnabled} onChange={(e) => setWebEnabled(e.target.checked)} className="rounded" /> Web</label>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" /> {t('active')}</label>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-2">{t('availability')}</label>
          <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
            <input type="checkbox" checked={followsRestaurantHours} onChange={(e) => setFollowsRestaurantHours(e.target.checked)} className="rounded" />
            {t('followsRestaurantHours')}
          </label>
          {!followsRestaurantHours && (
            <div className="space-y-2">
              {loadingHours ? <div className="text-xs text-fg-secondary">{t('loading')}</div> : DAY_LABELS.map((label, day) => {
                const h = getHour(day);
                return (
                  <div key={day} className="flex items-center gap-3 text-sm">
                    <span className="w-8 text-fg-secondary text-xs">{label}</span>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={h.is_closed} onChange={(e) => setHourField(day, 'is_closed', e.target.checked)} className="rounded" />{t('closed')}</label>
                    {!h.is_closed && (<><input type="time" value={h.open_time} onChange={(e) => setHourField(day, 'open_time', e.target.value)} className="input py-1 px-2 text-xs w-28" /><span className="text-fg-secondary text-xs">–</span><input type="time" value={h.close_time} onChange={(e) => setHourField(day, 'close_time', e.target.value)} className="input py-1 px-2 text-xs w-28" /></>)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? t('saving') : t('save')}</button>
        </div>
      </div>
    </Modal>
  );
}
