'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ImageOff, Clapperboard, RefreshCw, Trash2 } from 'lucide-react';
import { connectSocial, disconnectSocial, syncSocial, listReels, updateReel, reorderReels, deleteReel, type Reel } from '@/lib/api';
import { loadInstagramStoriesSettings, updateInstagramStoriesEnabled, type InstagramStoriesSettings } from '@/lib/social-navigation';
import { loadMetaSdk } from '@/lib/meta-sdk';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, PageHead, Section } from '@/components/ds';
import { Switch } from '../orders/_components';

const SDK_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
// Existing public Login for Business configuration: keep the user-token flow.
const IG_CONFIG_ID = '992572743780171';
type Snapshot = { settings: InstagramStoriesSettings; reels: Reel[] };
type Notice = { key: string; count?: number; handle?: string };
type Confirmation = { kind: 'disconnect' } | { kind: 'delete'; reel: Reel };
class PartialDisconnect extends Error {}
function accessToken(response: unknown): string | null {
  const token = response && typeof response === 'object' ? (response as { authResponse?: { accessToken?: unknown } }).authResponse?.accessToken : null;
  return typeof token === 'string' && token.trim() ? token : null;
}
function thumbnailAddress(value: string): boolean {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function Thumbnail({ url }: { url: string }) {
  const { t } = useI18n(); const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const usable = thumbnailAddress(url);
  return <div className="relative flex aspect-[9/12] items-center justify-center overflow-hidden rounded-t-r-lg bg-[var(--surface-2)]">
    {usable && !failed ? <img key={attempt} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setFailed(true)} /> /* eslint-disable-line @next/next/no-img-element */ : <div className="space-y-3 p-4 text-center text-[var(--fg-muted)]"><ImageOff className="mx-auto size-6" aria-hidden="true" /><p className="text-sm">{t('reelsNoPreview')}</p>{usable && <Button variant="secondary" size="sm" onClick={() => { setAttempt(value => value + 1); setFailed(false); }}>{t('retry')}</Button>}</div>}
  </div>;
}

/** Manage live Stories visibility and synchronized media without optimistic publishing. */
export default function ReelsPage() {
  const { restaurantId } = useParams();
  return <ReelsWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function ReelsWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n(), { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null), [recovery, setRecovery] = useState<'confirmed' | 'uncertain' | 'disconnect' | null>(null), [readError, setReadError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'loading' | 'ready' | 'error'>('loading'), [signupActive, setSignupActive] = useState(false), [authError, setAuthError] = useState<string | null>(null);
  const lock = useRef(false), lifetime = useRef({ generation: 0, sequence: 0 });
  const signup = useRef({ active: false, id: 0, handled: false, timer: 0 });
  const frozen = !canEdit || !!busy || !!recovery || signupActive;
  const connection = snapshot?.settings.connection, connected = snapshot?.settings.connected === true;
  const storiesEnabled = snapshot?.settings.storiesEnabled === true;
  const serverReady = connection?.server_configured !== false && !!META_APP_ID;

  const read = useCallback(async (): Promise<Snapshot> => {
    const [settings, reels] = await Promise.all([loadInstagramStoriesSettings(rid), listReels(rid)]);
    if (typeof settings.connection?.connected !== 'boolean' || !Array.isArray(reels) || reels.some(reel => !Number.isSafeInteger(reel.id) || reel.restaurant_id !== rid || typeof reel.is_visible !== 'boolean')) throw new Error('Incomplete Stories state');
    return { settings, reels };
  }, [rid]);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const next = await read(); if (current()) setSnapshot(next); }
    catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [read]);
  const prepareSdk = useCallback(async () => {
    const generation = lifetime.current.generation; setSdkStatus('loading');
    try { await loadMetaSdk(META_APP_ID, SDK_VERSION); if (generation === lifetime.current.generation) setSdkStatus('ready'); }
    catch { if (generation === lifetime.current.generation) setSdkStatus('error'); }
  }, []);
  useEffect(() => {
    const current = lifetime.current, auth = signup.current; void load();
    return () => { current.generation++; auth.active = false; auth.id++; clearTimeout(auth.timer); };
  }, [load]);
  useEffect(() => { if (META_APP_ID && canEdit) void prepareSdk(); }, [canEdit, prepareSdk]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, []);

  const mutate = async (kind: string, task: (current: () => boolean) => Promise<Notice>) => {
    if (!canEdit || lock.current || recovery) return;
    lock.current = true; setBusy(kind); setNotice(null); setReadError(false); setAuthError(null);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    let confirmed = false;
    try {
      const message = await task(current); confirmed = true;
      if (!current()) return;
      const next = await read();
      if (current()) { setSnapshot(next); setNotice(message); }
    } catch (cause) { if (current()) setRecovery(cause instanceof PartialDisconnect ? 'disconnect' : confirmed ? 'confirmed' : 'uncertain'); }
    finally { if (current()) { lock.current = false; setBusy(null); } }
  };
  const refresh = async () => {
    if (lock.current || signup.current.active) return;
    lock.current = true; setBusy('read'); setReadError(false);
    const generation = lifetime.current.generation;
    try { const next = await read(); if (generation === lifetime.current.generation) { setSnapshot(next); setRecovery(null); setNotice({ key: 'reelsStateRefreshed' }); } }
    catch { if (generation === lifetime.current.generation) setReadError(true); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(null); } }
  };
  const cancelSignup = () => {
    signup.current.active = false; signup.current.id++; clearTimeout(signup.current.timer); setSignupActive(false);
  };
  const launchConnect = () => {
    if (frozen || lock.current || signup.current.active || sdkStatus !== 'ready' || !window.FB || !serverReady) return;
    const generation = lifetime.current.generation, id = ++signup.current.id;
    signup.current.active = true; signup.current.handled = false; setSignupActive(true); setAuthError(null); setNotice(null);
    const current = () => generation === lifetime.current.generation && signup.current.id === id && signup.current.active;
    signup.current.timer = window.setTimeout(() => { if (current()) { cancelSignup(); setAuthError('reelsAuthTimedOut'); } }, 120000);
    const receive = async (response: unknown) => {
      if (!current() || signup.current.handled) return;
      signup.current.handled = true;
      let token = accessToken(response);
      if (!token) {
        token = await new Promise<string | null>(resolve => {
          const timeout = window.setTimeout(() => resolve(null), 10000);
          try { window.FB!.getLoginStatus(status => { clearTimeout(timeout); resolve(accessToken(status)); }, true); }
          catch { clearTimeout(timeout); resolve(null); }
        });
      }
      if (!current()) return;
      cancelSignup();
      if (!token) { setAuthError('reelsCancelled'); return; }
      await mutate('connect', async () => {
        const result = await connectSocial(rid, 'instagram', { access_token: token! });
        if (result.connected !== true || (!result.sync_error && (!Number.isFinite(result.synced) || result.synced! < 0))) throw new Error('Connection not confirmed');
        return { key: result.sync_error ? 'reelsConnectedPartial' : 'reelsConnectedSynced', handle: result.handle ?? '', count: result.synced ?? 0 };
      });
      token = null;
    };
    try { window.FB.login(response => { void receive(response); }, { config_id: IG_CONFIG_ID }); }
    catch { cancelSignup(); setAuthError('reelsFbNotLoaded'); }
  };
  const disconnect = () => void mutate('disconnect', async current => {
    await disconnectSocial(rid, 'instagram');
    if (!current()) return { key: 'reelsDisconnected' };
    setSnapshot(previous => previous ? { settings: { ...previous.settings, connection: { connected: false, server_configured: previous.settings.connection.server_configured }, connected: false }, reels: previous.reels.filter(reel => reel.provider !== 'instagram') } : null);
    if (storiesEnabled) {
      try { await updateInstagramStoriesEnabled(rid, false); }
      catch { throw new PartialDisconnect(); }
    }
    return { key: 'reelsDisconnected' };
  });
  const move = (index: number, direction: -1 | 1) => {
    if (!snapshot || frozen || index + direction < 0 || index + direction >= snapshot.reels.length) return;
    const next = [...snapshot.reels]; [next[index], next[index + direction]] = [next[index + direction], next[index]];
    void mutate('reorder', async () => { await reorderReels(rid, next.map(reel => reel.id)); return { key: 'reelsOrderSaved' }; });
  };
  const localizedNotice = notice ? t(notice.key).replace('{n}', String(notice.count ?? 0)).replace('{handle}', notice.handle ?? '') : '';
  const lastSync = connection?.last_synced_at && Number.isFinite(Date.parse(connection.last_synced_at)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.last_synced_at)) : null;
  return <div className="mx-auto max-w-[1080px] space-y-6">
    <PageHead title={t('reels')} desc={t('reelsSubtitle')} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--line)] p-5"><p className="text-sm text-[var(--danger-500)]">{t('reelsLoadError')}</p><Button onClick={() => void load()}>{t('retry')}</Button></div> : snapshot && <>
      {!canEdit && <p className="text-sm text-[var(--fg-muted)]">{t('pushPreferencesReadOnly')}</p>}
      {(recovery || readError) && <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--danger-500)] p-5"><p className="text-sm leading-6">{t(recovery === 'disconnect' ? 'reelsDisconnectPartial' : recovery === 'confirmed' ? 'reelsRefreshAfterWrite' : recovery === 'uncertain' ? 'reelsWriteUnconfirmed' : 'reelsReadError')}</p>{readError && recovery && <p className="text-sm text-[var(--danger-500)]">{t('reelsReadError')}</p>}<Button variant="secondary" disabled={!!busy} onClick={() => void refresh()}>{t('reelsRefreshState')}</Button></div>}
      {notice && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{localizedNotice}</p>}
      <Section title={t('reelsConnTitle')}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-3"><Clapperboard className="size-6 shrink-0 text-[var(--brand-ink)]" aria-hidden="true" /><p className="break-words text-lg font-semibold"><bdi>{connection?.handle ? `@${connection.handle}` : 'Instagram'}</bdi></p></div><p className="mt-3 text-sm text-[var(--fg-muted)]">{lastSync ? t('reelsLastSynced').replace('{date}', lastSync) : t('reelsNotSynced')}</p></div><Badge tone={connected ? 'success' : 'neutral'}>{t(connected ? 'reelsConnected' : 'reelsNotConnected')}</Badge></div>
        {connection?.last_sync_error && <p className="mt-4 text-sm text-[var(--danger-500)]">{t('reelsLastSyncFailed')}</p>}
        {!connected && <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t('reelsConnectHint')}</p>}
        {canEdit && <div className="mt-5 flex flex-wrap gap-2">
          {connected && <Button variant="secondary" disabled={frozen} onClick={() => void mutate('sync', async () => { const result = await syncSocial(rid, 'instagram'); if (!Number.isFinite(result.synced) || result.synced < 0) throw new Error('Incomplete sync result'); return { key: 'reelsSynced', count: result.synced }; })}><RefreshCw aria-hidden="true" />{t('reelsSyncNow')}</Button>}
          {!connected && (signupActive ? <div className="space-y-3"><p role="status" className="text-sm text-[var(--fg-muted)]">{t('reelsAuthWaiting')}</p><Button variant="secondary" onClick={cancelSignup}>{t('cancel')}</Button></div> : <Button disabled={frozen || !serverReady || sdkStatus !== 'ready'} onClick={launchConnect}>{t(sdkStatus === 'loading' && serverReady ? 'loading' : 'reelsConnectBtn')}</Button>)}
          {connection?.connected && <Button variant="ghost" disabled={frozen} onClick={() => setConfirmation({ kind: 'disconnect' })}>{t('reelsDisconnect')}</Button>}
          {!connected && !serverReady && <p className="w-full text-sm text-[var(--fg-muted)]">{t('reelsConnectionUnavailable')}</p>}
          {!connected && serverReady && sdkStatus === 'error' && <div role="alert" className="w-full space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('reelsSdkFailed')}</p><Button variant="secondary" onClick={() => void prepareSdk()}>{t('retry')}</Button></div>}
        </div>}
        {authError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{t(authError)}</p>}
      </Section>
      <Section title={t('reelsSectionPage')}>
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-base font-semibold">{t('reelsShowOnSite')}</p><p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t('reelsShowOnSiteDesc')}</p></div><Switch checked={storiesEnabled} disabled={frozen || (!connected && !storiesEnabled)} label={t('reelsShowOnSite')} onChange={next => void mutate('visibility', async () => { await updateInstagramStoriesEnabled(rid, next); return { key: 'reelsVisibilitySaved' }; })} /></div>
        <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t('reelsLiveChanges')}</p>
        {!connected && <p className="mt-3 text-sm text-[var(--fg-muted)]">{t(storiesEnabled ? 'reelsDisconnectedVisible' : 'reelsShowOnSiteNeedsConnect')}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]"><p className="text-sm leading-6">{t(snapshot.settings.storiesNavigationAvailable === undefined ? 'reelsPublicUnknown' : snapshot.settings.storiesNavigationAvailable ? 'reelsPublicAvailable' : 'reelsPublicUnavailable')}</p><Button size="sm" variant="secondary" disabled={!!busy || signupActive} onClick={() => void refresh()}>{t('reelsRefreshState')}</Button></div>
      </Section>
      {(connection?.connected || snapshot.reels.length > 0) && <section aria-label={t('reelsSectionCount').replace('{n}', String(snapshot.reels.length))} className="space-y-4">
        <div><h2 className="text-lg font-semibold">{t('reelsSectionCount').replace('{n}', String(snapshot.reels.length))}</h2><p className="mt-2 text-sm text-[var(--fg-muted)]">{t('reelsOrderingHint')}</p></div>
        {snapshot.reels.length === 0 ? <p className="rounded-r-lg border border-dashed border-[var(--line-strong)] p-6 text-sm leading-6 text-[var(--fg-muted)]">{t('reelsEmpty')}</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{snapshot.reels.map((reel, index) => <article key={reel.id} data-reel-id={reel.id} aria-label={t('reelsItemPosition').replace('{n}', String(index + 1))} className="min-w-0 overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
          <Thumbnail key={reel.thumbnail_url} url={reel.thumbnail_url} />
          <div className="space-y-4 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold tabular-nums">{index + 1}</span><Badge tone={reel.is_visible ? 'success' : 'neutral'}>{t(reel.is_visible ? 'reelsVisible' : 'reelsHidden')}</Badge></div>
            <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6">{reel.caption || t('reelsNoCaption')}</p>
            {canEdit && <div className="space-y-4 border-t border-[var(--line)] pt-4"><div className="flex items-start justify-between gap-4"><span className="text-sm">{t('reelsVisible')}</span><Switch checked={reel.is_visible} disabled={frozen} label={t('reelsVisibilityLabel').replace('{n}', String(index + 1))} onChange={next => void mutate('reel', async () => { await updateReel(rid, reel.id, { is_visible: next }); return { key: 'reelsVisibilitySaved' }; })} /></div><div className="flex flex-wrap gap-2"><Button icon size="sm" variant="secondary" aria-label={t('reelsMoveUp')} disabled={frozen || index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button><Button icon size="sm" variant="secondary" aria-label={t('reelsMoveDown')} disabled={frozen || index === snapshot.reels.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button><Button size="sm" variant="ghost" disabled={frozen} onClick={() => setConfirmation({ kind: 'delete', reel })}><Trash2 aria-hidden="true" />{t('reelsDelete')}</Button></div></div>}
          </div>
        </article>)}</div>}
      </section>}
      {busy && <p role="status" className="text-sm text-[var(--fg-muted)]">{t(busy === 'read' ? 'loading' : 'reelsWorking')}</p>}
    </>}
    <ConfirmDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} title={t(confirmation?.kind === 'disconnect' ? 'reelsDisconnect' : 'reelsDelete')} description={t(confirmation?.kind === 'disconnect' ? 'reelsConfirmDisconnect' : 'reelsConfirmRemove')} confirmLabel={t(confirmation?.kind === 'disconnect' ? 'reelsDisconnect' : 'reelsDelete')} cancelLabel={t('cancel')} danger onConfirm={() => { const target = confirmation; setConfirmation(null); if (target?.kind === 'disconnect') disconnect(); else if (target?.kind === 'delete') void mutate('delete', async () => { await deleteReel(rid, target.reel.id); return { key: 'reelsRemoved' }; }); }} />
  </div>;
}
