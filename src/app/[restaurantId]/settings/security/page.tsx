'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, ShieldCheck, Trash2 } from 'lucide-react';
import {
  clearPasskeyOnDevice, deletePasskey, listPasskeys, passkeysSupported,
  registerPasskey, type PasskeyCredential,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, ConfirmDialog, Field, Input, PageHead, Section } from '@/components/ds';

/** Manage the signed-in user's passkeys independently of the active restaurant. */
export default function SecuritySettingsPage() {
  const { t, locale } = useI18n();
  const copy = useRef(t);
  copy.current = t;
  const lifetime = useRef({ generation: 0 });
  const lock = useRef(false);
  const loadSequence = useRef(0);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'enroll' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [removing, setRemoving] = useState<PasskeyCredential | null>(null);

  const load = useCallback(async () => {
    const generation = lifetime.current.generation;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const list = await listPasskeys();
      if (generation === lifetime.current.generation && sequence === loadSequence.current) setPasskeys(list);
    } catch (cause) {
      if (generation === lifetime.current.generation && sequence === loadSequence.current) {
        setLoadError(cause instanceof Error ? cause.message : copy.current('loadFailed'));
      }
    } finally {
      if (generation === lifetime.current.generation && sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const current = lifetime.current;
    const generation = current.generation;
    void passkeysSupported().then(value => {
      if (generation === current.generation) setSupported(value);
    });
    void load();
    return () => { current.generation += 1; };
  }, [load]);

  const enroll = async () => {
    if (lock.current || loading || loadError || !supported) return;
    lock.current = true;
    const generation = lifetime.current.generation;
    setBusy('enroll');
    setError('');
    setResult('');
    try {
      const credential = await registerPasskey(name.trim());
      if (generation !== lifetime.current.generation) return;
      setPasskeys(current => [credential, ...current.filter(key => key.id !== credential.id)]);
      setName('');
      setResult(t('passkeyAdded'));
    } catch (cause) {
      if (generation !== lifetime.current.generation) return;
      const code = (cause as { name?: string })?.name;
      if (code === 'InvalidStateError') setError(t('passkeyAlreadyRegistered'));
      else if (code !== 'NotAllowedError' && code !== 'AbortError') setError(t('passkeyEnrollFailed'));
    } finally {
      if (generation === lifetime.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  const remove = async (credential: PasskeyCredential) => {
    if (lock.current || loading || loadError) return;
    lock.current = true;
    const generation = lifetime.current.generation;
    setBusy('delete');
    setError('');
    setResult('');
    try {
      await deletePasskey(credential.id);
      if (generation !== lifetime.current.generation) return;
      const next = passkeys.filter(key => key.id !== credential.id);
      setPasskeys(next);
      if (next.length === 0) clearPasskeyOnDevice();
      setResult(t('passkeyRemoved'));
    } catch {
      if (generation === lifetime.current.generation) setError(t('passkeyDeleteFailed'));
    } finally {
      if (generation === lifetime.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  const date = (value?: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('securitySettings')} desc={t('securitySettingsDesc')} />
    <Section title={<span className="flex items-center gap-2"><Fingerprint aria-hidden="true" className="size-5" />{t('passkeysTitle')}</span>} desc={t('passkeysDesc')}>
      {loading ? <p role="status" className="py-6 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3">
        <p className="text-sm text-[var(--danger-500)]">{loadError}</p>
        <Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button>
      </div> : <>
        {passkeys.length ? <ul className="divide-y divide-[var(--line)]">
          {passkeys.map(credential => <li key={credential.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3 py-5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
            <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]"><Fingerprint className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold" dir="auto">{credential.name || t('passkeysTitle')}</p>
              <dl className="mt-2 space-y-1 text-xs text-[var(--fg-muted)]">
                <div><dt className="inline">{t('passkeyAddedOn')} </dt><dd className="inline"><bdi>{date(credential.created_at)}</bdi></dd></div>
                <div><dt className="inline">{t('passkeyLastUsed')} </dt><dd className="inline"><bdi>{date(credential.last_used_at)}</bdi></dd></div>
              </dl>
            </div>
            <Button variant="ghost" className="col-start-2 justify-self-start sm:col-start-auto sm:self-center" disabled={!!busy} aria-label={`${t('delete')} · ${credential.name || t('passkeysTitle')}`} onClick={() => setRemoving(credential)}><Trash2 aria-hidden="true" />{t('delete')}</Button>
          </li>)}
        </ul> : <p className="py-5 text-sm text-[var(--fg-muted)]">{t('passkeysEmpty')}</p>}
        {supported === null ? <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p> : supported ?
          <form className="mt-5 flex flex-col items-stretch gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); void enroll(); }}>
            <Field label={t('passkeyNameLabel')} grow><Input dir="auto" value={name} disabled={!!busy} onChange={event => setName(event.target.value)} placeholder={t('passkeyNamePlaceholder')} maxLength={40} /></Field>
            <Button type="submit" disabled={!!busy}><Fingerprint aria-hidden="true" />{t(busy === 'enroll' ? 'passkeyEnrolling' : 'passkeyAdd')}</Button>
          </form> : <p className="mt-5 flex items-start gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]"><ShieldCheck aria-hidden="true" className="mt-1 size-4 shrink-0" />{t('passkeysUnsupported')}</p>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{error}</p>}
      {result && <p role="status" className="mt-4 text-sm text-[var(--success-500)]">{result}</p>}
    </Section>
    <ConfirmDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }} title={t('passkeyRemoveTitle')}
      description={t('passkeyRemoveHint').replace('{name}', removing?.name || t('passkeysTitle'))} danger confirmLabel={t('delete')} cancelLabel={t('cancel')}
      onConfirm={() => { const credential = removing; setRemoving(null); if (credential) void remove(credential); }} />
  </div>;
}
