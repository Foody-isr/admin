'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurant, getRestaurantSettings, updateRestaurant, updateRestaurantSettings,
  Restaurant, RestaurantSettings,
} from '@/lib/api';

export default function SettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Restaurant info form
  const [info, setInfo] = useState({ name: '', address: '', phone: '', description: '' });
  // Settings form
  const [svc, setSvc] = useState({
    require_order_approval: true,
    service_mode: 'table',
    scheduling_enabled: false,
    tips_enabled: true,
    rush_mode: false,
  });

  useEffect(() => {
    Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]).then(([r, s]) => {
      setRestaurant(r);
      setSettings(s);
      setInfo({ name: r.name, address: r.address, phone: r.phone, description: r.description });
      setSvc({
        require_order_approval: s.require_order_approval,
        service_mode: s.service_mode,
        scheduling_enabled: s.scheduling_enabled,
        tips_enabled: s.tips_enabled,
        rush_mode: s.rush_mode ?? false,
      });
    }).finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateRestaurant(rid, info),
        updateRestaurantSettings(rid, svc),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Restaurant info */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Restaurant Info</h2>
        {[
          { label: 'Name', key: 'name' as const },
          { label: 'Address', key: 'address' as const },
          { label: 'Phone', key: 'phone' as const },
          { label: 'Description', key: 'description' as const },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              className="input"
              value={info[key]}
              onChange={(e) => setInfo((p) => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {/* Operational settings */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Operations</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service Mode</label>
          <select
            className="input"
            value={svc.service_mode}
            onChange={(e) => setSvc((p) => ({ ...p, service_mode: e.target.value }))}
          >
            <option value="table">Table service (waiter delivers)</option>
            <option value="counter">Counter service (customer collects)</option>
          </select>
        </div>

        {[
          { label: 'Require order approval', key: 'require_order_approval' as const, desc: 'New orders need manual approval before going to kitchen' },
          { label: 'Enable tips', key: 'tips_enabled' as const, desc: 'Show tip option at checkout' },
          { label: 'Scheduled orders', key: 'scheduling_enabled' as const, desc: 'Allow customers to order for future dates' },
          { label: 'Rush mode', key: 'rush_mode' as const, desc: 'Block new customer orders (e.g. kitchen is full)' },
        ].map(({ label, key, desc }) => (
          <label key={key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={svc[key] as boolean}
              onChange={(e) => setSvc((p) => ({ ...p, [key]: e.target.checked }))}
            />
            <div>
              <div className="text-sm font-medium text-gray-900">{label}</div>
              <div className="text-xs text-gray-500">{desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}
