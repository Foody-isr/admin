'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHead({ title, desc, actions, className, ...props }: PageHeadProps) {
  return (
    <div
      className={cn(
        'flex items-end justify-between gap-[var(--s-4)] flex-wrap',
        'mb-[var(--s-6)]',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-fs-3xl font-semibold leading-none text-[var(--fg)] -tracking-[0.02em]">
          {title}
        </h1>
        {desc && (
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">{desc}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-[var(--s-2)] flex-wrap">{actions}</div>}
    </div>
  );
}
