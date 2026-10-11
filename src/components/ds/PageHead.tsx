'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
}

/** Shared title, description and primary action layout for workspace pages. */
export function PageHead({ title, desc, actions, className, ...props }: PageHeadProps) {
  return (
    <div
      className={cn(
        'mb-8 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-fs-3xl font-semibold leading-[1.2] text-[var(--fg)] -tracking-[0.02em]">
          {title}
        </h1>
      </div>
      {actions && <div data-page-actions className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      {desc && <p className="max-w-[90ch] text-fs-md leading-relaxed text-[var(--fg-muted)] sm:col-span-2">{desc}</p>}
    </div>
  );
}
