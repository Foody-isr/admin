'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_MS = 10 * 60 * 1000; // 10 minutes
const COUNTDOWN_SECONDS = 60;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'keydown', 'click', 'scroll', 'touchstart',
];

/**
 * Detects user inactivity. After IDLE_MS of no interaction,
 * shows a countdown. If the user doesn't respond within COUNTDOWN_SECONDS,
 * fires onTimeout.
 */
export function useIdleTimeout(onTimeout?: () => void) {
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetIdle = useCallback(() => {
    // Clear existing timers
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);

    setShowModal(false);
    setCountdown(COUNTDOWN_SECONDS);

    // Start idle timer
    idleTimer.current = setTimeout(() => {
      // User has been idle — start countdown
      setShowModal(true);
      setCountdown(COUNTDOWN_SECONDS);

      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownInterval.current) clearInterval(countdownInterval.current);
            onTimeout?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_MS);
  }, [onTimeout]);

  const dismiss = useCallback(() => {
    resetIdle();
  }, [resetIdle]);

  useEffect(() => {
    resetIdle();

    const handler = () => {
      // Only reset if modal is NOT showing (don't let background activity dismiss it)
      if (!document.querySelector('[data-idle-modal]')) {
        resetIdle();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handler, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handler);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [resetIdle]);

  return { showModal, countdown, dismiss };
}
