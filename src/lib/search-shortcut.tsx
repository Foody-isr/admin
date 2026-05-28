'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface SearchShortcutContextValue {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

const SearchShortcutContext = createContext<SearchShortcutContextValue | null>(null);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function SearchShortcutProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);
  const toggleSearch = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      // When focus is inside the modal's own input we still want ⌘K to toggle
      // (close). Suppress only when the editable element is NOT the modal input.
      const target = e.target as HTMLElement | null;
      if (isEditable(target) && target?.dataset.searchModalInput !== 'true') {
        return;
      }
      e.preventDefault();
      setIsOpen((v) => !v);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SearchShortcutContext.Provider value={{ isOpen, openSearch, closeSearch, toggleSearch }}>
      {children}
    </SearchShortcutContext.Provider>
  );
}

export function useSearchShortcut(): SearchShortcutContextValue {
  const ctx = useContext(SearchShortcutContext);
  if (!ctx) {
    throw new Error('useSearchShortcut must be used inside <SearchShortcutProvider>');
  }
  return ctx;
}
