type PopGuard = (event: PopStateEvent) => void;
const state = globalThis as typeof globalThis & {
  __foodyItemPopstate?: { installed: boolean; guards: Set<PopGuard> };
};

function registry() {
  return (state.__foodyItemPopstate ??= {
    installed: false,
    guards: new Set(),
  });
}

/** Install before Next initializes its router; otherwise it can unmount a dirty editor first. */
export function installItemPopstateGuard() {
  const value = registry();
  if (value.installed) return;
  value.installed = true;
  window.addEventListener(
    'popstate',
    (event) => {
      for (const guard of Array.from(value.guards).reverse()) {
        guard(event);
        if (event.cancelBubble) break;
      }
    },
    true,
  );
}

/** Scope browser-history protection to the currently mounted item editor. */
export function subscribeItemPopstate(guard: PopGuard) {
  const value = registry();
  value.guards.add(guard);
  return () => {
    value.guards.delete(guard);
  };
}
