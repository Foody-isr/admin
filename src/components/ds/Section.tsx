'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  desc?: React.ReactNode;
  aside?: React.ReactNode;
}

export function Section({ title, desc, aside, children, className, ...props }: SectionProps) {
  return (
    <div
      className={cn(
        'bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1',
        'mb-[var(--s-4)]',
        className,
      )}
      {...props}
    >
      {(title || aside) && (
        <div
          className={cn(
            'px-[var(--s-5)] pt-[var(--s-5)]',
            desc ? 'pb-[var(--s-3)]' : 'pb-[var(--s-4)]',
          )}
        >
          <div className="flex items-center justify-between gap-[var(--s-3)]">
            {title && (
              <div className="text-fs-sm font-semibold text-[var(--fg)]">{title}</div>
            )}
            {aside && <div className="shrink-0">{aside}</div>}
          </div>
          {desc && (
            <div className="text-fs-xs text-[var(--fg-subtle)] mt-1">{desc}</div>
          )}
        </div>
      )}
      <div className="px-[var(--s-5)] pb-[var(--s-5)]">{children}</div>
    </div>
  );
}
