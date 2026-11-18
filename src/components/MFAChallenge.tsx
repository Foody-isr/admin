'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { MFAChallenge, MFAPrompt, MFAResponse } from '@/lib/mfa';
import { useI18n } from '@/lib/i18n';

type Pending = { challenge: MFAChallenge; verify: (code: string) => Promise<MFAResponse>; resolve: (value: MFAResponse) => void; reject: (error: Error) => void };

/** Keeps challenge material and unacknowledged recovery codes out of storage. */
export function useMFA() {
  const { t, locale } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<MFAResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const prompt = useCallback<MFAPrompt>((challenge, verify) => new Promise((resolve, reject) => {
    pendingRef.current?.reject(new Error('Sign-in cancelled'));
    const request = { challenge, verify, resolve, reject };
    pendingRef.current = request; setPending(request); setCode(''); setError(false); setResult(null); setSaved(false);
  }), []);
  useEffect(() => { if (pending) dialog.current?.showModal(); }, [pending]);
  useEffect(() => () => { pendingRef.current?.reject(new Error('Sign-in cancelled')); pendingRef.current = null; }, []);
  const finish = (value?: MFAResponse) => {
    const request = pendingRef.current;
    pendingRef.current = null; dialog.current?.close(); setPending(null); setCode(''); setResult(null); setSaved(false); setBusy(false);
    if (value) request?.resolve(value); else request?.reject(new Error('Sign-in cancelled'));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!pending || busy) return;
    if (result) { if (saved) finish(result); return; }
    setBusy(true); setError(false);
    const request = pending;
    try {
      const completed = await request.verify(code.trim());
      if (pendingRef.current !== request) return;
      setCode('');
      if (completed.recovery_codes?.length || completed.recovery_used) setResult(completed);
      else finish(completed);
    } catch { if (pendingRef.current === request) setError(true); }
    finally { if (pendingRef.current === request) setBusy(false); }
  };
  const view = pending ? (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); finish(); }} aria-labelledby="mfa-heading" className="w-full max-w-lg rounded-2xl p-6 shadow-xl backdrop:bg-black/50" data-sentry-mask data-private dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <form onSubmit={submit} className="space-y-4">
        <h2 id="mfa-heading" className="text-xl font-semibold">{t(result?.recovery_codes?.length ? 'mfaRecoveryTitle' : 'mfaTitle')}</h2>
        {result ? <>
          <p>{t(result.recovery_codes?.length ? 'mfaRecoveryHint' : 'mfaRecoveryUsed')}</p>
          {result.recovery_codes?.length ? <pre className="overflow-auto rounded bg-gray-100 p-3 text-sm select-all" dir="ltr">{result.recovery_codes.join('\n')}</pre> : null}
          <label className="flex items-center gap-2"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />{t(result.recovery_codes?.length ? 'mfaSaved' : 'mfaRead')}</label>
        </> : pending.challenge.enrollment_required && !pending.challenge.secret ? <p>{t('mfaPinEnroll')}</p> : <>
          {pending.challenge.secret ? <><p>{t('mfaEnroll')}</p><code className="block break-all rounded bg-gray-100 p-3 select-all" dir="ltr">{pending.challenge.secret}</code></> : null}
          <label className="block" htmlFor="mfa-code">{t('mfaCode')}</label>
          <input id="mfa-code" autoFocus autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} maxLength={64} required value={code} onChange={e => setCode(e.target.value)} className="w-full rounded border p-3" dir="ltr" />
        </>}
        {error ? <p role="alert" className="text-red-700">{t('mfaFailed')}</p> : null}
        <div className="flex gap-3">
          <button type="button" onClick={() => finish()} className="rounded border px-4 py-2">{t('mfaCancel')}</button>
          {(!pending.challenge.enrollment_required || pending.challenge.secret || result) ? <button type="submit" disabled={busy || (result ? !saved : !code.trim())} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{t(busy ? 'mfaWorking' : 'mfaContinue')}</button> : null}
        </div>
      </form>
    </dialog>
  ) : null;
  return { prompt, view };
}
