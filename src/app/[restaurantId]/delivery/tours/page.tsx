'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Copy, Plus, Share2, Trash2, Truck } from 'lucide-react';
import {
  getDeliveryTours, createDeliveryTour, updateDeliveryTour, deleteDeliveryTour,
  getDeliveryZones, createDeliveryZone, deleteDeliveryZone, listMenus, getRestaurant,
  ApiError, DeliveryTour, DeliveryTourInput, DeliveryZone,
} from '@/lib/api';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table/DataTable';
import { Badge } from '@/components/ds';
import { parsePrice } from '@/lib/delivery-pricing';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

/** Local editing state. Empty strings mean "unset" (fall back to the zone). */
interface Draft {
  id: number | null;
  name: string;
  zoneId: number | null;
  newCity: string;
  menuId: number | null;
  deliveryDate: string; // "YYYY-MM-DD"
  /** RFC3339. Kept as-is when editing so republishing a tour does not silently
   *  reopen an ordering window the owner already closed. */
  opensAt: string;
  cutoffLocal: string; // "YYYY-MM-DDTHH:mm" (datetime-local, local time)
  windowStart: string; // "HH:MM"
  windowEnd: string;
  deliveryFee: string;
  minOrder: string;
  requirePrepayment: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (d: Date) => `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The tour's delivery day as a LOCAL calendar date. The server serializes
 *  delivery_date as an RFC3339 timestamp at UTC midnight, so `new Date(...)`
 *  lands on the previous day in any negative-offset timezone: read the calendar
 *  fields off the string instead. */
function deliveryDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const emptyDraft = (): Draft => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 2 * 3600_000);
  return {
    id: null, name: '', zoneId: null, newCity: '', menuId: null,
    deliveryDate: toDateInput(now),
    opensAt: now.toISOString(),
    cutoffLocal: toLocalInput(cutoff),
    windowStart: '18:00', windowEnd: '21:00',
    deliveryFee: '', minOrder: '', requirePrepayment: false,
  };
};

type Phase = 'live' | 'upcoming' | 'past';

/** Where a tour sits relative to now: its ordering window first, then its
 *  delivery day. Mirrors the server's OpenTours predicate (published AND
 *  opens_at <= now <= cutoff_at) so the badge never claims a tour is live while
 *  the public site has already dropped its carte. */
function phaseOf(tr: DeliveryTour, now: Date): Phase {
  const opens = new Date(tr.opens_at);
  const cutoff = new Date(tr.cutoff_at);
  if (tr.is_published && now >= opens && now <= cutoff) return 'live';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return deliveryDay(tr.delivery_date) >= today ? 'upcoming' : 'past';
}

const PHASE_ORDER: Record<Phase, number> = { live: 0, upcoming: 1, past: 2 };

/** One-tap cutoffs. They cover the two ways a tour gets announced: same-day
 *  ("I'm going to Raanana tonight") and next-day. */
type Preset = 'in2h' | 'tonight' | 'tomorrow';
const PRESETS: readonly Preset[] = ['in2h', 'tonight', 'tomorrow'];

export default function DeliveryToursPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  // Same gate as the server: /delivery/tours requires orders.manage.
  const canEdit = hasAnyPermission('orders.manage');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tours, setTours] = useState<DeliveryTour[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [cartes, setCartes] = useState<Array<{ id: number; name: string }>>([]);
  const [slug, setSlug] = useState('');
  // True when getRestaurant failed and `slug` fell back to the numeric id: the
  // share link below is then likely wrong, and that must be visible rather
  // than silently broken.
  const [slugUnknown, setSlugUnknown] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [manageCities, setManageCities] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [shareFallback, setShareFallback] = useState<{ id: number; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      // Tours and zones are load-bearing: a failure here must not be read as
      // "no tours" (see errorMessage/loadError below), or the owner recreates
      // one and publishes a duplicate carte tab on the customer site.
      getDeliveryTours(rid),
      getDeliveryZones(rid),
      // Best-effort: the page still works (minus "new tour" / share) without them.
      listMenus(rid).catch(() => []),
      getRestaurant(rid).catch(() => null),
    ])
      .then(([ts, zs, ms, r]) => {
        setTours(ts);
        // Only tour zones can back a tour (the server answers 400 otherwise): a
        // normal zone would make the city deliverable on the classic site every
        // day of the week.
        setZones(zs.filter((z) => z.tour_only && z.is_active));
        // Only web-disabled cartes can back a tour (400 otherwise): a web_enabled
        // carte is browsable outside the tour, so it would show up twice.
        setCartes(ms.filter((m) => !m.web_enabled).map((m) => ({ id: m.id, name: m.name })));
        setSlug(r?.slug ?? String(rid));
        setSlugUnknown(r == null);
      })
      .catch((err) => setLoadError(errorMessage(err, t('couldNotLoad'))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  const dateLocale = locale === 'he' ? 'he-IL' : locale === 'fr' ? 'fr-FR' : 'en-GB';

  const now = new Date();
  const ordered = useMemo(() => {
    // Live first, then the next rounds to organize (nearest first), then history
    // (most recent first) — the order the owner actually works in.
    return [...tours].sort((a, b) => {
      const pa = PHASE_ORDER[phaseOf(a, new Date())];
      const pb = PHASE_ORDER[phaseOf(b, new Date())];
      if (pa !== pb) return pa - pb;
      const da = deliveryDay(a.delivery_date).getTime();
      const db = deliveryDay(b.delivery_date).getTime();
      return pa === 2 ? db - da : da - db;
    });
  }, [tours]);

  // ── Error mapping ──────────────────────────────────────────────────────────
  // The server's reason travels in ApiError.details; surface it as a sentence the
  // owner can act on instead of a raw Go error.
  const errorMessage = (err: unknown, fallback: string = t('saveFailed')): string => {
    if (err instanceof ApiError) {
      const d = (err.details ?? '').toLowerCase();
      if (d.includes('web_enabled')) return t('tourErrCarteWeb');
      if (d.includes('tour_only')) return t('tourErrZoneNotTourOnly');
      if (d.includes('zone must be active')) return t('tourErrZoneInactive');
      if (d.includes('cutoff_at must be after')) return t('tourErrCutoffPast');
      if (err.status === 409) return t('tourZoneInUse');
    }
    return err instanceof Error ? err.message : fallback;
  };

  // ── Draft handling ─────────────────────────────────────────────────────────

  const beginNew = () => { setSaveError(null); setDraft(emptyDraft()); };

  const beginEdit = (tr: DeliveryTour) => {
    setSaveError(null);
    setDraft({
      id: tr.id,
      name: tr.name,
      zoneId: tr.zone_id,
      newCity: '',
      menuId: tr.menu_id,
      deliveryDate: toDateInput(deliveryDay(tr.delivery_date)),
      opensAt: tr.opens_at,
      cutoffLocal: toLocalInput(new Date(tr.cutoff_at)),
      windowStart: tr.delivery_start ?? '',
      windowEnd: tr.delivery_end ?? '',
      deliveryFee: tr.delivery_fee != null ? String(tr.delivery_fee) : '',
      minOrder: tr.min_order != null ? String(tr.min_order) : '',
      requirePrepayment: tr.require_prepayment,
    });
  };

  /** Duplicating a past tour is how next month's Raanana round gets booked: same
   *  city, same carte, same fee, same window. Only the date and the cutoff move,
   *  which is why they alone come back at their defaults. */
  const duplicate = (tr: DeliveryTour) => {
    setSaveError(null);
    setDraft({
      ...emptyDraft(),
      name: tr.name,
      zoneId: tr.zone_id,
      menuId: tr.menu_id,
      windowStart: tr.delivery_start ?? '',
      windowEnd: tr.delivery_end ?? '',
      deliveryFee: tr.delivery_fee != null ? String(tr.delivery_fee) : '',
      minOrder: tr.min_order != null ? String(tr.min_order) : '',
      requirePrepayment: tr.require_prepayment,
    });
  };

  /** A cutoff preset resolves against the clock, so "tonight" is already gone by
   *  22:00. The chip is then disabled rather than left to set a cutoff the server
   *  would reject. */
  const presetDate = (preset: Preset): Date => {
    const d = new Date();
    if (preset === 'in2h') d.setTime(d.getTime() + 2 * 3600_000);
    if (preset === 'tonight') d.setHours(18, 0, 0, 0);
    if (preset === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); }
    return d;
  };

  const setCutoffPreset = (preset: Preset) => {
    if (!draft) return;
    setDraft({ ...draft, cutoffLocal: toLocalInput(presetDate(preset)) });
  };

  /** The delivery window is REQUIRED (the form pre-fills 18:00 / 21:00, but the
   *  operator can clear it). A tour saved without one produces orders whose
   *  pickup window is NULL, and the scheduler — which activates a scheduled order
   *  when `window_start <= now` — never picks those rows up: the orders sit in
   *  "Programmées" forever and never reach the kitchen. The server refuses it;
   *  the button is disabled here so nobody meets that refusal. */
  const validDraft = (d: Draft): boolean =>
    d.name.trim() !== '' &&
    d.menuId != null &&
    (d.zoneId != null || d.newCity.trim() !== '') &&
    d.deliveryDate !== '' &&
    d.cutoffLocal !== '' &&
    d.windowStart !== '' &&
    d.windowEnd !== '';

  /** Null when the tour has no announced window: a legacy tour (created before the
   *  window became mandatory) cannot be re-saved as-is, and publishing it from the
   *  list would just earn a raw 400. The caller sends the operator to the editor
   *  instead. */
  const toInput = (tr: DeliveryTour, isPublished: boolean): DeliveryTourInput | null => {
    if (!tr.delivery_start || !tr.delivery_end) return null;
    return {
      name: tr.name,
      zone_id: tr.zone_id,
      menu_id: tr.menu_id,
      delivery_date: tr.delivery_date.slice(0, 10),
      opens_at: tr.opens_at,
      cutoff_at: tr.cutoff_at,
      delivery_start: tr.delivery_start,
      delivery_end: tr.delivery_end,
      delivery_fee: tr.delivery_fee ?? null,
      min_order: tr.min_order ?? null,
      require_prepayment: tr.require_prepayment,
      is_published: isPublished,
    };
  };

  const save = async (publish: boolean) => {
    if (!draft || !validDraft(draft)) return;
    // Checked here rather than left to the server, because a rejected save on a
    // brand-new city would already have created its zone (see below).
    const cutoff = new Date(draft.cutoffLocal);
    if (!(cutoff.getTime() > new Date(draft.opensAt).getTime())) {
      setSaveError(t('tourErrCutoffPast'));
      return;
    }
    // Both ends are mandatory (see validDraft): without them the round's orders
    // are scheduled with no pickup window and never leave "Programmées".
    if (!draft.windowStart || !draft.windowEnd) {
      setSaveError(t('tourErrWindowRequired'));
      return;
    }
    // "HH:MM" strings compare lexically the same as chronologically.
    if (draft.windowStart >= draft.windowEnd) {
      setSaveError(t('tourErrWindowOrder'));
      return;
    }
    // A negative or garbage price must block the save, not silently become
    // "unset" (i.e. free delivery / no minimum).
    const deliveryFee = parsePrice(draft.deliveryFee);
    const minOrder = parsePrice(draft.minOrder);
    if (deliveryFee === undefined || minOrder === undefined) {
      setSaveError(t('invalidPrice'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // A brand new city creates its zone on the fly, tour_only so it never leaks
      // into the classic delivery path. The zone carries no fee or minimum: the
      // tour's own values override them anyway.
      let zoneId = draft.zoneId;
      if (zoneId == null) {
        const city = draft.newCity.trim();
        const zone = await createDeliveryZone(rid, {
          name: city, type: 'cities', cities: [city], is_active: true, tour_only: true,
        });
        zoneId = zone.id;
        setZones((prev) => [...prev, zone]);
        // Pin it on the draft so a failed save below is retried against the zone
        // we just created instead of creating a second one.
        setDraft((prev) => (prev ? { ...prev, zoneId: zone.id, newCity: '' } : prev));
      }
      const input: DeliveryTourInput = {
        name: draft.name.trim(),
        zone_id: zoneId,
        menu_id: draft.menuId!,
        delivery_date: draft.deliveryDate,
        opens_at: draft.opensAt,
        cutoff_at: cutoff.toISOString(),
        delivery_start: draft.windowStart,
        delivery_end: draft.windowEnd,
        delivery_fee: deliveryFee,
        min_order: minOrder,
        require_prepayment: draft.requirePrepayment,
        is_published: publish,
      };
      const saved = draft.id
        ? await updateDeliveryTour(rid, draft.id, input)
        : await createDeliveryTour(rid, input);
      setTours((prev) => (draft.id ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]));
      setDraft(null);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (tr: DeliveryTour) => {
    setListError(null);
    const input = toInput(tr, !tr.is_published);
    if (!input) {
      setListError(t('tourErrWindowRequired'));
      return;
    }
    try {
      const saved = await updateDeliveryTour(rid, tr.id, input);
      setTours((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (err) {
      setListError(errorMessage(err));
    }
  };

  const remove = async (tr: DeliveryTour) => {
    if (!window.confirm(t('tourDeleteConfirm'))) return;
    setListError(null);
    try {
      await deleteDeliveryTour(rid, tr.id);
      setTours((prev) => prev.filter((x) => x.id !== tr.id));
      if (draft?.id === tr.id) setDraft(null);
    } catch (err) {
      setListError(errorMessage(err));
    }
  };

  /** Tour-only zones pile up (4-5 new cities a month, ~60/year) since each
   *  tour uses a throwaway city and nothing else purges them. The server
   *  answers 409 when an upcoming tour still references the zone. */
  const removeZone = async (z: DeliveryZone) => {
    if (!window.confirm(t('tourCityDeleteConfirm'))) return;
    setZoneError(null);
    try {
      await deleteDeliveryZone(rid, z.id);
      setZones((prev) => prev.filter((x) => x.id !== z.id));
      // Don't leave the draft pointing at a zone that no longer exists.
      setDraft((prev) => (prev && prev.zoneId === z.id ? { ...prev, zoneId: null } : prev));
    } catch (err) {
      setZoneError(errorMessage(err));
    }
  };

  /** The announcement the owner writes by hand today, ready to paste into
   *  WhatsApp or Instagram. */
  const share = async (tr: DeliveryTour) => {
    const cities = tr.zone?.cities?.join(', ') ?? tr.zone?.name ?? '';
    const day = deliveryDay(tr.delivery_date).toLocaleDateString(dateLocale, {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const cutoff = new Date(tr.cutoff_at).toLocaleString(dateLocale, {
      weekday: 'long', hour: '2-digit', minute: '2-digit',
    });
    const window = tr.delivery_start && tr.delivery_end
      ? `\n${t('tourWindow')}: ${tr.delivery_start} - ${tr.delivery_end}`
      : '';
    const lines = [
      tr.name,
      `${cities}${cities ? ' · ' : ''}${day}${window}`,
      `${t('tourCutoff')}: ${cutoff}`,
      // The tour's dedicated link: this page shows ONLY the tour's carte. It is
      // the only way in — a tour never appears on the restaurant's normal site.
      `${WEB_URL}/r/${slug}/tournee/${tr.slug}`,
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setShareFallback(null);
      setCopied(tr.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Non-secure context, denied permission, etc. The whole point of this
      // button is producing the message, so at minimum say so, and let the
      // owner copy it by hand.
      setShareFallback({ id: tr.id, text });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" /></div>;
  }

  const inputCls = 'border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg)] rounded-lg px-3 py-2';
  const warningBoxCls = 'mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm';
  const warningBoxStyle = {
    background: 'color-mix(in oklab, var(--warning-500) 8%, var(--surface))',
    borderColor: 'color-mix(in oklab, var(--warning-500) 30%, var(--line))',
  } as const;

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6" />{t('tours')}</h1>
        <p className="text-[var(--fg-muted)] mt-1">{t('toursDesc')}</p>
      </div>

      {loadError ? (
        <div
          className="flex items-start gap-2 rounded-xl border p-3 text-sm"
          style={{
            background: 'color-mix(in oklab, var(--danger-500) 8%, var(--surface))',
            borderColor: 'color-mix(in oklab, var(--danger-500) 30%, var(--line))',
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--danger-500)' }} />
          <span className="flex-1 text-[var(--fg)]">{loadError}</span>
          <button onClick={load} className="shrink-0 text-xs font-medium underline" style={{ color: 'var(--danger-500)' }}>
            {t('retry')}
          </button>
        </div>
      ) : (
      <>
      {/* getRestaurant failed during load: `slug` fell back to the numeric id
          and the share link below is likely wrong. Say so instead of letting
          the owner paste a broken link. */}
      {slugUnknown && (
        <div className={warningBoxCls} style={warningBoxStyle}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--warning-500)' }} />
          <span className="text-[var(--fg)]">{t('tourSlugUnknown')}</span>
        </div>
      )}

      {/* Without a web-disabled carte there is nothing a tour can serve, and the
          server would reject the save. Say so up front rather than let the owner
          pick a normal carte and hit a 400. */}
      {cartes.length === 0 && (
        <div className={warningBoxCls} style={warningBoxStyle}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--warning-500)' }} />
          <span className="text-[var(--fg)]">
            <span className="font-medium">{t('tourNoCarte')}</span>{' '}
            {t('tourNoCarteHint')}{' '}
            <Link href={`/${rid}/menu/menus`} className="underline font-medium">{t('tourGoToCartes')}</Link>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canEdit && !draft && (
          <button
            onClick={beginNew}
            disabled={cartes.length === 0}
            className="py-2 px-4 rounded-lg bg-[var(--brand-500)] text-white font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />{t('newTour')}
          </button>
        )}
        {/* Tour cities pile up (4-5 new ones a month) since nothing else purges
            them. Keep this sober: a plain toggle, not a management screen.
            Stays visible while the panel is open even if it empties out, so
            it can still be closed. */}
        {canEdit && (zones.length > 0 || manageCities) && (
          <button onClick={() => setManageCities((v) => !v)} className="text-sm underline text-[var(--fg-muted)]">
            {t('tourManageCities')}
          </button>
        )}
      </div>

      {manageCities && (
        <div className="mb-4 p-3 rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-wrap gap-1">
            {zones.map((z) => (
              <span key={z.id} className="px-2 py-1 rounded-full bg-[var(--surface-2)] text-sm flex items-center gap-1">
                {z.name}
                <button onClick={() => removeZone(z)} aria-label={t('delete')} title={t('delete')}>&times;</button>
              </span>
            ))}
          </div>
          {zoneError && <p className="mt-2 text-xs text-[var(--danger-500)]">{zoneError}</p>}
        </div>
      )}

      {draft && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] space-y-3">
          <input
            className={`w-full ${inputCls}`}
            placeholder={t('tourName')}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)]">{t('tourCity')}</span>
              <select
                className={inputCls}
                value={draft.zoneId ?? ''}
                onChange={(e) => setDraft({ ...draft, zoneId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{t('tourNewCity')}</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)]">{t('tourCarte')}</span>
              <select
                className={inputCls}
                value={draft.menuId ?? ''}
                onChange={(e) => setDraft({ ...draft, menuId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{t('tourSelectCarte')}</option>
                {cartes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>

          {draft.zoneId == null && (
            <div>
              <input
                className={`w-full ${inputCls}`}
                placeholder={t('tourCity')}
                value={draft.newCity}
                onChange={(e) => setDraft({ ...draft, newCity: e.target.value })}
              />
              <p className="text-xs text-[var(--fg-subtle)] mt-1">{t('tourCityHint')}</p>
            </div>
          )}
          <p className="text-xs text-[var(--fg-subtle)]">{t('tourCarteHint')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)]">{t('tourDeliveryDate')}</span>
              <input type="date" value={draft.deliveryDate} className={inputCls}
                onChange={(e) => setDraft({ ...draft, deliveryDate: e.target.value })} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)]">{t('tourCutoff')}</span>
              <input type="datetime-local" value={draft.cutoffLocal} className={inputCls}
                onChange={(e) => setDraft({ ...draft, cutoffLocal: e.target.value })} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setCutoffPreset(p)}
                disabled={presetDate(p).getTime() <= Date.now()}
                className="px-2 py-1 rounded-lg bg-[var(--surface-2)] disabled:opacity-40">
                {t(p === 'in2h' ? 'tourCutoffIn2h' : p === 'tonight' ? 'tourCutoffTonight' : 'tourCutoffTomorrow')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)]">{t('tourWindow')}</span>
              <input type="time" value={draft.windowStart} aria-label={t('tourWindowStart')} className={inputCls}
                onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)] truncate">{t('tourWindowEnd')}</span>
              <input type="time" value={draft.windowEnd} aria-label={t('tourWindowEnd')} className={inputCls}
                onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)] truncate">{t('zoneDeliveryFee')}</span>
              <input type="number" min={0} step="0.5" inputMode="decimal" value={draft.deliveryFee}
                placeholder={t('zoneFeeFreePlaceholder')} className={inputCls}
                onChange={(e) => setDraft({ ...draft, deliveryFee: e.target.value })} />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span className="text-[var(--fg-muted)] truncate">{t('zoneMinOrder')}</span>
              <input type="number" min={0} step="0.5" inputMode="decimal" value={draft.minOrder}
                placeholder={t('zoneMinGlobalPlaceholder')} className={inputCls}
                onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })} />
            </label>
          </div>
          <p className="text-xs text-[var(--fg-subtle)]">{t('zoneFeeMinHint')}</p>

          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={draft.requirePrepayment}
              onChange={(e) => setDraft({ ...draft, requirePrepayment: e.target.checked })} />
            {t('tourPrepayment')}
          </label>

          {saveError && <p className="text-sm text-[var(--danger-500)]">{saveError}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            <button disabled={!validDraft(draft) || saving} onClick={() => save(true)}
              className="flex-1 py-2 rounded-lg bg-[var(--brand-500)] text-white font-medium disabled:opacity-50">
              {saving ? '...' : t('tourPublish')}
            </button>
            <button disabled={!validDraft(draft) || saving} onClick={() => save(false)}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] disabled:opacity-50">{t('tourSaveDraft')}</button>
            <button onClick={() => { setDraft(null); setSaveError(null); }}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)]">{t('cancel')}</button>
          </div>
        </div>
      )}

      {listError && <p className="mb-3 text-sm text-[var(--danger-500)]">{listError}</p>}

      {shareFallback && (
        <div className="mb-3 p-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm space-y-2">
          <p>{t('tourShareCopyFailed')}</p>
          <textarea
            readOnly
            value={shareFallback.text}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full text-xs rounded-lg border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--fg)] p-2"
          />
          <button onClick={() => setShareFallback(null)} className="text-xs underline text-[var(--fg-muted)]">{t('close')}</button>
        </div>
      )}

      {tours.length === 0 ? (
        <p className="text-sm text-[var(--fg-subtle)]">{t('tourNoTours')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('tourName')}</DataTableHeadCell>
            <DataTableHeadCell>{t('tourCity')}</DataTableHeadCell>
            <DataTableHeadCell>{t('tourDeliveryDate')}</DataTableHeadCell>
            <DataTableHeadCell>{t('tourCutoff')}</DataTableHeadCell>
            <DataTableHeadCell>{t('tourStatus')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('actions')}</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {ordered.map((tr, i) => {
              const phase = phaseOf(tr, now);
              return (
                <DataTableRow key={tr.id} index={i}>
                  <DataTableCell mobilePrimary>
                    <button className="text-start font-medium hover:underline disabled:no-underline"
                      disabled={!canEdit} onClick={() => beginEdit(tr)}>
                      {tr.name}
                    </button>
                    <div className="text-xs text-[var(--fg-muted)]">{tr.menu?.name ?? ''}</div>
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('tourCity')}>
                    {tr.zone?.cities?.join(', ') || tr.zone?.name || ''}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('tourDeliveryDate')}>
                    {deliveryDay(tr.delivery_date).toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('tourCutoff')}>
                    {new Date(tr.cutoff_at).toLocaleString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('tourStatus')}>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={phase === 'live' ? 'success' : phase === 'upcoming' ? 'info' : 'neutral'}>
                        {t(phase === 'live' ? 'tourLive' : phase === 'upcoming' ? 'tourUpcoming' : 'tourPast')}
                      </Badge>
                      {canEdit ? (
                        <button onClick={() => togglePublished(tr)} className="text-xs underline text-[var(--fg-muted)]">
                          {tr.is_published ? t('tourUnpublish') : t('tourPublish')}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--fg-muted)]">
                          {tr.is_published ? t('tourPublished') : t('tourDraft')}
                        </span>
                      )}
                    </div>
                  </DataTableCell>
                  <DataTableCell align="right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => share(tr)} title={t('tourShare')} aria-label={t('tourShare')} className="p-1">
                        {copied === tr.id
                          ? <span className="text-xs text-[var(--success-500)]">{t('tourShareCopied')}</span>
                          : <Share2 className="w-4 h-4" />}
                      </button>
                      {canEdit && (
                        <button onClick={() => duplicate(tr)} title={t('tourDuplicate')} aria-label={t('tourDuplicate')} className="p-1">
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => remove(tr)} title={t('delete')} aria-label={t('delete')} className="text-[var(--danger-500)] p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
      </>
      )}
    </div>
  );
}
