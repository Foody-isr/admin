'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const baseField = [
  'block w-full bg-[var(--surface)] text-[var(--fg)]',
  'border border-[var(--line-strong)] rounded-r-md',
  'text-fs-sm font-[inherit]',
  'transition-colors duration-fast ease-out',
  'hover:border-[var(--fg-subtle)]',
  'focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring',
  'placeholder:text-[var(--fg-subtle)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(baseField, 'h-9 px-[var(--s-3)]', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(baseField, 'min-h-20 p-[var(--s-3)] leading-[var(--lh-base)]', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(baseField, 'h-9 px-[var(--s-3)]', className)}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// Icon + input + kbd shortcut (matches .input-group pattern)
export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, leading, trailing, inputProps, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9',
        'bg-[var(--surface)] text-[var(--fg)]',
        'border border-[var(--line-strong)] rounded-r-md',
        'transition-colors duration-fast ease-out',
        'focus-within:border-[var(--brand-500)] focus-within:shadow-ring',
        '[&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0 [&>svg]:text-[var(--fg-subtle)]',
        className,
      )}
      {...props}
    >
      {leading}
      <input
        {...inputProps}
        className={cn(
          'flex-1 h-full bg-transparent border-none outline-none',
          'text-inherit font-inherit text-fs-sm',
          'placeholder:text-[var(--fg-subtle)]',
          inputProps?.className,
        )}
      />
      {trailing}
    </div>
  ),
);
InputGroup.displayName = 'InputGroup';

export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'font-mono text-[10px] px-1.5 py-0.5 rounded-r-xs',
        'bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--line)]',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';
