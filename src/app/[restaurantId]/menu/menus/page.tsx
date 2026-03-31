'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listMenus, createMenu, updateMenu, deleteMenu,
  setMenuHours, getMenuHours,
  Menu, MenuAvailabilityHour,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MenusPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: Menu }>({ open: false });

  const reload = useCallback(() => {
    return listMenus(rid).then(setMenus).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (m: Menu) => {
    if (menus.length <= 1) {
      alert(t('cannotDeleteLastMenu'));
      return;
    }
    if (!confirm(`${t('delete')} "${m.name}"?`)) return;
    await deleteMenu(rid, m.id);
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setEditModal({ open: true })}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {t('createMenu')}
        </button>
      </div>

      {menus.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">📋</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('menus')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('noMenusYet')}
          </p>
          <button onClick={() => setEditModal({ open: true })} className="btn-primary mt-2">
            {t('createMenu')}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-normal">{t('name')}</th>
                <th className="py-3 px-4 font-normal">{t('channels')}</th>
                <th className="py-3 px-4 font-normal">{t('availability')}</th>
                <th className="py-3 px-4 font-normal">{t('status')}</th>
                <th className="py-3 px-4 font-normal w-24" />
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                >
                  <td className="py-3 px-4 font-medium text-fg-primary">{m.name}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 flex-wrap">
                      {m.pos_enabled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          POS
                        </span>
                      )}
                      {m.web_enabled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          Web
                        </span>
                      )}
                      {!m.pos_enabled && !m.web_enabled && (
                        <span className="text-xs text-fg-secondary">{t('noChannels')}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-fg-secondary">
                    {m.follows_restaurant_hours ? t('followsRestaurantHours') : t('customHours')}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal({ open: true, editing: m })}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(m)}
                        disabled={menus.length <= 1}
                        className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
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
      if (existing) {
        return prev.map((h) => h.day_of_week === day ? { ...h, [field]: value } : h);
      }
      return [...prev, { id: 0, menu_id: editing?.id ?? 0, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false, [field]: value }];
    });
  };

  const getHour = (day: number): MenuAvailabilityHour => {
    return hours.find((h) => h.day_of_week === day) ?? {
      id: 0, menu_id: editing?.id ?? 0, day_of_week: day,
      open_time: '09:00', close_time: '21:00', is_closed: false,
    };
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
        {/* Name */}
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

        {/* Channels */}
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

        {/* Active */}
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
          {t('active')}
        </label>

        {/* Availability hours */}
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
