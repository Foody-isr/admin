'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, ConfirmDialog } from '@/components/ds';
import { ChoiceRow } from '@/components/ds/Selection';
import { TeamEditor } from '@/components/team/TeamWorkspace';
import { RouteAddressField } from '@/components/delivery/RouteAddressField';
import { ApiError, isCourier, updateStaffProfile, type StaffMember, type StaffContactProfile } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';

/** Explicitly edits scoped staff contacts and the courier's default final destination. */
export function StaffProfileEditor({ restaurantId, member, onClose, onSaved }: {
  restaurantId: number; member: StaffMember; onClose: () => void; onSaved: (profile: StaffContactProfile) => void;
}) {
  const { t, locale } = useI18n();
  const params = useParams();
  const { hasPermission } = usePermissions();
  const allowed = Number(params.restaurantId) === restaurantId && hasPermission('staff.manage');
  const currentRestaurant = useRef(Number(params.restaurantId)); currentRestaurant.current = Number(params.restaurantId);
  const initial = useRef({ full_name: member.full_name, phone: member.phone ?? '', address: member.address ?? '', courier_final_address: member.courier_final_address ?? '', courier_final_same_as_address: member.courier_final_same_as_address ?? false });
  const [form, setForm] = useState(initial.current);
  const [busy, setBusy] = useState(false);
  const [resolvingHome, setResolvingHome] = useState(false);
  const [resolvingEnd, setResolvingEnd] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const courier = isCourier(member);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);
  const valid = Boolean(form.full_name.trim()) && (!courier || !form.courier_final_same_as_address || Boolean(form.address.trim()));
  const close = () => { if (!lock.current) { if (dirty) setDiscard(true); else onClose(); } };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowed || lock.current || !valid || resolvingHome || resolvingEnd) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const profile = await updateStaffProfile(restaurantId, member.id, {
        full_name: form.full_name.trim(), phone: form.phone.trim(), address: form.address.trim(),
        ...(courier ? { courier_final_address: form.courier_final_address.trim(), courier_final_same_as_address: form.courier_final_same_as_address } : {}),
      });
      if (alive.current && currentRestaurant.current === restaurantId) onSaved(profile);
    } catch (cause) {
      if (alive.current && currentRestaurant.current === restaurantId) {
        const messages: Record<string, string> = { 'invalid staff phone': 'staffProfileInvalidPhone', 'invalid staff profile': 'staffProfileInvalid', 'staff home address required': 'staffProfileHomeRequired', 'courier defaults require a courier': 'staffProfileCourierChanged', 'staff member not found': 'staffProfileNotFound' };
        setError(t(cause instanceof ApiError ? messages[cause.message] ?? 'staffProfileSaveFailed' : 'staffProfileSaveFailed'));
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!allowed) return null;
  return <>
    <TeamEditor title={t('staffProfileEdit')} description={t('staffProfileDescription')} onClose={close} busy={busy}
      actions={<Button type="submit" form="edit-staff-profile" disabled={busy || !dirty || !valid || resolvingHome || resolvingEnd}>{t(busy ? 'saving' : 'save')}</Button>}>
      <form id="edit-staff-profile" onSubmit={event => void save(event)} className="team-form">
        <div className="team-form-fields">
          <label className="team-field"><span>{t('fullName')}</span><input aria-label={t('fullName')} required maxLength={120} autoComplete="name" value={form.full_name} disabled={busy} onChange={event => setForm(old => ({ ...old, full_name: event.target.value }))} /></label>
          <label className="team-field"><span>{t('staffProfileLoginEmail')}</span><input aria-label={t('staffProfileLoginEmail')} value={member.email} readOnly dir="ltr" type="email" /></label>
          <p className="text-fs-xs text-[var(--fg-muted)]">{t('staffProfileLoginHint')}</p>
          <label className="team-field"><span>{t('phone')}</span><input aria-label={t('phone')} type="tel" dir="ltr" autoComplete="tel" maxLength={40} value={form.phone} disabled={busy} onChange={event => setForm(old => ({ ...old, phone: event.target.value }))} /></label>
          <RouteAddressField restaurantId={restaurantId} locale={locale} label={t('staffProfileAddress')} value={form.address} onChange={address => setForm(old => ({ ...old, address }))} onResolvingChange={setResolvingHome} disabled={busy} t={t} />
        </div>
        {courier && <section className="space-y-4 border-t border-[var(--line)] pt-6">
          <h2 className="text-fs-lg font-semibold">{t('staffProfileDestination')}</h2>
          <p className="text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('staffProfileDestinationHint')}</p>
          <ChoiceRow checked={form.courier_final_same_as_address} disabled={busy} label={t('staffProfileSameAddress')} onChange={event => setForm(old => ({ ...old, courier_final_same_as_address: event.target.checked }))} />
          {form.courier_final_same_as_address
            ? <p role="status" className="rounded-r-md bg-[var(--surface-2)] p-3 text-fs-sm"><bdi>{form.address.trim() || t('staffProfileHomeRequired')}</bdi></p>
            : <RouteAddressField restaurantId={restaurantId} locale={locale} label={t('routeSettingsEndAddress')} placeholder={t('routeSettingsEndPlaceholder')} value={form.courier_final_address} onChange={courier_final_address => setForm(old => ({ ...old, courier_final_address }))} onResolvingChange={setResolvingEnd} disabled={busy} t={t} />}
        </section>}
        {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-fs-sm text-[var(--danger-500)]">{error}</p>}
      </form>
    </TeamEditor>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} description={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} />
  </>;
}
