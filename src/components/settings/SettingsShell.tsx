import type { ReactNode } from 'react';

/** Settings share the main application canvas and navigation. */
export default function SettingsShell({ children }: { children: ReactNode }) {
  return <div className="w-full min-w-0">{children}</div>;
}
