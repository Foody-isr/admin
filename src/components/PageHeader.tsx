'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Page-level header. Realigned to Foody OS design tokens in Phase 2
 * (Geist @ fs-3xl, -0.02em tracking, fg-muted subtitle, s-2 action gap).
 * API preserved — every caller keeps working without import changes.
 */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-[var(--s-4)] flex-wrap mb-[var(--s-6)]">
      <div className="min-w-0">
        <h1 className="text-fs-3xl font-semibold leading-none text-[var(--fg)] -tracking-[0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-[var(--s-2)] shrink-0">{actions}</div>
      )}
    </div>
  );
}
