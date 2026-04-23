'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** px width of the drawer. Defaults to 720. */
  width?: number;
  /** Primary action button in the head. Falls back to onSave/saveLabel combo. */
  primaryAction?: React.ReactNode;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  saveDisabled?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Right-anchored slide-over drawer — used for "view + quick actions" patterns.
 * See DESIGN_MIGRATION.md for the when-to-use-this-vs-FullScreenEditor rules.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  width = 720,
  primaryAction,
  onSave,
  saveLabel = 'Mettre à jour',
  saveDisabled,
  footer,
  children,
  className,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed z-50 top-0 bottom-0 end-0 max-w-[95vw]',
            'flex flex-col',
            'bg-[var(--bg)] text-[var(--fg)]',
            'border-s border-[var(--line)] shadow-3',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
            className,
          )}
          style={{ width }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Head */}
          <div className="h-[60px] shrink-0 px-[var(--s-5)] flex items-center gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
            <Dialog.Close asChild>
              <Button variant="ghost" size="md" icon aria-label="Fermer">
                <X />
              </Button>
            </Dialog.Close>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] truncate">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="text-fs-xs text-[var(--fg-subtle)] truncate">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            {primaryAction ||
              (onSave && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  disabled={saveDisabled}
                >
                  {saveLabel}
                </Button>
              ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-[var(--s-5)]">{children}</div>

          {footer && (
            <div className="border-t border-[var(--line)] bg-[var(--surface)] px-[var(--s-5)] py-[var(--s-3)] shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
