'use client';

import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Dropdown menu on Foody tokens.
 *
 * The order detail's three menus (print, send to customer, overflow) each
 * hand-rolled the same useRef + mousedown outside-click handler with
 * `absolute bottom-full` positioning — three copies, none of which handled
 * Escape, focus trapping or roving focus, and all of which would clip once
 * their command bar became sticky inside a scroll container. Radix solves all
 * of that and portals out of any overflow.
 *
 * `ui/dropdown-menu.tsx` already wraps the same primitive, but styles off the
 * shadcn HSL tokens (`bg-popover`, `border`) which drift from Foody surfaces,
 * and it belongs to the largely-unused shadcn install. This is the ds-native
 * equivalent.
 */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export interface MenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Content> {}

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Content>,
  MenuContentProps
>(({ className, sideOffset = 6, align = 'start', ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-[60] min-w-[220px] overflow-hidden p-[var(--s-1)]',
        'bg-[var(--surface)] text-[var(--fg)]',
        'border border-[var(--line)] rounded-r-md shadow-3',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    />
  </DropdownMenu.Portal>
));
MenuContent.displayName = 'MenuContent';

export interface MenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
  /** Destructive action — renders in the danger tone. */
  danger?: boolean;
}

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Item>,
  MenuItemProps
>(({ className, danger, ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={cn(
      'flex items-center gap-[var(--s-3)] w-full px-[var(--s-3)] h-9',
      'text-fs-sm rounded-r-sm cursor-pointer select-none outline-none',
      'transition-colors duration-fast ease-out',
      // Radix drives hover AND keyboard focus through data-highlighted, so the
      // two states can never diverge.
      'data-[highlighted]:bg-[var(--surface-2)]',
      'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
      '[&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0 [&_svg]:text-[var(--fg-muted)]',
      danger
        ? 'text-[var(--danger-500)] data-[highlighted]:bg-[var(--danger-50)] [&_svg]:text-[var(--danger-500)]'
        : 'text-[var(--fg)]',
      className,
    )}
    {...props}
  />
));
MenuItem.displayName = 'MenuItem';

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Separator
    ref={ref}
    className={cn('my-[var(--s-1)] h-px bg-[var(--line)]', className)}
    {...props}
  />
));
MenuSeparator.displayName = 'MenuSeparator';

export const MenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Label
    ref={ref}
    className={cn(
      'px-[var(--s-3)] pt-[var(--s-2)] pb-[var(--s-1)]',
      'text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-subtle)]',
      className,
    )}
    {...props}
  />
));
MenuLabel.displayName = 'MenuLabel';
