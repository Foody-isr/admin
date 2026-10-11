'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, KeyRound, UserRound } from 'lucide-react';
import { PasswordField } from '@/components/PasswordField';
import FoodyLogo from '@/components/brand/FoodyLogo';
import {
  login, loginWithPasskey, passkeysSupported, isAuthenticated,
  getStoredRestaurantIds, getStoredUser, canAccessAdmin, logout,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { restaurantHomePath } from '@/lib/courier-access';
import styles from './page.module.css';

const featureKeys = [
  'loginFeatureSales', 'loginFeatureMenus', 'loginFeatureTables',
  'loginFeaturePayments', 'loginFeatureCustomers', 'loginFeatureOrders',
  'loginFeatureKitchen', 'loginFeatureOnline', 'loginFeatureTeam',
  'loginFeatureReports',
] as const;

/** Two-step sign-in with the existing password and WebAuthn session contracts. */
export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStep, setPasswordStep] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const busy = loading || passkeyLoading;
  const contactUrl = `https://foody-pos.co.il/${locale}/contact`;

  useEffect(() => {
    if (!isAuthenticated()) return;
    const user = getStoredUser();
    const restaurantIds = getStoredRestaurantIds();
    if (!canAccessAdmin(user, restaurantIds)) {
      logout();
      return;
    }
    if (restaurantIds.length === 1) {
      router.replace(restaurantHomePath(restaurantIds[0], user?.role ?? ''));
    } else if (restaurantIds.length > 1) {
      router.replace('/select-restaurant');
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    passkeysSupported().then(supported => { if (active) setPasskeyAvailable(supported); });
    return () => { active = false; };
  }, []);

  const routeAfterLogin = (restaurantIds: number[], role: string) => {
    if (restaurantIds.length === 0) setError(t('noRestaurantAssigned'));
    else router.push(restaurantIds.length === 1 ? restaurantHomePath(restaurantIds[0], role) : '/select-restaurant');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    // Advancing is local: never disclose whether an email has an account.
    if (!passwordStep) {
      setEmail(value => value.trim());
      setPasswordStep(true);
      return;
    }
    setLoading(true);
    try {
      const { restaurant_ids, user } = await login(email, password, remember);
      routeAfterLogin(restaurant_ids, user.role);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (busy || !passkeyAvailable) return;
    setError('');
    setPasskeyLoading(true);
    try {
      const { restaurant_ids, user } = await loginWithPasskey(remember);
      routeAfterLogin(restaurant_ids, user.role);
    } catch (reason: unknown) {
      const name = (reason as { name?: string })?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError(t('passkeyLoginFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const editEmail = () => {
    setPasswordStep(false);
    setPassword('');
    setError('');
    document.getElementById('login-email')?.focus();
  };

  return (
    <main className={styles.page}>
      <section className={styles.authPanel} aria-labelledby="login-heading">
        <div className={styles.brand}><FoodyLogo variant="lockup" width={90} /></div>
        <div className={styles.formContent}>
          <h1 id="login-heading">{t(passwordStep ? 'loginPasswordTitle' : 'signIn')}</h1>
          <p className={styles.intro}>{t('loginNewToFoody')} <a href={contactUrl}>{t('loginGetStarted')}</a></p>
          {error && <p id="login-error" className={styles.error} role="alert">{error}</p>}
          <form onSubmit={handleSubmit} aria-busy={busy} aria-describedby={error ? 'login-error' : undefined}>
            <div className={`${styles.emailField} ${passwordStep ? styles.emailReadonly : ''}`}>
              <input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none"
                spellCheck={false} dir="ltr" placeholder=" " required value={email} readOnly={passwordStep}
                disabled={busy} onChange={event => setEmail(event.target.value)} />
              <label htmlFor="login-email">{t('email')}</label>
              {passwordStep && <button type="button" className={styles.editEmail} onClick={editEmail} disabled={busy}>{t('edit')}</button>}
            </div>
            {passwordStep && <>
              <div className={styles.passwordField}>
                <PasswordField id="login-password" name="password" label={t('password')} autoComplete="current-password"
                  value={password} onChange={event => setPassword(event.target.value)} autoFocus required disabled={busy} />
              </div>
              <label className={styles.remember}>
                <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy} />
                {t('rememberMe')}
              </label>
            </>}
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {loading ? t('signingIn') : t(passwordStep ? 'signIn' : 'continue')}
            </button>
          </form>
          {passkeyAvailable && <>
            <div className={styles.separator}><span>{t('or')}</span></div>
            <button type="button" className={styles.passkeyButton} disabled={busy} onClick={handlePasskeyLogin}>
              <span className={styles.passkeyIcon} aria-hidden="true"><UserRound /><KeyRound /></span>
              {passkeyLoading ? t('signingIn') : t('loginWithPasskey')}
            </button>
          </>}
        </div>
        <div className={styles.preferences}>
          <label htmlFor="login-locale" className="sr-only">{t('language')}</label>
          <select id="login-locale" value={locale} onChange={event => setLocale(event.target.value as typeof locale)}>
            <option value="fr">Français</option><option value="en">English</option><option value="he">עברית</option>
          </select>
        </div>
      </section>
      <aside className={styles.promotion} aria-labelledby="login-promotion-heading">
        <div className={styles.promotionVisual} aria-hidden="true">
          <div className={styles.features}>{featureKeys.map((key, index) => <div key={key} className={index === 4 ? styles.highlight : undefined}>{t(key)}</div>)}</div>
          {/* Reuses the approved FoodyLanding campaign photograph. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.promotionImage} src="/images/login/cafe-israel.webp" alt="" width={1536} height={1024} />
        </div>
        <h2 id="login-promotion-heading">{t('loginPromotionTitle')}</h2>
        <p>{t('loginPromotionDescription')}</p>
        <a href={`https://foody-pos.co.il/${locale}`} className={styles.learnMore}>
          <ArrowUpRight size={20} aria-hidden="true" />{t('loginExploreFoody')}
        </a>
      </aside>
    </main>
  );
}
