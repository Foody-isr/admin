'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeItemPopstate } from '@/lib/item-popstate';

interface HistoryEntry {
  index: number;
  key: string;
}
interface NavigationHistory {
  currentEntry: HistoryEntry | null;
}

/** Keeps an item draft mounted while a requested departure is resolved. */
export function useItemLeaveGuard(
  isDirty: () => boolean,
  isBusy: () => boolean,
) {
  const router = useRouter();
  const latest = useRef({ isDirty, isBusy });
  latest.current = { isDirty, isBusy };
  const bypass = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const go = useCallback(
    (target: string) => {
      const url = new URL(target, window.location.href);
      if (url.origin === window.location.origin)
        router.push(url.pathname + url.search + url.hash);
      else window.location.assign(url.href);
    },
    [router],
  );
  const ask = useCallback((action: () => void) => {
    if (latest.current.isBusy()) return;
    if (!latest.current.isDirty()) {
      action();
      return;
    }
    pending.current = action;
    setOpen(true);
  }, []);
  const request = useCallback(
    (target: string) => ask(() => go(target)),
    [ask, go],
  );
  const cancel = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);
  const finish = useCallback(
    (fallback: string) => {
      bypass.current = true;
      const action = pending.current;
      pending.current = null;
      setOpen(false);
      if (action) action();
      else go(fallback);
    },
    [go],
  );

  useEffect(() => {
    const navigation = (window as Window & { navigation?: NavigationHistory })
      .navigation;
    let current = {
      url: location.href,
      state: history.state,
      entry: navigation?.currentEntry,
    };
    let restoring = false;
    let afterRestore: (() => void) | null = null;
    const guarded = () =>
      !bypass.current && (latest.current.isDirty() || latest.current.isBusy());
    const unload = (event: BeforeUnloadEvent) => {
      if (guarded()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !guarded()
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (!link || link.download || (link.target && link.target !== '_self'))
        return;
      const url = new URL(link.href);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (url.pathname === location.pathname &&
          url.search === location.search &&
          url.origin === location.origin)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      request(url.href);
    };
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        event.stopImmediatePropagation();
        if (navigation?.currentEntry?.key === current.entry?.key) {
          restoring = false;
          const action = afterRestore;
          afterRestore = null;
          if (action) ask(action);
        }
        return;
      }
      if (!guarded()) return;
      const target = new URL(location.href);
      const previous = new URL(current.url);
      if (
        target.pathname === previous.pathname &&
        target.search === previous.search
      ) {
        current = {
          url: location.href,
          state: history.state,
          entry: navigation?.currentEntry,
        };
        return;
      }
      // Capture before Next's popstate listener so the editor and its draft stay mounted.
      event.stopImmediatePropagation();
      const destination = navigation?.currentEntry;
      if (destination && current.entry) {
        const delta = destination.index - current.entry.index;
        restoring = true;
        afterRestore = () => history.go(delta);
        history.go(-delta);
      } else {
        // Older browsers lack entry indexes. Restore the editor URL/state before
        // offering the same safe choice, then navigate explicitly on approval.
        history.pushState(current.state, '', current.url);
        ask(() => go(target.href));
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    const unsubscribe = subscribeItemPopstate(pop);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      unsubscribe();
    };
  }, [ask, go, request]);

  return { open, request, cancel, finish };
}
