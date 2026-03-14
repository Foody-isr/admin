'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateInviteToken, setupAccount, getPosDownloads, ValidateInviteResponse, POSDownloads } from '@/lib/api';

type PosPlatform = 'ipad' | 'macos' | 'both';

const STEPS = ['Password', 'Your Info', 'Restaurant', 'POS'] as const;

export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-4" />
          <p className="text-sm text-fg-secondary">Loading…</p>
        </div>
      </div>
    }>
      <SetupAccountContent />
    </Suspense>
  );
}

function SetupAccountContent() {
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

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token provided. Please use the link from your email.');
      setValidating(false);
      return;
    }

    validateInviteToken(token)
      .then((data) => {
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
        setTokenError(err instanceof Error ? err.message : 'Invalid or expired invitation link.');
      })
      .finally(() => setValidating(false));
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
    switch (currentStep) {
      case 0: return password.length >= 8 && password === confirmPassword;
      case 1: return fullName.trim().length > 0;
      case 2: return restaurantName.trim().length > 0;
      case 3: return !!posPlatform;
      default: return false;
    }
  }

  async function handleComplete() {
    setError('');
    setLoading(true);
    try {
      const result = await setupAccount({
        token,
        password,
        full_name: fullName || undefined,
        phone: phone || undefined,
        restaurant_name: restaurantName || undefined,
        restaurant_slug: restaurantSlug || undefined,
        restaurant_address: restaurantAddress || undefined,
        restaurant_phone: restaurantPhone || undefined,
        pos_platform: posPlatform,
      });

      // Determine where to redirect when user clicks "Go to Dashboard"
      if (result.restaurant_ids.length === 1) {
        setDashboardUrl(`/${result.restaurant_ids[0]}/dashboard`);
      } else if (result.restaurant_ids.length > 1) {
        setDashboardUrl('/select-restaurant');
      }

      // Fetch POS download URLs from server
      getPosDownloads().then(setPosDownloads).catch(() => {});

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Account setup failed');
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-4" />
          <p className="text-sm text-fg-secondary">Validating your invitation…</p>
        </div>
      </div>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
                <span className="text-xl font-black text-white">F</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-fg-primary">Foody Admin</h1>
                <p className="text-xs text-fg-secondary">Restaurant portal</p>
              </div>
            </div>
          </div>

          <div className="card text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-fg-primary mb-2">Invalid Invitation</h2>
            <p className="text-sm text-fg-secondary mb-6">{tokenError}</p>
            <a href="/login" className="text-sm text-brand-500 hover:text-brand-600 font-medium">
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Success state — show POS download instructions
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page py-12 px-4">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
                <span className="text-xl font-black text-white">F</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-fg-primary">Foody Admin</h1>
                <p className="text-xs text-fg-secondary">Setup complete</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-fg-primary mb-1">You&apos;re All Set!</h2>
              <p className="text-sm text-fg-secondary">
                Your account and <strong>{restaurantName}</strong> are ready.
                Download FoodyPOS to start taking orders.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {(posPlatform === 'ipad' || posPlatform === 'both') && posDownloads.ipad && (
                <a
                  href={posDownloads.ipad.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-700 hover:border-blue-500 transition"
                >
                  <div className="w-11 h-11 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">Download for iPad</p>
                    <p className="text-xs text-fg-secondary">{posDownloads.ipad.name}</p>
                  </div>
                  <svg className="w-5 h-5 text-fg-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}

              {(posPlatform === 'macos' || posPlatform === 'both') && posDownloads.macos && (
                <a
                  href={posDownloads.macos.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-700 hover:border-purple-500 transition"
                >
                  <div className="w-11 h-11 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">Download for macOS</p>
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

            <button
              type="button"
              onClick={() => router.push(dashboardUrl)}
              className="btn-primary w-full justify-center"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Wizard ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-page py-12 px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
              <span className="text-xl font-black text-white">F</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-fg-primary">Foody Admin</h1>
              <p className="text-xs text-fg-secondary">Complete your setup</p>
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                  idx < currentStep
                    ? 'bg-brand-500 text-white'
                    : idx === currentStep
                    ? 'bg-brand-500 text-white ring-2 ring-brand-200'
                    : 'bg-gray-700 text-gray-400'
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
              <span className={`text-xs hidden sm:block ${idx <= currentStep ? 'text-fg-primary' : 'text-fg-secondary'}`}>
                {label}
              </span>
              {idx < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 ${idx < currentStep ? 'bg-brand-500' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="card">
          {/* Step 1: Password */}
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-semibold text-fg-primary mb-1">Create Your Password</h2>
              <p className="text-sm text-fg-secondary mb-6">
                Welcome! Set a password for <strong>{inviteData?.user.email}</strong>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="Re-enter your password"
                    required
                    minLength={8}
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Your Info */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-fg-primary mb-1">Your Information</h2>
              <p className="text-sm text-fg-secondary mb-6">Tell us a bit about yourself.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input"
                    placeholder="Your full name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input"
                    placeholder="+972-..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Restaurant */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-fg-primary mb-1">Restaurant Details</h2>
              <p className="text-sm text-fg-secondary mb-6">Set up your restaurant information.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Restaurant Name *</label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="input"
                    placeholder="Joe's Pizza"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Address</label>
                  <input
                    type="text"
                    value={restaurantAddress}
                    onChange={(e) => setRestaurantAddress(e.target.value)}
                    className="input"
                    placeholder="123 Main St, Tel Aviv"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">Phone</label>
                  <input
                    type="tel"
                    value={restaurantPhone}
                    onChange={(e) => setRestaurantPhone(e.target.value)}
                    className="input"
                    placeholder="+972-..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: POS Platform */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-fg-primary mb-1">Choose Your POS</h2>
              <p className="text-sm text-fg-secondary mb-6">
                Which device will you use to manage orders?
              </p>
              <div className="space-y-3">
                {/* iPad */}
                <button
                  type="button"
                  onClick={() => setPosPlatform('ipad')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition flex items-center gap-4 ${
                    posPlatform === 'ipad'
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="w-11 h-11 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">iPad</p>
                    <p className="text-xs text-fg-secondary">iOS app from the App Store</p>
                  </div>
                  {posPlatform === 'ipad' && (
                    <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* macOS */}
                <button
                  type="button"
                  onClick={() => setPosPlatform('macos')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition flex items-center gap-4 ${
                    posPlatform === 'macos'
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="w-11 h-11 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">macOS</p>
                    <p className="text-xs text-fg-secondary">Desktop app (DMG download)</p>
                  </div>
                  {posPlatform === 'macos' && (
                    <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* Both */}
                <button
                  type="button"
                  onClick={() => setPosPlatform('both')}
                  className={`w-full p-4 rounded-xl border-2 text-left transition flex items-center gap-4 ${
                    posPlatform === 'both'
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="w-11 h-11 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fg-primary">Both</p>
                    <p className="text-xs text-fg-secondary">iPad + macOS for multi-station setups</p>
                  </div>
                  {posPlatform === 'both' && (
                    <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-gray-700/50">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-primary transition"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading
                ? 'Setting up…'
                : currentStep === STEPS.length - 1
                ? 'Complete Setup'
                : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
