'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import {
  login,
  loginWithPasskey,
  passkeysSupported,
  isAuthenticated,
  getStoredRestaurantIds,
  getStoredUser,
  canAccessAdmin,
  logout,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

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
        router.replace(`/${rids[0]}/dashboard`);
      } else if (rids.length > 1) {
        router.replace('/select-restaurant');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only surface the Face ID button on devices with a platform authenticator.
  useEffect(() => {
    passkeysSupported().then(setPasskeyAvailable);
  }, []);

  const routeAfterLogin = (restaurantIds: number[]) => {
    if (restaurantIds.length === 0) {
      setError(t('noRestaurantAssigned'));
      return;
    }
    if (restaurantIds.length === 1) {
      router.push(`/${restaurantIds[0]}/dashboard`);
    } else {
      router.push('/select-restaurant');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { restaurant_ids } = await login(email, password, remember);
      routeAfterLogin(restaurant_ids);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      setError(t('passkeyNeedEmail'));
      return;
    }
    setError('');
    setPasskeyLoading(true);
    try {
      const { restaurant_ids } = await loginWithPasskey(email, remember);
      routeAfterLogin(restaurant_ids);
    } catch (err: unknown) {
      // Silently ignore the user dismissing the Face ID prompt.
      const name = (err as { name?: string })?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setError(t('passkeyLoginFailed'));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
              <span className="text-xl font-black text-white">F</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-fg-primary">{t('foodyAdmin')}</h1>
              <p className="text-xs text-fg-secondary">{t('restaurantPortal')}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-fg-primary mb-6">{t('signIn')}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder={t('emailPlaceholder')}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder={t('passwordPlaceholder')}
                required
              />
            </div>
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
        </div>
      </div>
    </div>
  );
}
