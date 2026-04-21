'use client';

import React from 'react';

// Figma-aligned primitives for the menu-item tabs.
// Classes mirror Figma MenuItemDetails.tsx:156-245 (details tab).

export function SectionCard({
  title,
  headerRight,
  children,
  className = '',
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // Figma renders tab sections without a card wrapper — just a vertical
  // orange accent bar + h3, then content in space-y-6 below.
  return (
    <section className={`max-w-4xl ${className}`}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-1 h-6 rounded-full bg-orange-500 shrink-0" />
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white truncate">
            {title}
          </h3>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const FormInput = React.forwardRef<HTMLInputElement, InputProps>(function FormInput(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function FormTextarea(
  { className = '', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`w-full px-4 py-3 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none ${className}`}
    />
  );
});
