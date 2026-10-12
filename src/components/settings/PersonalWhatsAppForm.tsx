'use client';

import { useEffect, useRef, useState } from 'react';
import { connectPersonalWhatsApp, getWhatsAppSender, type PersonalWhatsAppInput, type WhatsAppSender } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp-embedded';
import { Button, ConfirmDialog, Field, Input } from '@/components/ds';

const sid = (prefix: string, value: string) => new RegExp(`^${prefix}[0-9a-fA-F]{32}$`).test(value.trim());
const templateFields = [
  ['content_sid_order_confirmed', 'waPersonalConfirmed', true],
  ['content_sid_order_ready', 'waPersonalReady', true],
  ['content_sid_scheduled_confirmed', 'waPersonalScheduled', false],
  ['content_sid_receipt', 'waPersonalReceipt', false],
  ['content_sid_delivery_eta', 'waPersonalEta', false],
] as const;

/** Configure an existing personal Twilio sender with write-only credentials. */
export function PersonalWhatsAppForm({ rid, sender, onSaved, onCancel, onLockChange }: {
  rid: number; sender: WhatsAppSender | null; onSaved: (sender: WhatsAppSender) => void; onCancel: () => void; onLockChange: (locked: boolean) => void;
}) {
  const { t } = useI18n();
  const [authType, setAuthType] = useState<'api_key' | 'auth_token'>(sender && !sender.twilio_api_key_sid ? 'auth_token' : 'api_key');
  const [values, setValues] = useState<PersonalWhatsAppInput>(() => ({
    account_sid: sender?.twilio_account_sid ?? '', api_key_sid: sender?.twilio_api_key_sid ?? '', secret: '',
    sender_sid: sender?.sender_sid ?? '', waba_id: sender?.waba_id ?? '', phone_number_id: sender?.phone_number_id ?? '',
    phone_number: sender?.sender_number ?? '', content_sid_order_confirmed: sender?.content_sid_order_confirmed ?? '',
    content_sid_order_ready: sender?.content_sid_order_ready ?? '', content_sid_scheduled_confirmed: sender?.content_sid_scheduled_confirmed ?? '',
    content_sid_receipt: sender?.content_sid_receipt ?? '', content_sid_delivery_eta: sender?.content_sid_delivery_eta ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onLockChange(dirty || busy); return () => onLockChange(false); }, [dirty, busy, onLockChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);

  const keySID = authType === 'api_key' ? values.api_key_sid.trim() : '';
  const keepSecret = sender?.connection_mode === 'personal' && sender.twilio_account_sid === values.account_sid.trim() && (sender.twilio_api_key_sid ?? '') === keySID;
  const phone = normalizeWhatsAppPhone(values.phone_number);
  const valid = sid('AC', values.account_sid) && (authType === 'auth_token' || sid('SK', keySID)) &&
    (keepSecret && !values.secret || values.secret.trim().length >= 16 && values.secret.trim().length <= 256 && !/\s/.test(values.secret.trim())) &&
    sid('XE', values.sender_sid) && /^[0-9]{1,32}$/.test(values.waba_id.trim()) && /^[0-9]{1,32}$/.test(values.phone_number_id.trim()) && !!phone &&
    templateFields.every(([field, , required]) => !values[field].trim() ? !required : sid('HX', values[field]));
  const update = (field: keyof PersonalWhatsAppInput, value: string) => { setValues(current => ({ ...current, [field]: value })); setDirty(true); setError(''); };
  const input = (field: keyof PersonalWhatsAppInput, label: string, placeholder?: string, required = true, hint?: string) => <Field label={label} hint={hint}>
    <Input aria-label={label} dir="ltr" type={field === 'secret' ? 'password' : field === 'phone_number' ? 'tel' : 'text'} autoComplete={field === 'secret' ? 'new-password' : 'off'} spellCheck={false} required={required} value={values[field]} onChange={event => update(field, event.target.value)} placeholder={placeholder} maxLength={field === 'secret' ? 256 : 64} />
  </Field>;
  const save = async () => {
    if (!valid || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as unknown as PersonalWhatsAppInput;
    payload.api_key_sid = keySID; payload.phone_number = phone!;
    try {
      const row = await connectPersonalWhatsApp(rid, payload);
      if (alive.current) { setDirty(false); setValues(current => ({ ...current, secret: '' })); onSaved(row); }
    } catch {
      if (!alive.current) return;
      // A lost response may follow a successful save. Verify only public metadata;
      // never restore secret values from the server or repeat the write automatically.
      setValues(current => ({ ...current, secret: '' }));
      setError(t('waPersonalSaveFailed'));
      try {
        const row = await getWhatsAppSender(rid);
        if (alive.current && row?.connection_mode === 'personal') { setUncertain(true); }
      } catch { if (alive.current) setUncertain(true); }
    } finally { if (alive.current) { lock.current = false; setBusy(false); } }
  };
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waPersonalSetupHint')} <a className="underline" href="https://www.twilio.com/docs/whatsapp/self-sign-up" target="_blank" rel="noreferrer">{t('waPersonalSetupLink')}</a></p>
    {error && <p role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{error}</p>}
    {uncertain && <p role="status" className="text-sm leading-6 text-[var(--fg-muted)]">{t('waPersonalReloadHint')}</p>}
    <fieldset disabled={busy || uncertain} className="space-y-5">
      <legend className="sr-only">{t('waPersonalCredentials')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {input('account_sid', t('waPersonalAccountSid'), 'AC…')}
        <Field label={t('waPersonalAuthType')}><select aria-label={t('waPersonalAuthType')} className="min-h-11 w-full rounded-r-md border border-[var(--line)] bg-[var(--surface-1)] px-3 text-sm" value={authType} onChange={event => { setAuthType(event.target.value as typeof authType); update('secret', ''); }}>{['api_key', 'auth_token'].map(type => <option key={type} value={type}>{t(type === 'api_key' ? 'waPersonalApiKey' : 'waPersonalAuthToken')}</option>)}</select></Field>
        {authType === 'api_key' && input('api_key_sid', t('waPersonalKeySid'), 'SK…')}
        {input('secret', t(authType === 'api_key' ? 'waPersonalKeySecret' : 'waPersonalAuthToken'), keepSecret ? t('waPersonalKeepSecret') : undefined, !keepSecret, t('waPersonalSecretHint'))}
        {input('sender_sid', t('waPersonalSenderSid'), 'XE…')}
        {input('phone_number', t('waPhone'), '+972500000000')}
        {input('waba_id', t('waPersonalWaba'))}
        {input('phone_number_id', t('waPersonalPhoneId'))}
      </div>
      <div className="space-y-4 border-t border-[var(--line)] pt-5">
        <h3 className="font-semibold">{t('waPersonalTemplates')}</h3>
        <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waPersonalTemplatesHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">{templateFields.map(([field, label, required]) => <div key={field}>{input(field, t(label), 'HX…', required, t(`${label}Hint`))}</div>)}</div>
      </div>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || uncertain || !valid}>{t(busy ? 'waPersonalChecking' : 'waPersonalSave')}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => dirty ? setDiscard(true) : onCancel()}>{t(uncertain ? 'waPersonalReload' : 'cancel')}</Button>
    </div>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('waDiscardTitle')} description={t('waPersonalDiscardHint')} confirmLabel={t('waDiscard')} cancelLabel={t('cancel')} onConfirm={() => { setValues(current => ({ ...current, secret: '' })); setDiscard(false); onCancel(); }} />
  </form>;
}
