'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurant, updateRestaurant, OpeningHoursConfig, DayHours, WeeklyHours } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];

const ORDER_TYPES = ['pickup', 'dine_in', 'delivery'] as const;
type OrderType = typeof ORDER_TYPES[number];

const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };

function defaultWeek(): WeeklyHours {
  return Object.fromEntries(DAYS.map((d) => [d, { ...DEFAULT_DAY }])) as WeeklyHours;
}

function defaultConfig(): OpeningHoursConfig {
  return { pickup: defaultWeek(), dine_in: defaultWeek(), delivery: defaultWeek() };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpeningHoursPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderType>('pickup');
  const [config, setConfig] = useState<OpeningHoursConfig>(defaultConfig());

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        if (r.opening_hours_config) {
          // Merge with defaults so all days are always present
          const merged: OpeningHoursConfig = defaultConfig();
          for (const ot of ORDER_TYPES) {
            const src = (r.opening_hours_config as OpeningHoursConfig)[ot];
            if (src) {
              for (const day of DAYS) {
                if (src[day]) merged[ot]![day] = src[day];
              }
            }
          }
          setConfig(merged);
        }
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, { opening_hours_config: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (orderType: OrderType, day: Day, patch: Partial<DayHours>) => {
    setConfig((prev) => ({
      ...prev,
      [orderType]: {
        ...prev[orderType],
        [day]: { ...prev[orderType]![day], ...patch },
      },
    }));
  };

  const copyToAll = (orderType: OrderType, day: Day) => {
    const src = config[orderType]![day];
    setConfig((prev) => ({
      ...prev,
      [orderType]: Object.fromEntries(DAYS.map((d) => [d, { ...src }])) as WeeklyHours,
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { key: OrderType; label: string }[] = [
    { key: 'pickup', label: t('pickup') },
    { key: 'dine_in', label: t('dineIn') },
    { key: 'delivery', label: t('delivery') },
  ];

  const weeklyHours = config[activeTab] ?? defaultWeek();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-fg-primary">{t('openingHours')}</h1>
        <p className="text-sm text-fg-secondary mt-1">{t('openingHoursDesc')}</p>
      </div>

      {/* Order type tabs */}
      <div className="flex gap-1 p-1 rounded-standard w-fit" style={{ background: 'var(--surface-subtle)' }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === key
                ? 'text-fg-primary shadow-sm'
                : 'text-fg-secondary hover:text-fg-primary'
            }`}
            style={activeTab === key ? { background: 'var(--surface)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Schedule table */}
      <div className="card space-y-0 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-fg-secondary tracking-wider"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <th className="py-3 px-4 font-normal w-32">{t('day')}</th>
              <th className="py-3 px-4 font-normal w-24">{t('status')}</th>
              <th className="py-3 px-4 font-normal">{t('openTime')}</th>
              <th className="py-3 px-4 font-normal">{t('closeTime')}</th>
              <th className="py-3 px-4 font-normal w-28" />
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => {
              const dayHours = weeklyHours[day] ?? { ...DEFAULT_DAY };
              return (
                <tr key={day} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td className="py-3 px-4 font-medium text-fg-primary capitalize">
                    {t(day)}
                  </td>
                  <td className="py-3 px-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!dayHours.closed}
                        onChange={(e) => updateDay(activeTab, day, { closed: !e.target.checked })}
                      />
                      <span className={`text-xs font-medium ${dayHours.closed ? 'text-fg-secondary' : 'text-status-ready'}`}>
                        {dayHours.closed ? t('closed') : t('open')}
                      </span>
                    </label>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      className="input text-sm py-1"
                      value={dayHours.open}
                      disabled={dayHours.closed}
                      onChange={(e) => updateDay(activeTab, day, { open: e.target.value })}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      className="input text-sm py-1"
                      value={dayHours.close}
                      disabled={dayHours.closed}
                      onChange={(e) => updateDay(activeTab, day, { close: e.target.value })}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => copyToAll(activeTab, day)}
                      className="text-xs text-brand-500 hover:underline whitespace-nowrap"
                      title={t('copyToAllDays')}
                    >
                      {t('copyToAll')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('saving') : t('saveChanges')}
        </button>
        {saved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
      </div>
    </div>
  );
}
