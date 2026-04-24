'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1',
        hover &&
          'transition-[border-color,box-shadow] duration-fast ease-out hover:border-[var(--line-strong)] hover:shadow-2',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-[var(--s-3)]',
        'px-[var(--s-5)] py-[var(--s-4)] border-b border-[var(--line)]',
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-fs-md font-semibold text-[var(--fg)]', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-[var(--s-5)]', className)} {...props} />
  ),
);
CardBody.displayName = 'CardBody';
