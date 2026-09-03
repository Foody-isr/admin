'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHead } from '@/components/ds';

export interface SettingsWorkspaceNavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * SettingsWorkspace gives a complex settings category one stable, task-based
 * navigation. Each destination is a real page, so users can bookmark it and a
 * save action never owns fields from another settings task.
 */
export function SettingsWorkspace({
  title,
  description,
  activeId,
  navLabel,
  items,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  activeId: string;
  navLabel: string;
  items: SettingsWorkspaceNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[980px]">
      <PageHead title={title} desc={description} />

      <nav
        aria-label={navLabel}
        className="mb-[var(--s-6)] flex gap-1 overflow-x-auto border-b border-[var(--line)]"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`group -mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-fs-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-500)] ${
                active
                  ? 'border-[var(--brand-500)] text-[var(--fg)]'
                  : 'border-transparent text-[var(--fg-muted)] hover:border-[var(--line-strong)] hover:text-[var(--fg)]'
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  active ? 'text-[var(--brand-500)]' : 'group-hover:text-[var(--brand-500)]'
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
