'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurantSettings, updateRestaurantSettings } from '@/lib/api';
import { NumberInput } from '@/components/ui/NumberInput';

export default function FloorPlanSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [svc, setSvc] = useState({
    floor_plan_color_indicators: false,
    table_yellow_after_minutes: 30,
    table_red_after_minutes: 60,
  });

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setSvc({
          floor_plan_color_indicators: s.floor_plan_color_indicators ?? false,
          table_yellow_after_minutes: s.table_yellow_after_minutes ?? 30,
          table_red_after_minutes: s.table_red_after_minutes ?? 60,
        });
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(rid, svc);
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-fg-primary">Statut des tables</h1>
        <p className="text-sm text-fg-secondary mt-1">
          Colorez les tables du plan de salle en fonction du temps écoulé depuis l&apos;ouverture de la commande.
        </p>
      </div>

      <div className="card space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setSvc((p) => ({ ...p, floor_plan_color_indicators: !p.floor_plan_color_indicators }))}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${svc.floor_plan_color_indicators ? 'bg-brand-500' : 'bg-[var(--surface-subtle)]'}`}
            style={{ border: '1px solid var(--divider)' }}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${svc.floor_plan_color_indicators ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-fg-primary">Indicateurs de couleur</div>
            <div className="text-xs text-fg-secondary">Afficher l&apos;état d&apos;occupation par couleur sur le plan de salle</div>
          </div>
        </label>

        {svc.floor_plan_color_indicators && (
          <div className="space-y-3 pl-2" style={{ borderLeft: '3px solid var(--divider)' }}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: '#f59e0b' }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1">Passer en jaune après</label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    integer
                    min={1}
                    max={240}
                    value={svc.table_yellow_after_minutes}
                    onChange={(n) => setSvc((p) => ({ ...p, table_yellow_after_minutes: n }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">minutes</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: '#ef4444' }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1">Passer en rouge après</label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    integer
                    min={1}
                    max={480}
                    value={svc.table_red_after_minutes}
                    onChange={(n) => setSvc((p) => ({ ...p, table_red_after_minutes: n }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">minutes</span>
                </div>
              </div>
            </div>

            {/* Color legend */}
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { color: '#22c55e', label: `< ${svc.table_yellow_after_minutes} min` },
                { color: '#f59e0b', label: `${svc.table_yellow_after_minutes}–${svc.table_red_after_minutes} min` },
                { color: '#ef4444', label: `> ${svc.table_red_after_minutes} min` },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-fg-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {saved && <span className="text-sm text-status-ready font-medium">Enregistré ✓</span>}
      </div>
    </div>
  );
}
