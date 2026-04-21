'use client';

import React from 'react';

// Figma-aligned primitives used by the menu-item Details tab.
// Theme-aware: uses CSS tokens so the form works in both light and dark modes.

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
  return (
    <section
      className={`relative bg-[var(--surface)] border border-[var(--divider)] rounded-xl p-6 flex flex-col gap-6 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-1 h-6 rounded-full bg-brand-500 shrink-0" />
          <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">{title}</h2>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      {children}
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
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-[var(--text-primary)]">{label}</label>
      )}
      {children}
      {hint && <p className="text-xs text-[var(--text-secondary)]">{hint}</p>}
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
      className={`w-full h-10 rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
      className={`w-full min-h-[96px] rounded-lg bg-[var(--surface-subtle)] border border-[var(--divider)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${className}`}
    />
  );
});
