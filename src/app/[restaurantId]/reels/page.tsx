'use client';

/**
 * Stories / Reels — connect the restaurant's Instagram (Business/Creator) account
 * via Facebook Login for Business and manage which synced reels appear on the
 * customer Stories page. Reuses the same Meta app + FB JS SDK as WhatsApp
 * Embedded Signup.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getSocialConnection,
  connectSocial,
  disconnectSocial,
  syncSocial,
  listReels,
  updateReel,
  reorderReels,
  deleteReel,
  getWebsiteConfig,
  updateWebsiteConfig,
  SocialConnection,
  Reel,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, PageHead, Section } from '@/components/ds';

const FB_SDK_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
// Facebook Login for Business configuration (General login variant) that requests
// the Instagram reels scopes. Pinned to the correct config id in code rather than
// read from NEXT_PUBLIC_META_IG_CONFIG_ID, because a stale build-time env value in
// the hosting provider was shipping the wrong (FBE "Associer à Instagram") config.
// It is a public client-side id, not a secret. Same config works for dev and prod.
const IG_CONFIG_ID = '992572743780171';

interface FacebookSDK {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void;
  getLoginStatus: (callback: (response: unknown) => void, roundtrip?: boolean) => void;
}

declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit?: () => void;
  }
}

/** Pulls the short-lived user access token from the FB.login callback payload. */
function extractAccessToken(response: unknown): string | null {
  if (response && typeof response === 'object') {
    const auth = (response as { authResponse?: { accessToken?: string } }).authResponse;
    if (auth?.accessToken) return auth.accessToken;
  }
  return null;
}

export default function ReelsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasAnyPermission } = usePermissions();
  const { t } = useI18n();
  const canEdit = hasAnyPermission('settings.edit');

  const [conn, setConn] = useState<SocialConnection | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storiesEnabled, setStoriesEnabled] = useState(false);

  // Load the Facebook SDK once (shared pattern with the WhatsApp page).
  useEffect(() => {
    if (typeof window === 'undefined' || window.FB || !META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: FB_SDK_VERSION });
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, []);

  const refresh = useCallback(() => {
    if (!Number.isFinite(rid)) return;
    setLoading(true);
    Promise.all([getSocialConnection(rid, 'instagram'), listReels(rid), getWebsiteConfig(rid)])
      .then(([c, r, cfg]) => {
        setConn(c);
        setReels(r);
        setStoriesEnabled(!!cfg.stories_enabled);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [rid]);

  const toggleStories = async (next: boolean) => {
    setStoriesEnabled(next); // optimistic
    try {
      await updateWebsiteConfig(rid, { stories_enabled: next });
    } catch (e: unknown) {
      setStoriesEnabled(!next); // rollback
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  const launchConnect = () => {
    setError(null);
    setNotice(null);
    if (!window.FB) {
      setError(t('reelsFbNotLoaded'));
      return;
    }
    // The Facebook SDK rejects an async function as the callback ("Expression is
    // of type asyncfunction, not function"), so the callback must be sync and
    // kick off the async work itself.
    const handleAuthResponse = async (response: unknown) => {
      let accessToken = extractAccessToken(response);
      if (!accessToken && window.FB?.getLoginStatus) {
        // Facebook Login for Business establishes the session out-of-band: the
        // login popup can fire this callback with an empty authResponse while the
        // "Associer à Instagram" association completes in a second popup. Once the
        // account is associated the session exists, so recover the token from the
        // current login status instead of failing.
        accessToken = await new Promise<string | null>((resolve) => {
          window.FB!.getLoginStatus((statusResp: unknown) => {
            resolve(extractAccessToken(statusResp));
          }, true);
        });
      }
      if (!accessToken) {
        setError(t('reelsCancelled'));
        return;
      }
      setBusy(true);
      try {
        const result = await connectSocial(rid, 'instagram', { access_token: accessToken });
        if (result.sync_error) {
          setNotice(
            t('reelsConnectedSyncErr')
              .replace('{handle}', result.handle || '')
              .replace('{err}', result.sync_error),
          );
        } else {
          setNotice(
            t('reelsConnectedSynced')
              .replace('{handle}', result.handle || '')
              .replace('{n}', String(result.synced ?? 0)),
          );
        }
        refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };

    // Use the login configuration's default response (a user access token) — the
    // config is a "user access token" type, so we must NOT override to a code
    // (that forces the FBE code-redirect flow, which errors on completion).
    window.FB.login(
      (response: unknown) => {
        void handleAuthResponse(response);
      },
      { config_id: IG_CONFIG_ID },
    );
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { synced } = await syncSocial(rid, 'instagram');
      setNotice(t('reelsSynced').replace('{n}', String(synced)));
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('reelsConfirmDisconnect'))) return;
    setBusy(true);
    try {
      await disconnectSocial(rid, 'instagram');
      setConn({ connected: false, server_configured: conn?.server_configured });
      setReels([]);
      // Turn Stories off so customers never see the tab with no connection behind
      // it. Best-effort: a failure here isn't fatal (the web app also gates the
      // Stories tab on having visible reels).
      if (storiesEnabled) {
        setStoriesEnabled(false);
        try {
          await updateWebsiteConfig(rid, { stories_enabled: false });
        } catch {
          /* non-fatal */
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleVisible = async (reel: Reel) => {
    // Optimistic flip.
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, is_visible: !r.is_visible } : r)));
    try {
      await updateReel(rid, reel.id, { is_visible: !reel.is_visible });
    } catch (e: unknown) {
      setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, is_visible: reel.is_visible } : r)));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= reels.length) return;
    const next = [...reels];
    [next[index], next[target]] = [next[target], next[index]];
    setReels(next);
    try {
      await reorderReels(rid, next.map((r) => r.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      refresh();
    }
  };

  const remove = async (reel: Reel) => {
    if (!window.confirm(t('reelsConfirmRemove'))) return;
    setReels((prev) => prev.filter((r) => r.id !== reel.id));
    try {
      await deleteReel(rid, reel.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      refresh();
    }
  };

  const serverReady = conn?.server_configured !== false && !!META_APP_ID && !!IG_CONFIG_ID;
  // Stories can only be shown once Instagram is connected — otherwise the
  // customer tab would lead to an empty page. The toggle is locked until then.
  const connected = conn?.connected === true;

  return (
    <div>
      <PageHead title={t('reels')} desc={t('reelsSubtitle')} />

      <Section title={t('reelsSectionPage')}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">{t('reelsShowOnSite')}</div>
            <div className="text-fs-sm opacity-70">{t('reelsShowOnSiteDesc')}</div>
            {!connected && !loading && (
              <div className="mt-1 text-fs-sm" style={{ color: 'var(--brand-600)' }}>
                {t('reelsShowOnSiteNeedsConnect')}
              </div>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={storiesEnabled}
            disabled={!canEdit || !connected}
            onClick={() => toggleStories(!storiesEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              !canEdit || !connected ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            style={{ background: storiesEnabled && connected ? 'var(--brand-500)' : 'var(--line)' }}
            aria-label={t('reelsShowOnSite')}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                storiesEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </Section>

      <Section title={t('reelsConnTitle')}>
        {loading ? (
          <p>{t('reelsLoading')}</p>
        ) : conn?.connected ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">@{conn.handle}</div>
              <div className="text-fs-sm opacity-70">
                {conn.last_synced_at
                  ? t('reelsLastSynced').replace('{date}', new Date(conn.last_synced_at).toLocaleString())
                  : t('reelsNotSynced')}
              </div>
              {conn.last_sync_error && (
                <div className="text-fs-sm text-[var(--danger-500)]">
                  {t('reelsLastSyncError').replace('{err}', conn.last_sync_error)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="success">{t('reelsConnected')}</Badge>
              {canEdit && (
                <>
                  <Button variant="secondary" onClick={handleSync} disabled={busy}>
                    {busy ? t('reelsWorking') : t('reelsSyncNow')}
                  </Button>
                  <Button variant="ghost" onClick={handleDisconnect} disabled={busy}>
                    {t('reelsDisconnect')}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-fs-sm opacity-80">{t('reelsConnectHint')}</p>
            {canEdit && (
              <div>
                <Button onClick={launchConnect} disabled={!serverReady || busy}>
                  {busy ? t('reelsConnecting') : t('reelsConnectBtn')}
                </Button>
              </div>
            )}
            {!serverReady && <p className="text-fs-sm text-[var(--danger-500)]">{t('reelsNotConfigured')}</p>}
          </div>
        )}
        {error && <p className="mt-3 text-fs-sm text-[var(--danger-500)]">{error}</p>}
        {notice && <p className="mt-3 text-fs-sm text-[var(--success-500)]">{notice}</p>}
      </Section>

      {conn?.connected && (
        <Section title={t('reelsSectionCount').replace('{n}', String(reels.length))}>
          {reels.length === 0 ? (
            <p className="text-fs-sm opacity-70">{t('reelsEmpty')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {reels.map((reel, i) => (
                <div
                  key={reel.id}
                  className={`flex flex-col overflow-hidden rounded-lg border border-[var(--line)] ${
                    reel.is_visible ? '' : 'opacity-50'
                  }`}
                >
                  <div className="relative aspect-[9/16] bg-black">
                    {reel.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={reel.thumbnail_url} alt={reel.caption || 'reel'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-fs-sm text-white/60">
                        {t('reelsNoPreview')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    <p className="line-clamp-2 text-fs-sm opacity-80">{reel.caption || '—'}</p>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-1">
                        <Button variant="ghost" onClick={() => toggleVisible(reel)}>
                          {reel.is_visible ? t('reelsHide') : t('reelsShow')}
                        </Button>
                        <Button variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                          ↑
                        </Button>
                        <Button variant="ghost" onClick={() => move(i, 1)} disabled={i === reels.length - 1}>
                          ↓
                        </Button>
                        <Button variant="ghost" onClick={() => remove(reel)}>
                          {t('reelsDelete')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
