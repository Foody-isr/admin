'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
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
} from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a 2-letter abbreviation from a menu name. */
function menuAbbr(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type TFn = (k: string, p?: Record<string, string | number>) => string;

/** Builds a compact channels summary string. */
function channelsSummary(m: Menu, t: TFn): string {
  const active = [m.pos_enabled && 'POS', m.web_enabled && 'Web'].filter(Boolean) as string[];
  if (active.length === 0) return t('noChannels');
  if (active.length === 1) return active[0];
  return `${active[0]} + ${active.length - 1} ${t('andNMore', { n: active.length - 1 }).replace(/^\+ \d+ /, '')}`;
}

/** Formats custom hours as a compact range, e.g. "Lun - Dim, 09:00 - 17:00". */
function hoursRange(hours: MenuAvailabilityHour[]): string | null {
  if (!hours || hours.length === 0) return null;
  const open = hours.filter((h) => !h.is_closed);
  if (open.length === 0) return null;
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const first = open[0];
  const last = open[open.length - 1];
  const firstName = dayNames[(first.day_of_week + 6) % 7] ?? DAY_LABELS[first.day_of_week];
  const lastName = dayNames[(last.day_of_week + 6) % 7] ?? DAY_LABELS[last.day_of_week];
  if (first.day_of_week === last.day_of_week) {
    return `${firstName}, ${first.open_time} - ${first.close_time}`;
  }
  return `${firstName} - ${lastName}, ${first.open_time} - ${last.close_time}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenusPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'pos' | 'web'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isReordering, setIsReordering] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: Menu }>({ open: false });
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    return listMenus(rid).then(setMenus).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => {
    reload();
    getRestaurant(rid).then(setRestaurant).catch(() => null);
  }, [reload, rid]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (m: Menu) => {
    if (menus.length <= 1) {
      alert(t('cannotDeleteLastMenu'));
      return;
    }
    if (!confirm(`${t('delete')} "${m.name}"?`)) return;
    await deleteMenu(rid, m.id);
    setOpenDropdown(null);
    reload();
  };

  // ─── Drag-to-reorder ──────────────────────────────────────────────────────
  const dragSource = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragSource.current = index;
  };
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

  // ─── Filtered list ────────────────────────────────────────────────────────
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
    <div className="space-y-5" ref={containerRef}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-fg-secondary max-w-2xl">
          {t('carteDescription')}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (isReordering) {
                setIsReordering(false);
              } else {
                setIsReordering(true);
                setViewMode('list');
              }
            }}
            className="btn-secondary text-sm"
          >
            {isReordering ? t('doneReordering') : t('reorder')}
          </button>
          <button
            onClick={() => setEditModal({ open: true })}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <PlusIcon className="w-4 h-4" />
            {t('createMenu')}
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-tertiary pointer-events-none" />
          <input
            className="input pl-9 text-sm h-9 w-full"
            placeholder={t('searchByMenuName')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as 'all' | 'pos' | 'web')}
            className="input text-sm h-9 pr-8 appearance-none cursor-pointer font-medium"
          >
            <option value="all">{t('channels')} · {t('allChannels').split(' ').slice(-1)[0]}</option>
            <option value="pos">POS</option>
            <option value="web">Web</option>
          </select>
        </div>

        {!isReordering && (
          <div className="flex items-center border border-[var(--divider)] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-[var(--surface-subtle)]' : 'hover:bg-[var(--surface-subtle)]'}`}
            >
              <Squares2X2Icon className="w-4 h-4 text-fg-secondary" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 border-l border-[var(--divider)] transition-colors ${viewMode === 'list' ? 'bg-[var(--surface-subtle)]' : 'hover:bg-[var(--surface-subtle)]'}`}
            >
              <ListBulletIcon className="w-4 h-4 text-fg-secondary" />
            </button>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">📋</div>
          <p className="text-sm text-fg-secondary">{t('noMenusYet')}</p>
          <button onClick={() => setEditModal({ open: true })} className="btn-primary mt-2">
            {t('createMenu')}
          </button>
        </div>
      )}

      {/* ── List view ── */}
      {filtered.length > 0 && viewMode === 'list' && (
        <div className="rounded-xl border border-[var(--divider)] overflow-hidden bg-[var(--surface)]">
          {filtered.map((m, index) => (
            <MenuListRow
              key={m.id}
              menu={m}
              restaurantName={restaurant?.name}
              isReordering={isReordering}
              isDropdownOpen={openDropdown === m.id}
              onToggleDropdown={() => setOpenDropdown(openDropdown === m.id ? null : m.id)}
              onEdit={() => { setOpenDropdown(null); setEditModal({ open: true, editing: m }); }}
              onDelete={() => handleDelete(m)}
              draggable={isReordering}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              showDivider={index < filtered.length - 1}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Grid view ── */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MenuGridCard
              key={m.id}
              menu={m}
              restaurantName={restaurant?.name}
              isDropdownOpen={openDropdown === m.id}
              onToggleDropdown={() => setOpenDropdown(openDropdown === m.id ? null : m.id)}
              onEdit={() => { setOpenDropdown(null); setEditModal({ open: true, editing: m }); }}
              onDelete={() => handleDelete(m)}
              t={t}
            />
          ))}
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

// ─── List row card ────────────────────────────────────────────────────────────

function MenuListRow({
  menu: m, restaurantName, isReordering, isDropdownOpen,
  onToggleDropdown, onEdit, onDelete, draggable,
  onDragStart, onDragOver, onDrop, showDivider, t,
}: {
  menu: Menu;
  restaurantName?: string;
  isReordering: boolean;
  isDropdownOpen: boolean;
  onToggleDropdown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  showDivider: boolean;
  t: TFn;
}) {
  const abbr = menuAbbr(m.name);
  const channels = channelsSummary(m, t);
  const hours = !m.follows_restaurant_hours && m.availability_hours
    ? hoursRange(m.availability_hours)
    : null;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--surface-subtle)] transition-colors${showDivider ? ' border-b border-[var(--divider)]' : ''}${draggable ? ' cursor-grab active:cursor-grabbing' : ''}`}
    >
      {isReordering && (
        <Bars3Icon className="w-4 h-4 text-fg-tertiary shrink-0" />
      )}

      {/* Avatar */}
      <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)] flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-fg-secondary">{abbr}</span>
      </div>

      {/* Name + metadata */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-fg-primary truncate">{m.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-fg-tertiary flex-wrap">
          {restaurantName && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              {restaurantName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
            {channels}
          </span>
          {hours && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {hours}
            </span>
          )}
        </div>
      </div>

      {/* Three-dots dropdown */}
      {!isReordering && (
        <div className="relative shrink-0">
          <button
            onClick={onToggleDropdown}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] text-fg-tertiary hover:text-fg-primary transition-colors"
          >
            <EllipsisHorizontalIcon className="w-5 h-5" />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 top-8 z-30 w-36 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
              <button
                onClick={onEdit}
                className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
              >
                {t('edit')}
              </button>
              <button
                onClick={onDelete}
                className="w-full text-left px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              >
                {t('delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function MenuGridCard({
  menu: m, restaurantName, isDropdownOpen, onToggleDropdown, onEdit, onDelete, t,
}: {
  menu: Menu;
  restaurantName?: string;
  isDropdownOpen: boolean;
  onToggleDropdown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: TFn;
}) {
  const abbr = menuAbbr(m.name);
  const channels = channelsSummary(m, t);
  const hours = !m.follows_restaurant_hours && m.availability_hours
    ? hoursRange(m.availability_hours)
    : null;

  return (
    <div className="relative rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)] flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-fg-secondary">{abbr}</span>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={onToggleDropdown}
            className="p-1 rounded-lg hover:bg-[var(--surface-subtle)] text-fg-tertiary transition-colors"
          >
            <EllipsisHorizontalIcon className="w-4 h-4" />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 top-7 z-30 w-36 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
              <button onClick={onEdit} className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors">
                {t('edit')}
              </button>
              <button onClick={onDelete} className="w-full text-left px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors">
                {t('delete')}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="font-semibold text-sm text-fg-primary mt-2.5 truncate">{m.name}</p>
      <div className="flex flex-col gap-1 mt-1.5 text-xs text-fg-tertiary">
        {restaurantName && (
          <span className="flex items-center gap-1 truncate">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            {restaurantName}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
          {channels}
        </span>
        {hours && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {hours}
          </span>
        )}
      </div>
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
      getMenuHours(restaurantId, editing.id)
        .then(setHours)
        .finally(() => setLoadingHours(false));
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
    hours.find((h) => h.day_of_week === day) ?? {
      id: 0, menu_id: editing?.id ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false,
    };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input = { name, is_active: isActive, pos_enabled: posEnabled, web_enabled: webEnabled, follows_restaurant_hours: followsRestaurantHours };
      let saved: Menu;
      if (editing) {
        saved = await updateMenu(restaurantId, editing.id, input);
      } else {
        saved = await createMenu(restaurantId, input);
      }
      if (!followsRestaurantHours) {
        await setMenuHours(restaurantId, saved.id, hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({ day_of_week, open_time, close_time, is_closed })));
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('editMenu') : t('createMenu')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('menuName')}</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-2">{t('channels')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={posEnabled} onChange={(e) => setPosEnabled(e.target.checked)} className="rounded" />
              POS
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={webEnabled} onChange={(e) => setWebEnabled(e.target.checked)} className="rounded" />
              Web
            </label>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
          {t('active')}
        </label>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-2">{t('availability')}</label>
          <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
            <input
              type="checkbox"
              checked={followsRestaurantHours}
              onChange={(e) => setFollowsRestaurantHours(e.target.checked)}
              className="rounded"
            />
            {t('followsRestaurantHours')}
          </label>

          {!followsRestaurantHours && (
            <div className="space-y-2">
              {loadingHours ? (
                <div className="text-xs text-fg-secondary">{t('loading')}</div>
              ) : (
                DAY_LABELS.map((label, day) => {
                  const h = getHour(day);
                  return (
                    <div key={day} className="flex items-center gap-3 text-sm">
                      <span className="w-8 text-fg-secondary text-xs">{label}</span>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={h.is_closed}
                          onChange={(e) => setHourField(day, 'is_closed', e.target.checked)}
                          className="rounded"
                        />
                        {t('closed')}
                      </label>
                      {!h.is_closed && (
                        <>
                          <input
                            type="time"
                            value={h.open_time}
                            onChange={(e) => setHourField(day, 'open_time', e.target.value)}
                            className="input py-1 px-2 text-xs w-28"
                          />
                          <span className="text-fg-secondary text-xs">–</span>
                          <input
                            type="time"
                            value={h.close_time}
                            onChange={(e) => setHourField(day, 'close_time', e.target.value)}
                            className="input py-1 px-2 text-xs w-28"
                          />
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
