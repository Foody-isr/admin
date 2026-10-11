'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MessageSquareText, Smartphone, Unplug } from 'lucide-react';
import { getWhatsAppSender, connectWhatsApp, disconnectWhatsApp, getRestaurantSettings, updateRestaurantSettings, type WhatsAppSender } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { loadMetaSdk } from '@/lib/meta-sdk';
import { Badge, Button, ConfirmDialog, Field, Input, PageHead, Section } from '@/components/ds';
import { normalizeWhatsAppPhone, parseWhatsAppSignupEvent, type WhatsAppSignupIdentity } from '@/lib/whatsapp-embedded';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
const WA_CONFIG_ID = process.env.NEXT_PUBLIC_WA_CONFIG_ID || '';
const SOLUTION_ID = process.env.NEXT_PUBLIC_TWILIO_SOLUTION_ID || '';
const SDK_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
const CONFIGURED = !!META_APP_ID && !!WA_CONFIG_ID && !!SOLUTION_ID;
/** Configure this restaurant's WhatsApp sender and guest phone validation policy. */
export default function WhatsAppSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <WhatsAppWorkspace key={rid} rid={rid} />;
}
function WhatsAppWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [sender, setSender] = useState<WhatsAppSender | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderError, setSenderError] = useState(false);
  const [otpMode, setOtpMode] = useState<'required' | 'skip' | null>(null);
  const [otpLoading, setOtpLoading] = useState(true);
  const [otpError, setOtpError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [signupActive, setSignupActive] = useState(false);
  const [sdkStatus, setSdkStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pending, setPending] = useState<WhatsAppSignupIdentity | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [verifiedAbsent, setVerifiedAbsent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'disconnect' | 'discard' | 'retry' | null>(null);
  const lifetime = useRef({ generation: 0 });
  const sequence = useRef({ sender: 0, otp: 0 });
  const lock = useRef(false);
  const signup = useRef(false);
  const copy = useRef(t); copy.current = t;

  const prepareSdk = useCallback(async () => {
    const generation = lifetime.current.generation;
    setSdkStatus('loading');
    try { await loadMetaSdk(META_APP_ID, SDK_VERSION); if (generation === lifetime.current.generation) setSdkStatus('ready'); }
    catch { if (generation === lifetime.current.generation) setSdkStatus('error'); }
  }, []);
  useEffect(() => { if (CONFIGURED && canEdit) void prepareSdk(); }, [canEdit, prepareSdk]);

  const loadSender = useCallback(async (poll = false) => {
    if (lock.current) return;
    const generation = lifetime.current.generation, request = ++sequence.current.sender;
    const current = () => generation === lifetime.current.generation && request === sequence.current.sender;
    if (!poll) setSenderLoading(true);
    setSenderError(false);
    try { const row = await getWhatsAppSender(rid); if (current()) setSender(row); }
    catch { if (current()) setSenderError(true); }
    finally { if (current()) setSenderLoading(false); }
  }, [rid]);
  const loadOtp = useCallback(async () => {
    const generation = lifetime.current.generation, request = ++sequence.current.otp;
    const current = () => generation === lifetime.current.generation && request === sequence.current.otp;
    setOtpLoading(true); setOtpError(false);
    try {
      const settings = await getRestaurantSettings(rid);
      const value: unknown = settings.otp_mode;
      if (value != null && value !== '' && value !== 'required' && value !== 'skip') throw new Error('Invalid OTP mode');
      if (current()) setOtpMode(value === 'skip' ? 'skip' : 'required');
    } catch { if (current()) setOtpError(true); }
    finally { if (current()) setOtpLoading(false); }
  }, [rid]);
  useEffect(() => {
    const current = lifetime.current;
    void loadSender(); void loadOtp();
    return () => { current.generation += 1; signup.current = false; };
  }, [loadSender, loadOtp]);
  useEffect(() => {
    if (!sender || senderError || busy || ['ONLINE', 'OFFLINE', 'FAILED'].includes(sender.status)) return;
    const timer = setTimeout(() => void loadSender(true), 5000);
    return () => clearTimeout(timer);
  }, [sender, senderError, busy, loadSender]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!signup.current || !canEdit) return;
      const result = parseWhatsAppSignupEvent(event.origin, event.data);
      if (!result) return;
      signup.current = false; setSignupActive(false);
      if (result.kind === 'finished') { setPending(result.identity); setError(''); }
      else if (result.kind === 'failed') setError(copy.current('waSignupFailed'));
      else setNotice(copy.current('waSignupCancelled'));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [canEdit]);
  useEffect(() => {
    if (!pending && !signupActive && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [pending, signupActive, busy]);

  const run = async (action: string, work: (current: () => boolean) => Promise<void>) => {
    if (!canEdit || lock.current) return;
    lock.current = true;
    const generation = lifetime.current.generation;
    const current = () => generation === lifetime.current.generation;
    if (action !== 'otp') { sequence.current.sender += 1; setSenderLoading(false); }
    setBusy(action); setError(''); setNotice('');
    try { await work(current); }
    catch { if (current()) setError(t('waActionFailed')); }
    finally { if (current()) { lock.current = false; setBusy(null); } }
  };
  const launchSignup = () => {
    if (!canEdit || lock.current || !CONFIGURED || sdkStatus !== 'ready' || !window.FB || sender || pending || senderLoading || senderError || signup.current) return;
    signup.current = true; setSignupActive(true);
    void run('sdk', async current => {
      try {
        if (!current() || !signup.current || !window.FB) return;
        window.FB.login(() => { /* The partner solution consumes the code. The trusted FINISH message supplies the identity. */ }, {
          config_id: WA_CONFIG_ID, response_type: 'code', override_default_response_type: true,
          extras: { setup: { solutionID: SOLUTION_ID }, sessionInfoVersion: 3 },
        });
      } catch {
        if (!current()) return;
        signup.current = false; setSignupActive(false); setError(t('waSdkFailed'));
      }
    });
  };
  const cancelSignup = () => { signup.current = false; setSignupActive(false); setNotice(t('waSignupCancelled')); };
  const reconcile = async (current: () => boolean) => {
    const row = await getWhatsAppSender(rid);
    if (!current()) return;
    setSender(row); setSenderError(false); setVerifiedAbsent(!row);
    if (row) {
      setPending(null); setUncertain(false);
      setNotice(t('waConnectionRecovered')); setError('');
    }
  };
  const submitConnect = () => {
    const phone = normalizeWhatsAppPhone(phoneNumber);
    if (!pending || !phone || !displayName.trim() || senderLoading || senderError || signupActive) return;
    const input = { ...pending, phone_number: phone, display_name: displayName.trim() };
    void run('connect', async current => {
      try {
        const row = await connectWhatsApp(rid, input);
        if (!current()) return;
        setSender(row); setPending(null); setUncertain(false); setVerifiedAbsent(false); setNotice(t('waConnectionSaved'));
      } catch {
        if (!current()) return;
        setUncertain(true); setVerifiedAbsent(false); setError(t('waConnectionUncertain'));
        try { await reconcile(current); } catch { /* Keep the uncertain write visible; verification is explicitly retried. */ }
      }
    });
  };
  const verifyConnection = () => void run('verify', async current => {
    setError(t('waConnectionUncertain'));
    try { await reconcile(current); } catch { if (current()) setError(t('waVerifyFailed')); }
  });
  const disconnect = () => {
    if (!sender || senderLoading || senderError) return;
    void run('disconnect', async current => {
      await disconnectWhatsApp(rid);
      if (current()) { setSender(null); setNotice(t('waDisconnected')); }
    });
  };
  const saveOtp = (mode: 'required' | 'skip') => {
    if (!otpMode || otpLoading || otpError || mode === otpMode || signupActive) return;
    void run('otp', async current => {
      await updateRestaurantSettings(rid, { otp_mode: mode });
      if (current()) { setOtpMode(mode); setNotice(t('saved')); }
    });
  };
  const discard = () => { setPending(null); setPhoneNumber(''); setDisplayName(''); setUncertain(false); setVerifiedAbsent(false); setError(''); };
  const terminal = sender && ['ONLINE', 'OFFLINE', 'FAILED'].includes(sender.status);
  const statuses: Record<string, string> = { ONLINE: 'waStatusOnline', OFFLINE: 'waStatusOffline', FAILED: 'waStatusFailed', CREATING: 'waStatusCreating', PENDING_VERIFICATION: 'waStatusVerifying' };
  const disabled = !!busy || signupActive;
  const phone = normalizeWhatsAppPhone(phoneNumber);

  return <div className="max-w-4xl space-y-6">
    <PageHead title="WhatsApp Business" desc={t('waSettingsIntro')} actions={<Button variant="secondary" asChild><Link href={`/${rid}/settings/message-templates`}><MessageSquareText aria-hidden="true" />{t('messageTemplatesFromWhatsApp')}</Link></Button>} />
    {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
    {error && <p role="alert" className="rounded-r-md border border-[var(--line)] p-4 text-sm leading-6 text-[var(--danger-500)]">{error}</p>}
    {notice && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{notice}</p>}
    <Section role="region" aria-label={t('waConnection')} title={<span className="flex items-center gap-2"><MessageSquareText aria-hidden="true" className="size-5" />{t('waConnection')}</span>}>
      {senderLoading ? <p role="status" className="py-4 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : <div className="space-y-4">
        {senderError && <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('waSenderLoadFailed')}</p><Button variant="secondary" disabled={disabled} onClick={() => void loadSender()}>{t('retry')}</Button></div>}
        {sender ? <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><h3 dir="auto" className="break-words font-semibold">{sender.display_name || sender.sender_number}</h3><p className="mt-1 text-sm text-[var(--fg-muted)]"><bdi dir="ltr">{sender.sender_number}</bdi></p></div>
            <Badge tone={sender.status === 'ONLINE' ? 'success' : sender.status === 'FAILED' ? 'danger' : 'neutral'}>{t(statuses[sender.status] || 'waStatusPending')}</Badge>
          </div>
          <p className="text-sm leading-6 text-[var(--fg-muted)]">{t(senderError ? 'waSenderLoadFailed' : !terminal ? 'waPollingHint' : sender.status === 'ONLINE' ? 'waOnlineHint' : 'waUnavailableHint')}</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled} onClick={() => void loadSender()}>{t('refresh')}</Button>{canEdit && <Button variant="ghost" disabled={disabled || senderError} onClick={() => setConfirm('disconnect')}><Unplug aria-hidden="true" />{t('waDisconnect')}</Button>}</div>
        </> : pending ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!uncertain) submitConnect(); }}>
          <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waConfirmIdentity')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('waPhone')} hint={<span id="wa-phone-hint">{t('waPhoneHint')}</span>}><Input type="tel" aria-label={t('waPhone')} aria-describedby="wa-phone-hint" dir="ltr" autoComplete="tel" value={phoneNumber} disabled={!canEdit || disabled || uncertain} aria-invalid={!!phoneNumber && !phone} onChange={event => setPhoneNumber(event.target.value)} placeholder="+972500000000" /></Field>
            <Field label={t('waDisplayName')}><Input dir="auto" autoComplete="organization" value={displayName} disabled={!canEdit || disabled || uncertain} onChange={event => setDisplayName(event.target.value)} /></Field>
          </div>
          {!!phoneNumber && !phone && <p className="text-sm text-[var(--danger-500)]">{t('waPhoneInvalid')}</p>}
          <div className="flex flex-wrap gap-2">
            {uncertain ? <><Button type="button" variant="secondary" disabled={disabled} onClick={verifyConnection}>{t('waVerifyConnection')}</Button>{verifiedAbsent && <Button type="button" variant="secondary" disabled={disabled} onClick={() => setConfirm('retry')}>{t('waRetryConnect')}</Button>}</> : <Button type="submit" disabled={!canEdit || disabled || !phone || !displayName.trim() || senderError}>{t(busy === 'connect' ? 'waConnecting' : 'waConfirmConnect')}</Button>}
            <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirm('discard')}>{t('cancel')}</Button>
          </div>
        </form> : !senderError && <>
          <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waConnectHint')}</p>
          {!CONFIGURED ? <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('waNotConfigured')}</p> : canEdit && <div className="flex flex-wrap gap-2">{signupActive ? <><p role="status" className="w-full text-sm text-[var(--fg-muted)]">{t('waSignupWaiting')}</p><Button variant="secondary" disabled={!!busy} onClick={cancelSignup}>{t('cancel')}</Button></> : <><Button disabled={disabled || sdkStatus !== 'ready'} onClick={launchSignup}>{t(sdkStatus === 'loading' ? 'loading' : 'waConnect')}</Button>{sdkStatus === 'error' && <div role="alert" className="w-full space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('waSdkFailed')}</p><Button variant="secondary" onClick={() => void prepareSdk()}>{t('retry')}</Button></div>}</>}</div>}
        </>}
      </div>}
    </Section>
    <Section role="region" aria-label={t('waOtpTitle')} title={<span className="flex items-center gap-2"><Smartphone aria-hidden="true" className="size-5" />{t('waOtpTitle')}</span>} desc={t('waOtpHint')}>
      {otpLoading ? <p role="status" className="py-4 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : otpError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('waOtpLoadFailed')}</p><Button variant="secondary" disabled={disabled} onClick={() => void loadOtp()}>{t('retry')}</Button></div> : <fieldset className="space-y-3" disabled={!canEdit || disabled}>
        <legend className="sr-only">{t('waOtpTitle')}</legend>
        {(['required', 'skip'] as const).map(mode => <label key={mode} className={[`flex cursor-pointer items-start gap-3 rounded-r-md border p-4 ${otpMode === mode ? 'border-[var(--line-strong)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`, "selection-row"].filter(Boolean).join(" ")}>
          <input type="radio" name="otp_mode" checked={otpMode === mode} onChange={() => saveOtp(mode)} aria-label={t(mode === 'required' ? 'waOtpRequired' : 'waOtpSkip')} aria-describedby={`otp-${mode}-hint`} className="mt-1 size-4 shrink-0 accent-[var(--action)]" />
          <span><span className="block text-sm font-semibold">{t(mode === 'required' ? 'waOtpRequired' : 'waOtpSkip')}</span><span id={`otp-${mode}-hint`} className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t(mode === 'required' ? 'waOtpRequiredHint' : 'waOtpSkipHint')}</span></span>
        </label>)}
      </fieldset>}
    </Section>
    <ConfirmDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }} title={t(confirm === 'disconnect' ? 'waDisconnect' : confirm === 'retry' ? 'waRetryConnect' : 'waDiscardTitle')} description={t(confirm === 'disconnect' ? 'waDisconnectHint' : confirm === 'retry' ? 'waRetryHint' : 'waDiscardHint')} danger={confirm === 'disconnect'} confirmLabel={t(confirm === 'disconnect' ? 'waDisconnect' : confirm === 'retry' ? 'waRetryConnect' : 'waDiscard')} cancelLabel={t('cancel')} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'disconnect') disconnect(); else if (action === 'retry') submitConnect(); else discard(); }} />
  </div>;
}
