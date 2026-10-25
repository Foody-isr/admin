'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageCircle, RefreshCw } from 'lucide-react';
import { Badge, Button, Field, Input } from '@/components/ds';
import { ApiError, beginMetaWhatsAppSignup, completeMetaWhatsAppSignup, getMetaWhatsAppStatus, resumeMetaWhatsAppSignup, type MetaWhatsAppStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { loadMetaSdk } from '@/lib/meta-sdk';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp-embedded';
import { CoexistenceAttempt, coexistenceCode, parseCoexistenceEvent } from '@/lib/whatsapp-coexistence';
import { MetaWhatsAppTemplates } from './MetaWhatsAppTemplates';

/** Pilot onboarding for a restaurant retaining its existing WhatsApp Business app. */
export function MetaWhatsAppCoexistence({ rid, canEdit, disabled = false, onLockChange, onAvailabilityChange }: { rid: number; canEdit: boolean; disabled?: boolean; onLockChange?: (locked: boolean) => void; onAvailabilityChange?: (configured: boolean) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<MetaWhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'prepared' | 'authorizing' | 'saving'>('idle');
  const [prepared, setPrepared] = useState<{ state: string; expires_at: string } | null>(null);
  const [error, setError] = useState('');
  const [templatesLocked, setTemplatesLocked] = useState(false);
  const active = useRef<CoexistenceAttempt | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const copy = useRef(t); copy.current = t;
  const request = useRef(0);
  const permitted = useRef(canEdit); permitted.current = canEdit;

  useEffect(() => { if (status) onAvailabilityChange?.(status.configured); }, [status, onAvailabilityChange]);

  useEffect(() => { onLockChange?.(phase !== 'idle' || templatesLocked); return () => onLockChange?.(false); }, [phase, templatesLocked, onLockChange]);

  const refresh = useCallback(async () => {
    const life = generation.current, sequence = ++request.current;
    try {
      const next = await getMetaWhatsAppStatus(rid);
      if (life === generation.current && sequence === request.current) { setStatus(next); setLoading(false); }
    } catch {
      if (life === generation.current && sequence === request.current) { setLoading(false); setError(copy.current('waCoexLoadFailed')); }
    }
  }, [rid]);
  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; active.current?.cancel(); active.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (status?.connection?.status !== 'syncing' || phase !== 'idle') return;
    const timer = setTimeout(() => void refresh(), 10000);
    return () => clearTimeout(timer);
  }, [status, phase, refresh]);
  useEffect(() => {
    if (phase === 'idle') return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [phase]);
  useEffect(() => {
    if (!prepared || (phase !== 'prepared' && phase !== 'authorizing')) return;
    const timer = setTimeout(() => {
      active.current?.cancel(); active.current = null; setPrepared(null); setPhase('idle'); setError(copy.current('waCoexExpired'));
    }, Math.max(0, Date.parse(prepared.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [prepared, phase]);

  const message = useCallback((cause: unknown) => {
    const known: Record<string, string> = {
      wa_meta_signup_expired: 'waCoexExpired', wa_meta_number_not_coexisting: 'waCoexNumberRejected',
      wa_meta_authorization_invalid: 'waCoexAuthorizationRejected', wa_meta_connection_exists: 'waCoexConflict',
    };
    return copy.current(cause instanceof ApiError && known[cause.message] ? known[cause.message] : 'waCoexFailed');
  }, []);

  const submitIfReady = useCallback(async (attempt: CoexistenceAttempt) => {
    if (active.current !== attempt || !canEdit) return;
    const input = attempt.take(); if (!input) return;
    active.current = null;
    const life = generation.current;
    request.current += 1;
    busy.current = true; setPhase('saving'); setError('');
    try {
      const next = await completeMetaWhatsAppSignup(rid, input);
      if (life === generation.current) setStatus(next);
    } catch (cause) {
      if (life === generation.current) { setError(message(cause)); await refresh(); }
    } finally {
      if (life === generation.current) { active.current = null; busy.current = false; setPrepared(null); setPhase('idle'); }
    }
  }, [rid, canEdit, message, refresh]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const attempt = active.current;
      if (!attempt || !canEdit) return;
      const result = parseCoexistenceEvent(event.origin, event.data); if (!result) return;
      if (result.kind === 'finished') { attempt.acceptIdentity(result.identity); void submitIfReady(attempt); }
      else { attempt.cancel(); active.current = null; setPrepared(null); setPhase('idle'); setError(copy.current(result.kind === 'cancelled' ? 'waSignupCancelled' : 'waSignupFailed')); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [canEdit, submitIfReady]);
  useEffect(() => {
    if (canEdit) return;
    active.current?.cancel(); active.current = null; busy.current = false; setPrepared(null); setPhase('idle');
  }, [canEdit]);

  const prepare = async () => {
    const normalized = normalizeWhatsAppPhone(phone);
    if (!canEdit || disabled || busy.current || !normalized || !status?.configured) return;
    const life = generation.current;
    request.current += 1;
    busy.current = true; setPhase('preparing'); setError('');
    try {
      const session = await beginMetaWhatsAppSignup(rid, normalized);
      await loadMetaSdk(status.app_id, status.graph_version);
      if (life === generation.current && permitted.current) { setPrepared(session); setPhase('prepared'); }
    } catch (cause) { if (life === generation.current) { setError(message(cause)); setPhase('idle'); } }
    finally { if (life === generation.current) busy.current = false; }
  };
  const launch = () => {
    if (!canEdit || disabled || !prepared || !status?.configured || !window.FB || active.current || busy.current) return;
    if (Date.parse(prepared.expires_at) <= Date.now()) { setPrepared(null); setPhase('idle'); setError(t('waCoexExpired')); return; }
    const attempt = new CoexistenceAttempt(prepared.state); active.current = attempt;
    setPhase('authorizing'); setError('');
    try {
      // Synchronous user click preserves popup authorization. Reinitialize after other Meta flows.
      window.FB.init({ appId: status.app_id, version: status.graph_version, autoLogAppEvents: false, xfbml: false });
      window.FB.login(response => {
        if (active.current !== attempt) return;
        const code = coexistenceCode(response);
        if (code) { attempt.acceptCode(code); void submitIfReady(attempt); }
        else { attempt.cancel(); active.current = null; setPrepared(null); setPhase('idle'); setError(copy.current('waSignupCancelled')); }
      }, {
        config_id: status.config_id, response_type: 'code', override_default_response_type: true,
        extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
      });
    } catch { attempt.cancel(); active.current = null; setPrepared(null); setPhase('idle'); setError(t('waSdkFailed')); }
  };
  const cancel = () => { active.current?.cancel(); active.current = null; setPrepared(null); setPhase('idle'); setError(''); };
  const resume = async () => {
    if (!canEdit || disabled || busy.current) return;
    const life = generation.current; request.current += 1; busy.current = true; setPhase('saving'); setError('');
    try { const next = await resumeMetaWhatsAppSignup(rid); if (life === generation.current) setStatus(next); }
    catch (cause) { if (life === generation.current) { setError(message(cause)); await refresh(); } }
    finally { if (life === generation.current) { busy.current = false; setPhase('idle'); } }
  };
  const connection = status?.connection;
  const labels: Record<string, string> = { onboarding: 'waCoexOnboarding', syncing: 'waCoexSyncing', ready: 'waCoexReady', action_required: 'waCoexActionRequired', reconnect_required: 'waCoexReconnect' };
  const canBegin = !connection || connection.status === 'reconnect_required';
  const locked = disabled || phase !== 'idle' || templatesLocked;

  if (status && !status.configured && !connection) return null;
  return <>
    <section className="wa-section" role="region" aria-label={t('waWorkspaceNumber')}>
      <div className="wa-heading"><h2>{t('waWorkspaceNumber')}</h2></div>
      {error && <p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{error}</p>}
      {loading ? <p role="status" className="wa-muted">{t('loading')}</p> : <>
        {!status?.configured && <p className="wa-muted">{t('waCoexNotConfigured')}</p>}
        <div className="wa-channel">
          <span className="wa-icon"><MessageCircle aria-hidden="true" /></span>
          <div className="wa-channel-copy">
            <div className="wa-channel-title">
              {connection ? <><bdi dir="ltr">{connection.phone_number}</bdi><Badge tone={connection.status === 'ready' ? 'success' : 'neutral'}>{t(connection.status === 'ready' ? 'waWorkspaceReady' : labels[connection.status] || 'waCoexActionRequired')}</Badge></> : <span>WhatsApp Business</span>}
            </div>
            <p className="wa-muted">{t(connection ? 'waWorkspaceKeepApp' : 'waWorkspaceConnect')}</p>
          </div>
          {connection && <Button variant="secondary" disabled={locked} onClick={() => { setError(''); void refresh(); }}><RefreshCw aria-hidden="true" />{t('refresh')}</Button>}
        </div>
        {connection?.status === 'syncing' && <div className="wa-sync" role="status"><progress aria-label={t('waWorkspaceSync')} max={100} value={connection.history_progress} /><span className="wa-muted">{t('waWorkspaceSync')} · {connection.history_progress}%</span></div>}
        {connection?.status === 'action_required' && <p role="alert" className="wa-feedback">{t('waCoexUnknownHint')}</p>}
        {connection?.status === 'reconnect_required' && <p role="alert" className="wa-feedback">{t('waCoexReconnectHint')}</p>}
        {canEdit && status?.configured && connection?.status === 'onboarding' && <div className="wa-actions"><Button variant="secondary" disabled={locked} onClick={() => void resume()}>{t('waCoexResume')}</Button></div>}
        {canEdit && status?.configured && canBegin && <div className="mt-5 max-w-lg space-y-3">
          <Field label={t('waPhone')} hint={t('waCoexPhoneHint')}><Input type="tel" dir="ltr" autoComplete="tel" aria-label={t('waCoexExistingNumber')} disabled={locked} value={phone} onChange={event => setPhone(event.target.value)} placeholder="+972500000000" /></Field>
          {phase === 'idle' && <Button disabled={disabled || !normalizeWhatsAppPhone(phone)} onClick={() => void prepare()}>{t('waCoexPrepare')}</Button>}
          {phase === 'prepared' && <Button disabled={disabled} onClick={launch}>{t('waCoexOpenMeta')}</Button>}
          {phase === 'authorizing' && <p role="status" className="wa-muted">{t('waCoexWaiting')}</p>}
          {phase === 'preparing' || phase === 'saving' ? <p role="status">{t('waConnecting')}</p> : phase !== 'idle' && <Button variant="ghost" onClick={cancel}>{t('cancel')}</Button>}
        </div>}
        <details className="wa-details wa-technical">
          <summary>{t('waWorkspaceDetails')}<ChevronDown aria-hidden="true" /></summary>
          <div className="wa-details-body space-y-2 wa-muted">
            {connection && <p>{t('waCoexAccount')}: <bdi dir="ltr">{connection.waba_id}</bdi></p>}
            <p>{t(connection?.notifications_enabled ? 'waCoexActiveHint' : 'waCoexPilotHint')}</p>
          </div>
        </details>
        {!connection && <Button variant="ghost" size="sm" disabled={locked} onClick={() => { setError(''); void refresh(); }}>{t('refresh')}</Button>}
      </>}
    </section>
    {connection && status?.configured && connection.status !== 'reconnect_required' && <MetaWhatsAppTemplates key={`${rid}-${connection.phone_number_id}`} rid={rid} status={status} canEdit={canEdit} disabled={disabled || phase !== 'idle'} onChanged={setStatus} onLockChange={setTemplatesLocked} />}
  </>;
}
