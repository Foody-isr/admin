'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { PrinterProfileJobType } from '@/lib/api';
import { Switch } from '@/components/ui/switch';

interface PrinterProfileJobSectionProps {
  type: PrinterProfileJobType;
  title: string;
  description: string;
  icon: LucideIcon;
  active: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}

export function PrinterProfileJobSection({
  type,
  title,
  description,
  icon: Icon,
  active,
  onToggle,
  children,
}: PrinterProfileJobSectionProps) {
  const optionsId = `printer-profile-${type}-options`;
  return (
    <div className="py-5">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-fs-sm font-semibold">{title}</div>
          <div className="mt-0.5 max-w-[68ch] text-fs-xs leading-relaxed text-[var(--fg-muted)]">
            {description}
          </div>
        </div>
        <Switch
          checked={active}
          onCheckedChange={onToggle}
          aria-label={title}
          aria-controls={optionsId}
          aria-expanded={active}
        />
      </div>
      {active && (
        <div
          id={optionsId}
          role="region"
          aria-label={title}
          className="ms-14 mt-5 rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 sm:px-5"
        >
          {children}
        </div>
      )}
    </div>
  );
}
