'use client';

import { Monitor } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface DesktopOnlyProps {
  children: React.ReactNode;
  /** Optional override for the placeholder title shown on small screens. */
  title?: string;
  /** Optional override for the placeholder body text. */
  message?: string;
}

/**
 * Wraps page content that is intentionally only available on desktop. Below
 * the `lg` breakpoint the children are hidden and a friendly placeholder is
 * shown instead. Used for setup-once / data-dense views like the website
 * builder, floor-plan editor, payments and printer config, etc.
 */
export function DesktopOnly({ children, title, message }: DesktopOnlyProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="lg:hidden flex flex-col items-center justify-center text-center px-[var(--s-5)] py-[var(--s-7)] gap-[var(--s-4)] min-h-[60vh]">
        <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
          <Monitor className="w-7 h-7 text-[var(--fg-muted)]" />
        </div>
        <h2 className="text-fs-lg font-semibold text-[var(--fg)] -tracking-[0.01em]">
          {title ?? t('desktopOnlyTitle')}
        </h2>
        <p className="text-fs-sm text-[var(--fg-muted)] max-w-sm leading-relaxed">
          {message ?? t('desktopOnlyMessage')}
        </p>
      </div>
      <div className="hidden lg:block">{children}</div>
    </>
  );
}
