'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Page title, useful context and actions using the Foody product scale. */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-[var(--s-4)] flex-wrap mb-[var(--s-6)]">
      <div className="min-w-0">
        <h1 className="text-fs-3xl font-semibold leading-[1.2] text-[var(--fg)] -tracking-[0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-fs-md text-[var(--fg-muted)] mt-2 max-w-[72ch]">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-[var(--s-2)] flex-wrap">{actions}</div>
      )}
    </div>
  );
}
