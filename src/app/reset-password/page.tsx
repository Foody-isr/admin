'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, LoaderCircle, X } from 'lucide-react';
import AccessShell from '@/components/brand/AccessShell';
import FoodyAdminBrand from '@/components/brand/FoodyAdminBrand';
import { PasswordField } from '@/components/PasswordField';
import { validateResetToken, resetPassword, type ValidateInviteResponse } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Password reset keeps the token contract and successful-session routing unchanged. */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  return <Suspense fallback={<AccessShell><p role="status">{t('loading')}</p></AccessShell>}><ResetPasswordContent /></Suspense>;
}

function ResetPasswordContent() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [resetData, setResetData] = useState<ValidateInviteResponse | null>(null);
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let active = true;
    setValidating(true);
    setTokenError('');
    setResetData(null);
    setPassword('');
    setConfirmPassword('');
    setSuccess(false);
    setError('');
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    if (!token) {
      setTokenError('noResetToken');
      setValidating(false);
      return;
    }
    validateResetToken(token)
      .then(data => {
        if (!data.valid) throw new Error('invalidOrExpiredResetLink');
        if (active) setResetData(data);
      })
      .catch(reason => { if (active) setTokenError(reason instanceof Error ? reason.message : 'invalidOrExpiredResetLink'); })
      .finally(() => { if (active) setValidating(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => () => { if (redirectTimer.current) clearTimeout(redirectTimer.current); }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || success || validating || tokenError) return;
    setError('');
    if (password.length < 8) { setError(t('passwordMinChars')); return; }
    if (password !== confirmPassword) { setError(t('passwordsDoNotMatch')); return; }
    setLoading(true);
    try {
      const result = await resetPassword({ token, password });
      setSuccess(true);
      redirectTimer.current = setTimeout(() => {
        router.push(result.restaurant_ids.length === 1 ? `/${result.restaurant_ids[0]}/dashboard` : result.restaurant_ids.length > 1 ? '/select-restaurant' : '/login');
      }, 2000);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('passwordResetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccessShell>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center"><FoodyAdminBrand subtitle={t('restaurantPortal')} /></div>
        <section className="card">
          {validating ? <div role="status" className="space-y-4 py-8 text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[var(--brand-ink)]" /><h1 className="text-lg font-semibold">{t('validatingResetLink')}</h1></div>
            : tokenError ? <div className="text-center">
              <X aria-hidden className="mx-auto mb-4 size-10 rounded-r-lg bg-[var(--danger-50)] p-2 text-[var(--danger-500)]" />
              <h1 className="mb-2 text-xl font-semibold">{t('invalidResetLink')}</h1>
              <p role="alert" className="mb-6 text-sm text-fg-secondary">{t(tokenError)}</p>
              <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-ink)] hover:underline">{t('goToLogin')}</Link>
            </div>
            : success ? <div role="status" className="text-center">
              <Check aria-hidden className="mx-auto mb-4 size-10 rounded-r-lg bg-[var(--success-50)] p-2 text-[var(--success-500)]" />
              <h1 className="mb-2 text-xl font-semibold">{t('passwordUpdated')}</h1><p className="text-sm text-fg-secondary">{t('passwordResetSuccess')}</p>
            </div>
            : <>
              <h1 className="mb-2 text-2xl font-semibold">{t('resetYourPassword')}</h1>
              <p className="mb-6 text-sm text-fg-secondary">{t('enterNewPasswordFor')} <bdi className="font-semibold break-all">{resetData?.user.email}</bdi></p>
              {error && <p id="reset-error" role="alert" className="mb-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
              <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading} aria-describedby={error ? 'reset-error' : undefined}>
                <PasswordField id="reset-password" label={t('newPassword')} name="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} disabled={loading} placeholder={t('atLeast8Chars')} />
                <PasswordField id="reset-confirm" label={t('confirmPassword')} name="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required disabled={loading} placeholder={t('repeatPassword')}
                  error={confirmPassword && password !== confirmPassword ? t('passwordsDoNotMatch') : undefined} />
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-50">{loading ? t('resetting') : t('resetPassword')}</button>
              </form>
              <div className="mt-5 text-center"><Link href="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brand-ink)] hover:underline">{t('backToLogin')}</Link></div>
            </>}
        </section>
      </div>
    </AccessShell>
  );
}
