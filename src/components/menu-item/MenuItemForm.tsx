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
          <h3 className="text-fs-lg font-semibold text-[var(--fg)] leading-snug">
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
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {label && (
        <label htmlFor={htmlFor} className="block text-fs-sm font-medium text-[var(--fg)] mb-1.5">
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
      className={`block w-full h-10 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm transition-colors duration-fast ease-out hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring placeholder:text-[var(--fg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
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
