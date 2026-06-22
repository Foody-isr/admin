'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, MapPin, Trash2, Plus } from 'lucide-react';
import {
  getDeliveryZones, createDeliveryZone, updateDeliveryZone, deleteDeliveryZone,
  getRestaurant, geocodeAddress, DeliveryZone, DeliveryZoneInput, DeliveryZoneType,
} from '@/lib/api';
import type { CityMarker } from '@/components/delivery/ZoneMap';
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
  polygon: [number, number][];           // [lng, lat] — kept for display of legacy zones
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
  // Restaurant center derived from geocoding the restaurant address.
  const [restaurantCenter, setRestaurantCenter] = useState<{ lat: number; lng: number } | null>(null);
  // False when the restaurant has no address or it cannot be geocoded.
  const [addressOk, setAddressOk] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cityInput, setCityInput] = useState('');
  // City markers geocoded on the fly (display-only, not persisted).
  const [cityMarkers, setCityMarkers] = useState<CityMarker[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const cityInputRef = useRef<HTMLInputElement>(null);
  // Used to cancel stale city-geocoding loops when the editor is superseded.
  const editSessionRef = useRef(0);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getDeliveryZones(rid), getRestaurant(rid).catch(() => null)])
      .then(async ([zs, r]) => {
        setZones(zs);

        // Try to geocode the restaurant address for the radius center.
        const address = (r as any)?.address as string | undefined;
        if (address) {
          const geo = await geocodeAddress(rid, address);
          if (geo.found && geo.lat != null && geo.lng != null) {
            const rc = { lat: geo.lat, lng: geo.lng };
            setRestaurantCenter(rc);
            setCenter(rc);
            setAddressOk(true);
          } else {
            setAddressOk(false);
            // Fall back to first zone center if available.
            if (zs[0]?.center_lat != null && zs[0]?.center_lng != null) {
              setCenter({ lat: zs[0].center_lat!, lng: zs[0].center_lng! });
            }
          }
        } else {
          setAddressOk(false);
          // Fallback: existing zone center or Tel Aviv default.
          const lat = (r as any)?.latitude, lng = (r as any)?.longitude;
          if (typeof lat === 'number' && typeof lng === 'number') setCenter({ lat, lng });
          else if (zs[0]?.center_lat != null && zs[0]?.center_lng != null) setCenter({ lat: zs[0].center_lat!, lng: zs[0].center_lng! });
        }
      })
      .finally(() => setLoading(false));
  }, [rid]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const beginNew = () => {
    editSessionRef.current += 1;
    const d = emptyDraft();
    // Pre-fill radius center from restaurant address.
    if (restaurantCenter) d.center = restaurantCenter;
    setDraft(d);
    setCityMarkers([]);
  };

  const beginEdit = async (z: DeliveryZone) => {
    editSessionRef.current += 1;
    const myToken = editSessionRef.current;

    const d: Draft = {
      id: z.id, name: z.name, type: z.type, isActive: z.is_active,
      polygon: z.polygon ?? [],
      center: z.center_lat != null && z.center_lng != null ? { lat: z.center_lat, lng: z.center_lng } : restaurantCenter,
      radiusKm: z.radius_m != null ? z.radius_m / 1000 : 5,
      cities: z.cities ?? [],
    };
    setDraft(d);

    // Geocode existing cities for display-only markers (best-effort).
    // Guard: bail out if a newer edit session has started mid-loop.
    if (z.type === 'cities' && z.cities && z.cities.length > 0) {
      const markers: CityMarker[] = [];
      for (const city of z.cities) {
        if (editSessionRef.current !== myToken) return;
        const geo = await geocodeAddress(rid, city);
        if (editSessionRef.current !== myToken) return;
        if (geo.found && geo.lat != null && geo.lng != null) {
          markers.push({ name: city, lat: geo.lat, lng: geo.lng });
        }
      }
      if (editSessionRef.current !== myToken) return;
      setCityMarkers(markers);
    } else {
      setCityMarkers([]);
    }
  };

  const onMapClick = (lat: number, lng: number) => {
    if (!draft) return;
    // Only set-center mode remains active; draw-polygon is removed.
    // (kept as no-op guard for safety)
    void lat; void lng;
  };

  const addCity = async () => {
    const c = cityInput.trim();
    if (!c || !draft || draft.cities.includes(c)) { setCityInput(''); return; }
    setDraft({ ...draft, cities: [...draft.cities, c] });
    setCityInput('');

    // Best-effort geocode for the new city marker.
    const geo = await geocodeAddress(rid, c);
    if (geo.found && geo.lat != null && geo.lng != null) {
      setCityMarkers((prev) => [...prev.filter((m) => m.name !== c), { name: c, lat: geo.lat!, lng: geo.lng! }]);
    }
  };

  const removeCity = (c: string) => {
    if (!draft) return;
    setDraft({ ...draft, cities: draft.cities.filter((x) => x !== c) });
    setCityMarkers((prev) => prev.filter((m) => m.name !== c));
  };

  const toPayload = (d: Draft): DeliveryZoneInput => {
    const base: DeliveryZoneInput = { name: d.name, type: d.type, is_active: d.isActive };
    if (d.type === 'polygon') base.polygon = d.polygon;
    if (d.type === 'radius') {
      const rc = restaurantCenter;
      if (rc) { base.center_lat = rc.lat; base.center_lng = rc.lng; }
      base.radius_m = Math.round(d.radiusKm * 1000);
    }
    if (d.type === 'cities') base.cities = d.cities;
    return base;
  };

  const validDraft = (d: Draft): boolean => {
    if (!d.name.trim()) return false;
    if (d.type === 'polygon') return d.polygon.length >= 3;
    if (d.type === 'radius') return addressOk === true && d.radiusKm > 0;
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
      editSessionRef.current += 1;
      setDraft(null);
      setCityMarkers([]);
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
    if (draft?.id === z.id) { editSessionRef.current += 1; setDraft(null); setCityMarkers([]); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" /></div>;
  }

  // Address notice shown at page top when addressOk is false.
  const missingAddressNotice = addressOk === false ? (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        {t('radiusMissingAddress') || "Renseignez l'adresse du restaurant dans Parametres > General pour utiliser un rayon."}{' '}
        <Link href="../settings" className="underline font-medium">{t('generalSettings') || 'Parametres generaux'}</Link>
      </span>
    </div>
  ) : null;

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6" />{t('deliveryZones') || 'Zones de livraison'}</h1>
        <p className="text-gray-500 mt-1">{t('deliveryZonesDesc') || 'Definissez ou vous livrez. Hors de ces zones, les clients ne peuvent pas commander en livraison.'}</p>
      </div>

      {missingAddressNotice}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <ZoneMap
          className="h-[520px] rounded-xl overflow-hidden border border-gray-200"
          center={center}
          zones={zones}
          activeZoneId={draft?.id ?? null}
          drawMode="none"
          draftPolygon={draft?.type === 'polygon' ? draft.polygon : []}
          draftCenter={draft?.type === 'radius' ? (restaurantCenter ?? draft.center) : null}
          draftRadiusM={draft?.type === 'radius' ? Math.round(draft.radiusKm * 1000) : undefined}
          onMapClick={onMapClick}
          cityMarkers={draft?.type === 'cities' ? cityMarkers : undefined}
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

              {/* Type selector — only radius and cities */}
              <div className="flex gap-2">
                {(['radius', 'cities'] as const).map((ty) => (
                  <button key={ty} onClick={() => { setDraft({ ...draft, type: ty }); setCityMarkers([]); }}
                    className={`flex-1 py-1.5 rounded-lg text-sm ${draft.type === ty ? 'bg-[var(--brand-500)] text-white' : 'bg-gray-100'}`}>
                    {t(`zoneType_${ty}`) || ty}
                  </button>
                ))}
              </div>

              {/* Contextual hint per type */}
              <p className="text-xs text-gray-500 italic">
                {draft.type === 'cities'
                  ? (t('zoneTypeHint_cities') || 'Les clients choisiront leur ville dans une liste au moment de la commande.')
                  : (t('zoneTypeHint_radius') || "Le systeme verifie automatiquement si l'adresse du client est dans le rayon.")}
              </p>

              {draft.type === 'radius' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">{t('radiusFromAddressHint') || "Le rayon part de l'adresse du restaurant."}</p>
                  {addressOk === false && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        {t('radiusMissingAddress') || "Renseignez l'adresse du restaurant dans Parametres > General pour utiliser un rayon."}{' '}
                        <Link href="../settings" className="underline font-medium">{t('generalSettings') || 'Parametres generaux'}</Link>
                      </span>
                    </div>
                  )}
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
                    <input
                      ref={cityInputRef}
                      className="flex-1 border rounded-lg px-3 py-2"
                      placeholder={t('cityOrPostal') || 'Ville ou code postal'}
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity(); } }}
                    />
                    <button onClick={addCity} className="px-3 rounded-lg bg-gray-100">{t('add') || 'Ajouter'}</button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {draft.cities.map((c) => (
                      <span key={c} className="px-2 py-1 rounded-full bg-gray-100 text-sm flex items-center gap-1">
                        {c}<button onClick={() => removeCity(c)}>&times;</button>
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
                <button onClick={() => { editSessionRef.current += 1; setDraft(null); setCityMarkers([]); setSaveError(null); }} className="px-4 py-2 rounded-lg bg-gray-100">{t('cancel') || 'Annuler'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
