'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export const TableShell = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-[var(--surface)] border border-[var(--line)] rounded-r-lg overflow-hidden',
        className,
      )}
      {...props}
    />
  ),
);
TableShell.displayName = 'TableShell';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn('w-full border-collapse text-fs-sm', className)}
      {...props}
    />
  ),
);
Table.displayName = 'Table';

export const Thead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      '[&_th]:bg-[var(--surface-2)] [&_th]:border-b [&_th]:border-[var(--line)]',
      '[&_th]:text-left [&_th]:font-medium [&_th]:text-fs-xs',
      '[&_th]:uppercase [&_th]:tracking-[.04em] [&_th]:whitespace-nowrap',
      '[&_th]:text-[var(--fg-subtle)] [&_th]:py-[var(--s-3)] [&_th]:px-[var(--s-4)]',
      className,
    )}
    {...props}
  />
));
Thead.displayName = 'Thead';

export const Tbody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      '[&_tr]:border-b [&_tr]:border-[var(--line)] [&_tr:last-child]:border-b-0',
      '[&_tr:hover]:bg-[var(--surface-2)]',
      '[&_td]:py-[var(--s-4)] [&_td]:px-[var(--s-4)] [&_td]:text-[var(--fg)]',
      '[&_td]:align-middle',
      className,
    )}
    {...props}
  />
));
Tbody.displayName = 'Tbody';

export const Tr = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={className} {...props} />,
);
Tr.displayName = 'Tr';

export const Td = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={className} {...props} />,
);
Td.displayName = 'Td';

export const Th = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <th ref={ref} className={className} {...props} />,
);
Th.displayName = 'Th';

/** Tabular-numbers cell for counts, prices, etc. */
export const NumTd = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('font-mono tabular-nums', className)} {...props} />
  ),
);
NumTd.displayName = 'NumTd';
