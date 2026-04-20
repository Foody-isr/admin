'use client';

import { useCallback, useEffect, useState } from 'react';

// View preference that pairs browser fullscreen with a CSS zoom on <html>,
// so staff running foodyadmin on a shared display can jump into a big-UI
// kiosk-style view in one click. Level persists per browser in localStorage.

const STORAGE_KEY = 'foody_admin_zoom_level';
const DEFAULT_LEVEL: ZoomLevel = 150;

export const ZOOM_LEVELS = [100, 125, 150, 175, 200] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

function isZoomLevel(n: number): n is ZoomLevel {
  return (ZOOM_LEVELS as readonly number[]).includes(n);
}

function applyZoom(level: ZoomLevel | null) {
  // `zoom` is non-standard but supported in Chromium, Safari, and Firefox.
  // Typed as string on CSSStyleDeclaration; empty string clears it.
  (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom =
    level == null ? '' : String(level / 100);
}

export function useFullscreenZoom() {
  const [isActive, setIsActive] = useState(false);
  const [level, setLevelState] = useState<ZoomLevel>(DEFAULT_LEVEL);

  // Hydrate saved level on mount.
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(n) && isZoomLevel(n)) setLevelState(n);
    } catch {
      /* localStorage unavailable — use default */
    }
  }, []);

  // Sync local state + zoom with browser fullscreen changes. This also
  // handles Esc-to-exit so zoom is cleared when the user leaves fullscreen
  // through the browser UI.
  useEffect(() => {
    const onChange = () => {
      const active = !!document.fullscreenElement;
      setIsActive(active);
      applyZoom(active ? level : null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [level]);

  // Re-apply zoom live if the user picks a new level while already active.
  useEffect(() => {
    if (isActive) applyZoom(level);
  }, [level, isActive]);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // requestFullscreen requires a user gesture — safe to ignore failures;
      // the user can retry by clicking again.
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    (isActive ? exit : enter)();
  }, [isActive, enter, exit]);

  const setLevel = useCallback((n: ZoomLevel) => {
    setLevelState(n);
    try {
      localStorage.setItem(STORAGE_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  return { isActive, level, toggle, setLevel };
}
