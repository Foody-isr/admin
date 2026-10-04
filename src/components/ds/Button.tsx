'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-[var(--s-2)] whitespace-nowrap select-none',
    'font-medium leading-none transition-colors duration-fast ease-out',
    'focus-visible:outline-none focus-visible:shadow-ring',
    'disabled:opacity-50 disabled:pointer-events-none',
    'active:translate-y-[0.5px]',
    'rounded-full',
    '[&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]',
        secondary:
          'bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:border-[var(--fg-subtle)]',
        ghost:
          'bg-transparent text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
        danger: 'bg-[var(--danger-action)] text-[var(--danger-action-fg)] hover:brightness-95',
      },
      size: {
        sm: 'min-h-8 px-[var(--s-3)] text-fs-xs',
        md: 'min-h-11 px-[var(--s-5)] text-fs-sm',
        lg: 'min-h-11 px-[var(--s-5)] text-fs-md',
      },
      icon: {
        true: 'p-0',
        false: '',
      },
    },
    compoundVariants: [
      { icon: true, size: 'sm', class: 'w-8' },
      { icon: true, size: 'md', class: 'w-11' },
      { icon: true, size: 'lg', class: 'w-11' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', icon: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, icon, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, icon }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
