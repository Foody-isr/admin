'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 overflow-hidden',
  {
    variants: {
      size: {
        sm: 'w-6 h-6 text-[10px]',
        md: 'w-8 h-8 text-fs-xs',
        lg: 'w-10 h-10 text-fs-sm',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// Hash any string to a 1..8 cat slot. Stable across renders.
function hashCat(input: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return (((h % 8) + 8) % 8 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof avatarVariants> {
  name: string;
  src?: string;
  alt?: string;
  /** Override the auto-derived category color (1–8). */
  cat?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Override the auto-derived initials. */
  label?: string;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, name, src, alt, cat, label, style, ...props }, ref) => {
    const slot = cat ?? hashCat(name);
    const text = label ?? initials(name);
    return (
      <span
        ref={ref}
        className={cn(avatarVariants({ size }), className)}
        style={{ background: `var(--cat-${slot})`, ...style }}
        aria-label={alt ?? name}
        {...props}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? name} className="w-full h-full object-cover" />
        ) : (
          text
        )}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';

export interface AvatarStackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const AvatarStack = React.forwardRef<HTMLDivElement, AvatarStackProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex',
        '[&>*]:border-2 [&>*]:border-[var(--surface)] [&>*]:-ms-2 [&>*:first-child]:ms-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
AvatarStack.displayName = 'AvatarStack';
