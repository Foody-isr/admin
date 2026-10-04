import type { ReactNode } from 'react';
import { PageHead } from '@/components/ds';

/** Settings tasks use the application rail, with one page header and editor. */
export function SettingsWorkspace({ title, description, children }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return <div className="w-full min-w-0"><PageHead title={title} desc={description} />{children}</div>;
}
