'use client';

import { useRef } from 'react';

/** Restores focus for controlled dialogs opened without a Radix Trigger. */
export function useDialogReturnFocus(returnFocusRef?: { readonly current: HTMLElement | null }) {
  const previous = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement : null,
  );
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement;
      // A native autoFocus field may already have focus during the mount event.
      // Keep the trigger captured before mounting instead of storing that field.
      if (active instanceof HTMLElement && !(event.target instanceof HTMLElement && event.target.contains(active))) {
        previous.current = active;
      }
    },
    onCloseAutoFocus: (event: Event) => {
      const target = returnFocusRef?.current ?? previous.current;
      if (target?.isConnected && target !== document.body) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      }
    },
  };
}
