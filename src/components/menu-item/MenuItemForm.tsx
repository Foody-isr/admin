'use client';

import React from 'react';

/**
 * Primitives shared by the Item Editor's 4 tabs.
 * Aligned to Foody OS design tokens — the brand-500 accent bar matches the
 * EditorSectionHead pattern from design-reference/design/drawer.jsx.
 * API preserved so the 4 tab components keep working unchanged.
 */

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
    <section className={`max-w-4xl ${className}`}>
      <div className="flex items-center justify-between gap-[var(--s-4)] mb-[var(--s-5)]">
        <div className="flex items-center gap-[var(--s-3)] min-w-0">
          <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)] shrink-0" />
          <h3 className="text-fs-xl font-semibold text-[var(--fg)] truncate">
            {title}
          </h3>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className="space-y-[var(--s-5)]">{children}</div>
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
    <div className="min-w-0">
      {label && (
        <label className="block text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-1.5">
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p className="text-fs-xs text-[var(--fg-subtle)] mt-1">{hint}</p>
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
      className={`block w-full h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm transition-colors duration-fast ease-out hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring placeholder:text-[var(--fg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
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
      className={`block w-full min-h-20 px-[var(--s-3)] py-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm leading-[var(--lh-base)] transition-colors duration-fast ease-out hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring placeholder:text-[var(--fg-subtle)] resize-none ${className}`}
    />
  );
});
