'use client';

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
  type ReactNode, type RefObject,
} from 'react';
import {
  getWebsiteConfig, updateWebsiteConfig, getThemeCatalog, getRestaurant,
  WebsiteConfig, ThemeCatalog, Restaurant,
} from '@/lib/api';

type PreviewMessage =
  | {
      type: 'foody-theme-preview';
      themeId: string;
      pairingId: string;
      brandColor: string | null;
      layoutDefault: 'compact' | 'magazine';
      direction: 'ltr' | 'rtl';
    }
  | { type: 'foody-theme-clear' };

type Ctx = {
  restaurantId: number;
  config: WebsiteConfig | null;
  catalog: ThemeCatalog | null;
  restaurant: Restaurant | null;
  loading: boolean;
  error: string;
  saving: boolean;
  saved: boolean;
  iframeRef: RefObject<HTMLIFrameElement>;
  update: (patch: Partial<WebsiteConfig>) => void;
  reload: () => void;
};

const WebsiteMenuContext = createContext<Ctx | null>(null);

export function useWebsiteMenu(): Ctx {
  const ctx = useContext(WebsiteMenuContext);
  if (!ctx) throw new Error('useWebsiteMenu must be used inside <WebsiteMenuProvider>');
  return ctx;
}

const SAVE_DEBOUNCE_MS = 500;

export function WebsiteMenuProvider({
  restaurantId, children, iframeRef,
}: {
  restaurantId: number;
  children: ReactNode;
  iframeRef: RefObject<HTMLIFrameElement>;
}) {
  const [config, setConfig] = useState<WebsiteConfig | null>(null);
  const [catalog, setCatalog] = useState<ThemeCatalog | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const pendingPatchRef = useRef<Partial<WebsiteConfig>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, cat, r] = await Promise.all([
        getWebsiteConfig(restaurantId),
        getThemeCatalog(),
        getRestaurant(restaurantId),
      ]);
      setConfig(cfg);
      setCatalog(cat);
      setRestaurant(r);
    } catch (e) {
      setError((e as Error).message || 'Failed to load website settings');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const postPreview = useCallback((next: WebsiteConfig) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const message: PreviewMessage = {
      type: 'foody-theme-preview',
      themeId: next.theme_id,
      pairingId: next.pairing_id,
      brandColor: next.brand_color,
      layoutDefault: next.layout_default,
      direction: 'ltr',
    };
    win.postMessage(message, '*');
  }, [iframeRef]);

  const flushSave = useCallback(async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      const updated = await updateWebsiteConfig(restaurantId, patch);
      setConfig(updated);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  const update = useCallback((patch: Partial<WebsiteConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      postPreview(next);
      return next;
    });
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave, postPreview]);

  const value = useMemo<Ctx>(() => ({
    restaurantId,
    config,
    catalog,
    restaurant,
    loading,
    error,
    saving,
    saved,
    iframeRef,
    update,
    reload: load,
  }), [restaurantId, config, catalog, restaurant, loading, error, saving, saved, iframeRef, update, load]);

  return <WebsiteMenuContext.Provider value={value}>{children}</WebsiteMenuContext.Provider>;
}
