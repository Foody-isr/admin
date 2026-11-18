'use client';
import { useEffect, useState } from 'react';
import { getAuthSecurityStatus, replaceAuthenticator } from '@/lib/api';
import { useMFA } from './MFAChallenge';
import { useI18n } from '@/lib/i18n';

/** Replaces an enrolled authenticator after fresh MFA and password verification. */
export function MFASettings() {
  const { t } = useI18n();
  const mfa = useMFA();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; void getAuthSecurityStatus().then(status => { if (active) setReady(status.enabled && status.mfa_verified); }).catch(() => { if (active) setReady(false); }); return () => { active = false; }; }, []);
  return <section className="space-y-4 rounded-xl border p-5">
    {mfa.view}
    <h2 className="text-lg font-semibold">{t('mfaSettingsTitle')}</h2>
    {ready ? <><p>{t('mfaSettingsHint')}</p><form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try { await replaceAuthenticator(password, mfa.prompt); setMessage(t('mfaReplaced')); }
      catch { setMessage(t('mfaFailed')); }
      finally { setPassword(''); setBusy(false); }
    }}>
      <label className="block" htmlFor="mfa-current-password">{t('mfaPassword')}</label>
      <input id="mfa-current-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="rounded border p-2" />
      <button type="submit" disabled={busy} className="block rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{t(busy ? 'mfaWorking' : 'mfaReplace')}</button>
    </form></> : <p>{t('mfaUnavailable')}</p>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
