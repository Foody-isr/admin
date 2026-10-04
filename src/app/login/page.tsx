'use client';

import { PasswordField } from '@/components/PasswordField';

import AccessShell from '@/components/brand/AccessShell';

import FoodyAdminBrand from '@/components/brand/FoodyAdminBrand';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import {
  login,
  loginWithPasskey,
  passkeysSupported,
  hasPasskeyOnDevice,
  isAuthenticated,
  getStoredRestaurantIds,
  getStoredUser,
  canAccessAdmin,
  logout,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { restaurantHomePath } from '@/lib/courier-access';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [deviceHasPasskey, setDeviceHasPasskey] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  // Reveals the password form when the user opts out of Face ID (or it fails).
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  // Gate the interactive body until the capability check resolves, so passkey
  // devices don't flash the password form before flipping to Face ID.
  const [checked, setChecked] = useState(false);

  // If already logged in, skip to restaurant selection
  useEffect(() => {
    if (isAuthenticated()) {
      const user = getStoredUser();
      const rids = getStoredRestaurantIds();
      if (!canAccessAdmin(user, rids)) {
        logout();
        return;
      }
      if (rids.length === 1) {
        router.replace(restaurantHomePath(rids[0], user?.role ?? ''));
      } else if (rids.length > 1) {
        router.replace('/select-restaurant');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lead with Face ID only on devices that both support a platform authenticator
  // and have previously enrolled/used a passkey here (otherwise the button would
  // be a dead end). Everyone else gets the password form as before.
  useEffect(() => {
    passkeysSupported().then((ok) => {
      setPasskeyAvailable(ok);
      setDeviceHasPasskey(ok && hasPasskeyOnDevice());
      setChecked(true);
    });
  }, []);

  const routeAfterLogin = (restaurantIds: number[], roleName: string) => {
    if (restaurantIds.length === 0) {
      setError(t('noRestaurantAssigned'));
      return;
    }
    if (restaurantIds.length === 1) {
      router.push(restaurantHomePath(restaurantIds[0], roleName));
    } else {
      router.push('/select-restaurant');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { restaurant_ids, user } = await login(email, password, remember);
      routeAfterLogin(restaurant_ids, user.role);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setPasskeyLoading(true);
    try {
      const { restaurant_ids, user } = await loginWithPasskey(remember);
      routeAfterLogin(restaurant_ids, user.role);
    } catch (err: unknown) {
      // Silently ignore the user dismissing the Face ID prompt; on a real
      // failure, surface the error and fall back to the password form so the
      // user is never stranded (e.g. a stale device hint after the passkey was
      // removed elsewhere).
      const name = (err as { name?: string })?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setError(t('passkeyLoginFailed'));
        setShowPasswordForm(true);
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // Face ID leads and the password form is hidden until the user asks for it.
  const passkeyFirst = passkeyAvailable && deviceHasPasskey;
  const showForm = !passkeyFirst || showPasswordForm;

  return (
    <AccessShell>
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <FoodyAdminBrand subtitle={t('restaurantPortal')} />
        </div>

        <div className="card">
          <h1 className="text-2xl font-semibold text-fg-primary">{t('authWelcome')}</h1>
          <p className="text-sm text-fg-secondary mt-2 mb-8">{t('authSignInHelp')}</p>

          {error && (
            <div role="alert" id="login-error" className="mb-4 p-3 bg-[var(--danger-50)] border border-[var(--danger-500)] rounded-r-md text-sm text-[var(--danger-500)]">
              {error}
            </div>
          )}

          {!checked ? (
            // Brief capability check — keep the card height stable, no flash.
            <div className="h-11" aria-hidden />
          ) : passkeyFirst && !showPasswordForm ? (
            <>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                className="btn-primary w-full justify-center gap-2 disabled:opacity-50"
              >
                <Fingerprint className="w-5 h-5" />
                {passkeyLoading ? t('signingIn') : t('signInWithPasskey')}
              </button>
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="mt-4 w-full text-center text-sm text-fg-secondary hover:text-fg-primary"
              >
                {t('usePasswordInstead')}
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading} aria-describedby={error ? 'login-error' : undefined}>
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-fg-primary mb-2">{t('email')}</label>
                  <input
                    type="email" id="login-email" name="email" autoComplete="username" autoCapitalize="none" dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder={t('emailPlaceholder')}
                    required
                    autoFocus={!passkeyFirst}
                  />
                </div>
                <PasswordField id="login-password" name="password" autoComplete="current-password" label={t('password')}
                  value={password} onChange={event => setPassword(event.target.value)} placeholder={t('passwordPlaceholder')} required />
                <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-brand-500"
                  />
                  {t('rememberMe')}
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {loading ? t('signingIn') : t('signIn')}
                </button>
              </form>

              {passkeyAvailable && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-fg-secondary">{t('or')}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading || loading}
                    className="btn-secondary w-full justify-center gap-2 disabled:opacity-50"
                  >
                    <Fingerprint className="w-4 h-4" />
                    {passkeyLoading ? t('signingIn') : t('signInWithPasskey')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AccessShell>
  );
}
