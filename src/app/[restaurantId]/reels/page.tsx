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
// Facebook Login for Business configuration that requests the Instagram reels
// scopes (instagram_business_basic). Create it in the same Meta app as WhatsApp.
const IG_CONFIG_ID = process.env.NEXT_PUBLIC_META_IG_CONFIG_ID || '';

interface FacebookSDK {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit?: () => void;
  }
}

/** Narrows the FB.login callback payload to the authorization code, if present. */
function extractCode(response: unknown): string | null {
  if (response && typeof response === 'object') {
    const auth = (response as { authResponse?: { code?: string } }).authResponse;
    if (auth?.code) return auth.code;
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
    window.FB.login(
      async (response: unknown) => {
        const code = extractCode(response);
        if (!code) {
          setError(t('reelsCancelled'));
          return;
        }
        setBusy(true);
        try {
          const result = await connectSocial(rid, 'instagram', { code });
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
      },
      { config_id: IG_CONFIG_ID, response_type: 'code', override_default_response_type: true },
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

  return (
    <div>
      <PageHead title={t('reels')} desc={t('reelsSubtitle')} />

      <Section title={t('reelsSectionPage')}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">{t('reelsShowOnSite')}</div>
            <div className="text-fs-sm opacity-70">{t('reelsShowOnSiteDesc')}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={storiesEnabled}
            disabled={!canEdit}
            onClick={() => toggleStories(!storiesEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              !canEdit ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            style={{ background: storiesEnabled ? 'var(--brand-500)' : 'var(--line)' }}
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
