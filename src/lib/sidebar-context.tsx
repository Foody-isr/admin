'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);
const STORAGE_KEY = 'foody.sidebar.collapsed';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
        setCollapsedState(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const toggleCollapsed = () => setCollapsed(!collapsed);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (e.g. loading states).
    return { collapsed: false, toggleCollapsed: () => {}, setCollapsed: () => {} };
  }
  return ctx;
}
