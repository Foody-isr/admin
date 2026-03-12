'use client';

import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'foody_admin_sound_enabled';

/**
 * Hook that plays a notification sound for new orders.
 * Handles browser autoplay restrictions by unlocking audio on first user interaction.
 */
export function useOrderSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const enabledRef = useRef(true);

  // Initialize audio element + read preference
  useEffect(() => {
    const audio = new Audio('/notification.mp3');
    audio.preload = 'auto';
    audioRef.current = audio;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      enabledRef.current = stored === 'true';
    }

    // Unlock audio context on first user interaction
    const unlock = () => {
      if (unlockedRef.current) return;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        unlockedRef.current = true;
      }).catch(() => {
        // Still locked, will try again on next interaction
      });
    };

    window.addEventListener('click', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const play = useCallback(() => {
    if (!enabledRef.current || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      // Autoplay blocked — will unlock on next interaction
    });
  }, []);

  const isEnabled = useCallback(() => enabledRef.current, []);

  const toggle = useCallback(() => {
    enabledRef.current = !enabledRef.current;
    localStorage.setItem(STORAGE_KEY, String(enabledRef.current));
    return enabledRef.current;
  }, []);

  return { play, isEnabled, toggle };
}
