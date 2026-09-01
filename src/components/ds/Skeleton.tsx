'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading placeholder.
 *
 * The app had no skeleton convention: loading states were ad-hoc spinners or
 * one-off `animate-pulse` blocks, and the order detail had nothing at all — its
 * `isLoading` prop only disabled the footer buttons. This is the shared shape.
 *
 * Size it with utilities to match the real content's box, so nothing shifts
 * when the data lands: `<Skeleton className="h-4 w-24" />`.
 *
 * The pulse is `motion-safe:` so it disappears under prefers-reduced-motion,
 * matching how globals.css guards its own keyframes.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'bg-[var(--surface-2)] rounded-r-sm motion-safe:animate-pulse',
        className,
      )}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
