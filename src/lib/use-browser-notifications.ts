'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Permission = 'default' | 'granted' | 'denied';

/**
 * Hook for browser-native push notifications.
 * Shows notifications when the tab is hidden and a new order arrives.
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<Permission>('default');
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (supported) {
      setPermission(Notification.permission as Permission);
    }
  }, [supported]);

  const requestPermission = useCallback(async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
  }, [supported]);

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (!supported || permission !== 'granted') return;
    // Only notify when tab is hidden
    if (!document.hidden) return;

    const n = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };

    // Auto-close after 8 seconds
    setTimeout(() => n.close(), 8000);
  }, [supported, permission]);

  return { supported, permission, requestPermission, notify };
}
