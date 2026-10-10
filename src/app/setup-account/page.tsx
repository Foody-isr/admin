'use client';

import { PasswordField } from '@/components/PasswordField';
import { Tablet, Monitor, LayoutGrid } from 'lucide-react';

import AccessShell from '@/components/brand/AccessShell';

import FoodyAdminBrand from '@/components/brand/FoodyAdminBrand';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  validateInviteToken,
  setupAccount,
  getPosDownloads,
  logout,
  ValidateInviteResponse,
  POSDownloads,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type PosPlatform = 'ipad' | 'macos' | 'both';

export default function SetupAccountPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <AccessShell>
        <div className="text-center" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-4" />
          <p className="text-sm text-fg-secondary">{t('loading')}</p>
        </div>
      </AccessShell>
    }>
      <SetupAccountContent />
    </Suspense>
  );
}

function SetupAccountContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [inviteData, setInviteData] = useState<ValidateInviteResponse | null>(null);
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Your Info
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Staff choose their private restaurant-specific POS code during setup.
  const [posPin, setPosPin] = useState('');
  const [confirmPosPin, setConfirmPosPin] = useState('');

  // Step 3: Restaurant
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantSlug, setRestaurantSlug] = useState('');
  const [restaurantAddress, setRestaurantAddress] = useState('');
  const [restaurantPhone, setRestaurantPhone] = useState('');

  // Step 4: POS
  const [posPlatform, setPosPlatform] = useState<PosPlatform>('ipad');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState('/login');
  const [posDownloads, setPosDownloads] = useState<POSDownloads>({});
  const [downloadsLoading, setDownloadsLoading] = useState(false);

  // Staff only set a password + their info — they must not configure the
  // restaurant or POS (that's the owner's). Owners keep the full 4-step wizard.
  // Branch on the invite's explicit `kind`; a staff member may already own a
  // restaurant elsewhere, so the presence of `restaurant` is not reliable.
  // Fall back to the legacy heuristic for older servers that omit `kind`.
  const isStaff = !!inviteData && (inviteData.kind ? inviteData.kind === 'staff_setup' : !inviteData.restaurant);
  const STEPS = isStaff
    ? [t('stepPassword'), t('stepYourInfo'), t('stepPOSCode')]
    : [t('stepPassword'), t('stepYourInfo'), t('stepRestaurant'), t('stepPOS')];

  // Validate token on mount
  useEffect(() => {
    let active = true;
    setValidating(true);
    setTokenError('');
    setInviteData(null);
    setPassword('');
    setConfirmPassword('');
    setPosPin('');
    setConfirmPosPin('');
    setCurrentStep(0);
    setSuccess(false);
    setError('');
    setFullName('');
    setPhone('');
    setRestaurantName('');
    setRestaurantSlug('');
    setRestaurantAddress('');
    setRestaurantPhone('');
    setPosPlatform('ipad');
    setPosDownloads({});
    if (!token) {
      setTokenError('noInvitationToken');
      setValidating(false);
      return;
    }

    validateInviteToken(token)
      .then((data) => {
        if (!active) return;
        if (!data.valid) throw new Error('invalidOrExpiredInvitation');
        setInviteData(data);
        setFullName(data.user.full_name || '');
        setPhone(data.user.phone || '');
        if (data.restaurant) {
          setRestaurantName(data.restaurant.name === 'My Restaurant' ? '' : data.restaurant.name);
          setRestaurantSlug(data.restaurant.slug || '');
          setRestaurantAddress(data.restaurant.address || '');
          setRestaurantPhone(data.restaurant.phone || '');
          if (data.restaurant.pos_platform) {
            setPosPlatform(data.restaurant.pos_platform as PosPlatform);
          }
        }
      })
      .catch((err) => {
        if (active) setTokenError(err instanceof Error ? err.message : 'invalidOrExpiredInvitation');
      })
      .finally(() => { if (active) setValidating(false); });
    return () => { active = false; };
  }, [token]);

  // Auto-generate slug from restaurant name
  useEffect(() => {
    if (restaurantName) {
      setRestaurantSlug(
        restaurantName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      );
    }
  }, [restaurantName]);

  function canProceed(): boolean {
    if (isStaff && currentStep === 2) {
      return /^\d{4,6}$/.test(posPin) && posPin === confirmPosPin;
    }
    switch (currentStep) {
      case 0: return password.length >= 8 && password === confirmPassword;
      case 1: return fullName.trim().length > 0;
      case 2: return restaurantName.trim().length > 0;
      case 3: return !!posPlatform;
      default: return false;
    }
  }

  async function handleComplete() {
    if (loading || !canProceed()) return;
    setError('');
    setLoading(true);
    try {
      const result = await setupAccount({
        token,
        password,
        full_name: fullName || undefined,
        phone: phone || undefined,
        // Staff invites carry no restaurant/POS setup — only owners do.
        restaurant_name: isStaff ? undefined : restaurantName || undefined,
        restaurant_slug: isStaff ? undefined : restaurantSlug || undefined,
        restaurant_address: isStaff ? undefined : restaurantAddress || undefined,
        restaurant_phone: isStaff ? undefined : restaurantPhone || undefined,
        pos_platform: isStaff ? undefined : posPlatform,
        pos_pin: isStaff ? posPin : undefined,
      });

      // Determine where to redirect when user clicks "Go to Dashboard"
      if (result.restaurant_ids.length === 1) {
        setDashboardUrl(`/${result.restaurant_ids[0]}/dashboard`);
      } else if (result.restaurant_ids.length > 1) {
        setDashboardUrl('/select-restaurant');
      }

      if (isStaff) {
        // Account setup returns a token, but invited floor staff should not
        // remain signed in to the administration portal on this browser.
        logout();
      } else {
        setDownloadsLoading(true);
        getPosDownloads().then(setPosDownloads).catch(() => { setPosDownloads({}); }).finally(() => setDownloadsLoading(false));
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('accountSetupFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (loading || !canProceed()) return;
    setError('');
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  // Loading state
  if (validating) {
    return (
      <AccessShell>
        <div className="text-center" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-4" />
          <p className="text-sm text-fg-secondary">{t('validatingInvitation')}</p>
        </div>
      </AccessShell>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <AccessShell>
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <FoodyAdminBrand subtitle={t('restaurantPortal')} />
          </div>

          <div className="card text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-[var(--danger-50)] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--danger-500)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-fg-primary mb-2">{t('invalidInvitation')}</h1>
            <p className="text-sm text-fg-secondary mb-6" role="alert">{t(tokenError)}</p>
            <Link href="/login" className="text-sm text-[var(--brand-ink)] hover:underline font-medium">
              {t('goToLogin')}
            </Link>
          </div>
        </div>
      </AccessShell>
    );
  }

  // Success state — show POS download instructions
  if (success) {
    return (
      <AccessShell>
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-6">
            <FoodyAdminBrand subtitle={t('setupComplete')} />
          </div>

          <div className="card">
            <div className="text-center mb-6" role="status">
              <div className="w-12 h-12 mx-auto mb-4 bg-[var(--success-50)] rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--success-500)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('youreAllSet')}</h1>
              <p className="text-sm text-fg-secondary">
				{isStaff
				  ? t('staffSetupReady')
				  : <>{t('yourAccountAnd')} <strong>{restaurantName}</strong> {t('areReady')}</>}
              </p>
            </div>

            {!isStaff && (posPlatform === 'macos' || posPlatform === 'both') && <p role="status" className="mb-4 text-sm text-fg-secondary">{downloadsLoading ? t('loading') : !posDownloads.macos ? t('posDownloadUnavailable') : ''}</p>}
            <div className="space-y-3 mb-6">
              {(posPlatform === 'macos' || posPlatform === 'both') && posDownloads.macos && (
                <a
                  href={posDownloads.macos.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-r-lg border-2 border-[var(--line)] hover:border-[var(--brand-ink)] transition"
                >
                  <div className="w-11 h-11 bg-[var(--summary-bg)] rounded-r-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-[var(--summary-fg)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">{t('downloadMacOS')}</p>
                    <p className="text-xs text-fg-secondary">
                      {posDownloads.macos.name}{posDownloads.macos.version ? ` v${posDownloads.macos.version}` : ''}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-fg-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              )}
            </div>

			{!isStaff && (
			  <button
				type="button"
				onClick={() => router.push(dashboardUrl)}
				className="btn-primary w-full justify-center"
			  >
				{t('goToDashboard')}
			  </button>
			)}
          </div>
        </div>
      </AccessShell>
    );
  }

  // ─── Wizard ────────────────────────────────────────────────────────
  return (
    <AccessShell>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <FoodyAdminBrand subtitle={t('completeYourSetup')} />
        </div>

        {/* Step indicator */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8" aria-label={t('completeYourSetup')}>
          {STEPS.map((label, idx) => (
            <div key={label} aria-current={idx === currentStep ? 'step' : undefined} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                  idx < currentStep
                    ? 'bg-[var(--action)] text-[var(--action-fg)]'
                    : idx === currentStep
                    ? 'bg-[var(--action)] text-[var(--action-fg)] ring-2 ring-[var(--line-strong)]'
                    : 'bg-[var(--surface-2)] text-fg-secondary'
                }`}
              >
                {idx < currentStep ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span className={`text-xs sr-only sm:not-sr-only ${idx <= currentStep ? 'text-fg-primary' : 'text-fg-secondary'}`}>
                {label}
              </span>
              {idx < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 ${idx < currentStep ? 'bg-brand-500' : 'bg-[var(--line)]'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-[var(--danger-50)] rounded-r-md text-sm text-[var(--danger-500)]">
            {error}
          </div>
        )}

        <form className="card" onSubmit={event => { event.preventDefault(); handleNext(); }} aria-busy={loading}>
          {/* Step 1: Password */}
          {currentStep === 0 && (
            <div>
              <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('createYourPassword')}</h1>
              <p className="text-sm text-fg-secondary mb-6">
                {t('welcomeSetPassword')} <bdi className="font-semibold break-all">{inviteData?.user.email}</bdi>
              </p>
              <div className="space-y-4">
                <PasswordField id="setup-password" label={t('passwordRequired')} value={password} onChange={event => setPassword(event.target.value)} name="password" autoComplete="new-password" required minLength={8} autoFocus placeholder={t('minCharsPlaceholder')} disabled={loading} />
                <PasswordField id="setup-confirmPassword" label={t('confirmPasswordRequired')} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} name="confirmPassword" autoComplete="new-password" required minLength={8} placeholder={t('reenterPassword')} error={confirmPassword && password !== confirmPassword ? t('passwordsMismatch') : undefined} disabled={loading} />
              </div>
            </div>
          )}

          {/* Step 2: Your Info */}
          {currentStep === 1 && (
            <div>
              <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('yourInformation')}</h1>
              <p className="text-sm text-fg-secondary mb-6">{t('tellUsAboutYourself')}</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="setup-fullName" className="block text-sm font-medium text-fg-secondary mb-1">{t('fullNameRequired')}</label>
                  <input
                    type="text"
                    id="setup-fullName" name="fullName" autoComplete="name" value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input"
                    placeholder={t('yourFullName')}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="setup-phone" className="block text-sm font-medium text-fg-secondary mb-1">{t('phone')}</label>
                  <input
                    type="tel"
                    id="setup-phone" name="phone" autoComplete="tel" dir="ltr" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input"
                    placeholder={t('phonePlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

		  {/* Staff step 3: private POS code */}
		  {isStaff && currentStep === 2 && (
			<div>
			  <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('createPOSCode')}</h1>
			  <p className="text-sm text-fg-secondary mb-6">{t('posCodeSetupHint')}</p>
			  <div className="space-y-4">
				<PasswordField id="setup-posPin" label={t('posCode')} value={posPin} onChange={event => setPosPin(event.target.value.replace(/\D/g, '').slice(0, 6))} name="posPin" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={6} autoComplete="new-password" autoFocus className="text-center text-2xl tracking-[0.35em]" disabled={loading} />
				<PasswordField id="setup-confirmPosPin" label={t('confirmPOSCode')} value={confirmPosPin} onChange={event => setConfirmPosPin(event.target.value.replace(/\D/g, '').slice(0, 6))} name="confirmPosPin" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={6} autoComplete="new-password" className="text-center text-2xl tracking-[0.35em]" error={confirmPosPin && posPin !== confirmPosPin ? t('posCodesMismatch') : undefined} disabled={loading} />
			  </div>
			</div>
		  )}

          {/* Owner step 3: Restaurant */}
          {!isStaff && currentStep === 2 && (
            <div>
              <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('restaurantDetails')}</h1>
              <p className="text-sm text-fg-secondary mb-6">{t('setupRestaurantInfo')}</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="setup-restaurantName" className="block text-sm font-medium text-fg-secondary mb-1">{t('restaurantNameRequired')}</label>
                  <input
                    type="text"
                    id="setup-restaurantName" name="restaurantName" autoComplete="organization" value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="input"
                    placeholder={t('restaurantNamePlaceholder')}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="setup-restaurantAddress" className="block text-sm font-medium text-fg-secondary mb-1">{t('address')}</label>
                  <input
                    type="text"
                    id="setup-restaurantAddress" name="restaurantAddress" autoComplete="street-address" value={restaurantAddress}
                    onChange={(e) => setRestaurantAddress(e.target.value)}
                    className="input"
                    placeholder={t('addressPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="setup-restaurantPhone" className="block text-sm font-medium text-fg-secondary mb-1">{t('restaurantPhone')}</label>
                  <input
                    type="tel"
                    id="setup-restaurantPhone" name="restaurantPhone" autoComplete="tel" dir="ltr" value={restaurantPhone}
                    onChange={(e) => setRestaurantPhone(e.target.value)}
                    className="input"
                    placeholder={t('phonePlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: POS Platform */}
          {!isStaff && currentStep === 3 && (
            <div>
              <h1 className="text-lg font-semibold text-fg-primary mb-1">{t('chooseYourPOS')}</h1>
              <p className="text-sm text-fg-secondary mb-6">
                {t('whichDevice')}
              </p>
              <fieldset className="space-y-3" disabled={loading}>
                <legend className="sr-only">{t('chooseYourPOS')}</legend>
                {([
                  { value: 'ipad', title: 'ipad', description: 'iosApp', Icon: Tablet },
                  { value: 'macos', title: 'macos', description: 'desktopApp', Icon: Monitor },
                  { value: 'both', title: 'both', description: 'multiStation', Icon: LayoutGrid },
                ] as const).map(({ value, title, description, Icon }) => (
                  <label key={value} className={[`flex min-h-20 cursor-pointer items-center gap-4 rounded-r-lg border p-4 ${posPlatform === value ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)]' : 'border-[var(--line-strong)] hover:bg-[var(--surface-2)]'}`, "selection-row"].filter(Boolean).join(" ")}>
                    <input type="radio" name="pos-platform" value={value} checked={posPlatform === value} onChange={() => setPosPlatform(value)} className="size-4 shrink-0 accent-[var(--action)]" />
                    <Icon aria-hidden className="size-6 shrink-0 text-[var(--brand-ink)]" />
                    <span><span className="block text-sm font-semibold">{t(title)}</span><span className="block text-xs text-fg-secondary">{t(description)}</span></span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-[var(--line)]">
            {currentStep > 0 ? (
              <button
                type="button"
                disabled={loading} onClick={() => setCurrentStep(currentStep - 1)}
                className="min-h-12 px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-primary transition disabled:opacity-50"
              >
                {t('back')}
              </button>
            ) : (
              <div />
            )}
            <button
              type="submit"
              disabled={!canProceed() || loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading
                ? t('settingUp')
                : currentStep === STEPS.length - 1
                ? t('completeSetup')
                : t('continue')}
            </button>
          </div>
        </form>
      </div>
    </AccessShell>
  );
}
