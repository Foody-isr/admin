'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, getRestaurant, updateMenu, getMenuHours, setMenuHours,
  Menu, MenuAvailabilityHour, Restaurant,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon } from '@heroicons/react/24/outline';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MenuEditPage() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const { t } = useI18n();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [posEnabled, setPosEnabled] = useState(true);
  const [webEnabled, setWebEnabled] = useState(true);
  const [followsRestaurantHours, setFollowsRestaurantHours] = useState(true);
  const [hours, setHours] = useState<MenuAvailabilityHour[]>([]);

  // Inline editors visibility
  const [showChannelsEditor, setShowChannelsEditor] = useState(false);
  const [showHoursEditor, setShowHoursEditor] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listMenus(rid),
      getRestaurant(rid).catch(() => null),
    ]).then(([menus, rest]) => {
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      setRestaurant(rest);
      if (found) {
        setName(found.name);
        setPosEnabled(found.pos_enabled);
        setWebEnabled(found.web_enabled);
        setFollowsRestaurantHours(found.follows_restaurant_hours);
        if (!found.follows_restaurant_hours) {
          getMenuHours(rid, found.id).then(setHours).catch(() => null);
        }
      }
    }).finally(() => setLoading(false));
  }, [rid, mid]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim() || !menu) return;
    setSaving(true);
    try {
      await updateMenu(rid, mid, {
        name,
        pos_enabled: posEnabled,
        web_enabled: webEnabled,
        follows_restaurant_hours: followsRestaurantHours,
      });
      if (!followsRestaurantHours) {
        await setMenuHours(rid, mid, hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({
          day_of_week, open_time, close_time, is_closed,
        })));
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
      return [...prev, { id: 0, menu_id: mid, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false, [field]: value }];
    });
  };

  const getHour = (day: number): MenuAvailabilityHour =>
    hours.find((h) => h.day_of_week === day) ?? { id: 0, menu_id: mid, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!menu) {
    return <div className="text-center py-16 text-fg-secondary">Menu not found.</div>;
  }

  // Build channel summary
  const channelNames: string[] = [];
  if (posEnabled) channelNames.push(t('posSystem'));
  if (webEnabled) channelNames.push('Web');

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
        <h2 className="text-sm font-bold text-fg-primary">{t('editMenuTitle')}</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm px-5 py-2 rounded-full"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Name */}
        <div>
          <label className="block text-xs text-fg-tertiary mb-1 font-medium">{t('menuNameLabel')}</label>
          <input
            className="input w-full text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* ── Disponibilité ── */}
        <div>
          <h3 className="text-lg font-bold text-fg-primary mb-2">{t('menuAvailability')}</h3>
          <p className="text-sm text-fg-secondary leading-relaxed mb-6">
            {t('menuAvailabilityDesc')}
          </p>

          {/* Points de vente */}
          <div className="flex items-center justify-between py-4 border-t border-[var(--divider)]">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-fg-primary">{t('pointOfSale')}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-fg-secondary font-medium">{t('all')}</span>
                </div>
                <p className="text-xs text-fg-tertiary mt-0.5">{restaurant?.name ?? '—'}</p>
              </div>
            </div>
            <button className="text-sm font-medium underline text-fg-primary">{t('edit')}</button>
          </div>

          {/* Canaux */}
          <div className="py-4 border-t border-[var(--divider)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-fg-primary">{t('channels')}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-fg-secondary font-medium">{t('all')}</span>
                  </div>
                  <p className="text-xs text-fg-tertiary mt-0.5">{channelNames.join(', ') || '—'}</p>
                </div>
              </div>
              <button onClick={() => setShowChannelsEditor(!showChannelsEditor)} className="text-sm font-medium underline text-fg-primary">
                {t('edit')}
              </button>
            </div>
            {showChannelsEditor && (
              <div className="mt-3 pl-8 flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={posEnabled} onChange={(e) => setPosEnabled(e.target.checked)} className="rounded" />
                  POS
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={webEnabled} onChange={(e) => setWebEnabled(e.target.checked)} className="rounded" />
                  Web
                </label>
              </div>
            )}
          </div>

          {/* Heures */}
          <div className="py-4 border-t border-[var(--divider)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-fg-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-fg-primary">{t('hoursLabel')}</p>
                  <p className="text-xs text-fg-tertiary mt-0.5 max-w-md">{t('hoursAvailabilityDesc')}</p>
                </div>
              </div>
              <button onClick={() => { setShowHoursEditor(!showHoursEditor); if (followsRestaurantHours) setFollowsRestaurantHours(false); }} className="text-sm font-medium underline text-fg-primary shrink-0">
                {t('edit')}
              </button>
            </div>
            {showHoursEditor && (
              <div className="mt-3 pl-8 space-y-2">
                <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followsRestaurantHours}
                    onChange={(e) => setFollowsRestaurantHours(e.target.checked)}
                    className="rounded"
                  />
                  {t('followsRestaurantHours')}
                </label>
                {!followsRestaurantHours && DAY_LABELS.map((label, day) => {
                  const h = getHour(day);
                  return (
                    <div key={day} className="flex items-center gap-3 text-sm">
                      <span className="w-8 text-fg-secondary text-xs">{label}</span>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={h.is_closed} onChange={(e) => setHourField(day, 'is_closed', e.target.checked)} className="rounded" />
                        {t('closed')}
                      </label>
                      {!h.is_closed && (
                        <>
                          <input type="time" value={h.open_time} onChange={(e) => setHourField(day, 'open_time', e.target.value)} className="input py-1 px-2 text-xs w-28" />
                          <span className="text-fg-secondary text-xs">–</span>
                          <input type="time" value={h.close_time} onChange={(e) => setHourField(day, 'close_time', e.target.value)} className="input py-1 px-2 text-xs w-28" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
