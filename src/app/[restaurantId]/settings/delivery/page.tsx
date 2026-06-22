'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Trash2, Plus } from 'lucide-react';
import {
  getDeliveryZones, createDeliveryZone, updateDeliveryZone, deleteDeliveryZone,
  getRestaurant, DeliveryZone, DeliveryZoneInput, DeliveryZoneType,
} from '@/lib/api';
import type { DrawMode } from '@/components/delivery/ZoneMap';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

// Leaflet must not SSR.
const ZoneMap = dynamic(() => import('@/components/delivery/ZoneMap'), { ssr: false });

const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv fallback

interface Draft {
  id: number | null;
  name: string;
  type: DeliveryZoneType;
  isActive: boolean;
  polygon: [number, number][];           // [lng, lat]
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  cities: string[];
}

const emptyDraft = (): Draft => ({
  id: null, name: '', type: 'radius', isActive: true,
  polygon: [], center: null, radiusKm: 5, cities: [],
});

export default function DeliveryZonesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');

  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [cityInput, setCityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDeliveryZones(rid), getRestaurant(rid).catch(() => null)])
      .then(([zs, r]) => {
        setZones(zs);
        // Restaurant interface doesn't expose lat/lng — guard with any and fall back gracefully
        const lat = (r as any)?.latitude, lng = (r as any)?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') setCenter({ lat, lng });
        else if (zs[0]?.center_lat != null && zs[0]?.center_lng != null) setCenter({ lat: zs[0].center_lat!, lng: zs[0].center_lng! });
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const beginNew = () => { setDraft(emptyDraft()); setDrawMode('none'); };

  const beginEdit = (z: DeliveryZone) => {
    setDraft({
      id: z.id, name: z.name, type: z.type, isActive: z.is_active,
      polygon: z.polygon ?? [],
      center: z.center_lat != null && z.center_lng != null ? { lat: z.center_lat, lng: z.center_lng } : null,
      radiusKm: z.radius_m != null ? z.radius_m / 1000 : 5,
      cities: z.cities ?? [],
    });
    setDrawMode('none');
  };

  const onMapClick = (lat: number, lng: number) => {
    if (!draft) return;
    if (drawMode === 'draw-polygon') {
      setDraft({ ...draft, polygon: [...draft.polygon, [lng, lat]] });
    } else if (drawMode === 'set-center') {
      setDraft({ ...draft, center: { lat, lng } });
      setDrawMode('none');
    }
  };

  const addCity = () => {
    const c = cityInput.trim();
    if (c && draft && !draft.cities.includes(c)) setDraft({ ...draft, cities: [...draft.cities, c] });
    setCityInput('');
  };

  const toPayload = (d: Draft): DeliveryZoneInput => {
    const base: DeliveryZoneInput = { name: d.name, type: d.type, is_active: d.isActive };
    if (d.type === 'polygon') base.polygon = d.polygon;
    if (d.type === 'radius' && d.center) { base.center_lat = d.center.lat; base.center_lng = d.center.lng; base.radius_m = Math.round(d.radiusKm * 1000); }
    if (d.type === 'cities') base.cities = d.cities;
    return base;
  };

  const validDraft = (d: Draft): boolean => {
    if (!d.name.trim()) return false;
    if (d.type === 'polygon') return d.polygon.length >= 3;
    if (d.type === 'radius') return !!d.center && d.radiusKm > 0;
    if (d.type === 'cities') return d.cities.length > 0;
    return false;
  };

  const save = async () => {
    if (!draft || !validDraft(draft)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toPayload(draft);
      const saved = draft.id ? await updateDeliveryZone(rid, draft.id, payload) : await createDeliveryZone(rid, payload);
      setZones((prev) => draft.id ? prev.map((z) => (z.id === saved.id ? saved : z)) : [...prev, saved]);
      setSaveError(null);
      setDraft(null);
      setDrawMode('none');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (z: DeliveryZone) => {
    const saved = await updateDeliveryZone(rid, z.id, {
      name: z.name, type: z.type, is_active: !z.is_active,
      polygon: z.polygon, center_lat: z.center_lat, center_lng: z.center_lng, radius_m: z.radius_m, cities: z.cities,
    });
    setZones((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
  };

  const remove = async (z: DeliveryZone) => {
    await deleteDeliveryZone(rid, z.id);
    setZones((prev) => prev.filter((x) => x.id !== z.id));
    if (draft?.id === z.id) setDraft(null);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6" />{t('deliveryZones') || 'Zones de livraison'}</h1>
        <p className="text-gray-500 mt-1">{t('deliveryZonesDesc') || 'Definissez ou vous livrez. Hors de ces zones, les clients ne peuvent pas commander en livraison.'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <ZoneMap
          className="h-[520px] rounded-xl overflow-hidden border border-gray-200"
          center={center}
          zones={zones}
          activeZoneId={draft?.id ?? null}
          drawMode={drawMode}
          draftPolygon={draft?.type === 'polygon' ? draft.polygon : []}
          draftCenter={draft?.type === 'radius' ? draft.center : null}
          draftRadiusM={draft?.type === 'radius' ? Math.round(draft.radiusKm * 1000) : undefined}
          onMapClick={onMapClick}
        />

        <div className="space-y-4">
          {/* Zone list */}
          <div className="space-y-2">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white">
                <button className="text-left flex-1" onClick={() => beginEdit(z)}>
                  <div className="font-medium">{z.name}</div>
                  <div className="text-xs text-gray-500">{t(`zoneType_${z.type}`) || z.type}{z.is_active ? '' : ` - ${t('inactive') || 'inactive'}`}</div>
                </button>
                <label className="mr-2 text-xs flex items-center gap-1">
                  <input type="checkbox" checked={z.is_active} disabled={!canEdit} onChange={() => toggleActive(z)} />
                </label>
                <button disabled={!canEdit} onClick={() => remove(z)} className="text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {zones.length === 0 && <p className="text-sm text-gray-400">{t('noZonesYet') || 'Aucune zone. Toute adresse est livrable.'}</p>}
          </div>

          {canEdit && !draft && (
            <button onClick={beginNew} className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />{t('addZone') || 'Ajouter une zone'}
            </button>
          )}

          {/* Editor */}
          {draft && (
            <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2"
                placeholder={t('zoneName') || 'Nom de la zone'}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="flex gap-2">
                {(['radius', 'polygon', 'cities'] as DeliveryZoneType[]).map((ty) => (
                  <button key={ty} onClick={() => setDraft({ ...draft, type: ty })}
                    className={`flex-1 py-1.5 rounded-lg text-sm ${draft.type === ty ? 'bg-[var(--brand-500)] text-white' : 'bg-gray-100'}`}>
                    {t(`zoneType_${ty}`) || ty}
                  </button>
                ))}
              </div>

              {draft.type === 'polygon' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">{t('drawPolygonHint') || 'Cliquez sur la carte pour ajouter des points (3 minimum).'}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDrawMode(drawMode === 'draw-polygon' ? 'none' : 'draw-polygon')}
                      className={`flex-1 py-1.5 rounded-lg text-sm ${drawMode === 'draw-polygon' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>
                      {drawMode === 'draw-polygon' ? (t('drawing') || 'En cours...') : (t('draw') || 'Dessiner')}
                    </button>
                    <button onClick={() => setDraft({ ...draft, polygon: draft.polygon.slice(0, -1) })} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100">{t('undo') || 'Annuler point'}</button>
                    <button onClick={() => setDraft({ ...draft, polygon: [] })} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100">{t('clear') || 'Effacer'}</button>
                  </div>
                  <p className="text-xs text-gray-400">{draft.polygon.length} {t('points') || 'points'}</p>
                </div>
              )}

              {draft.type === 'radius' && (
                <div className="space-y-2">
                  <button onClick={() => setDrawMode(drawMode === 'set-center' ? 'none' : 'set-center')}
                    className={`w-full py-1.5 rounded-lg text-sm ${drawMode === 'set-center' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>
                    {draft.center ? (t('moveCenter') || 'Deplacer le centre') : (t('setCenter') || 'Placer le centre')}
                  </button>
                  <label className="text-sm flex items-center gap-2">
                    {t('radiusKm') || 'Rayon (km)'}
                    <input type="number" min={0.1} step={0.1} value={draft.radiusKm}
                      onChange={(e) => setDraft({ ...draft, radiusKm: Number(e.target.value) })}
                      className="w-24 border rounded-lg px-2 py-1" />
                  </label>
                </div>
              )}

              {draft.type === 'cities' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input className="flex-1 border rounded-lg px-3 py-2" placeholder={t('cityOrPostal') || 'Ville ou code postal'}
                      value={cityInput} onChange={(e) => setCityInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity(); } }} />
                    <button onClick={addCity} className="px-3 rounded-lg bg-gray-100">{t('add') || 'Ajouter'}</button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {draft.cities.map((c) => (
                      <span key={c} className="px-2 py-1 rounded-full bg-gray-100 text-sm flex items-center gap-1">
                        {c}<button onClick={() => setDraft({ ...draft, cities: draft.cities.filter((x) => x !== c) })}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
              <div className="flex gap-2 pt-2">
                <button disabled={!validDraft(draft) || saving} onClick={save}
                  className="flex-1 py-2 rounded-lg bg-[var(--brand-500)] text-white font-medium disabled:opacity-50">
                  {saving ? '...' : (t('save') || 'Enregistrer')}
                </button>
                <button onClick={() => { setDraft(null); setDrawMode('none'); setSaveError(null); }} className="px-4 py-2 rounded-lg bg-gray-100">{t('cancel') || 'Annuler'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
