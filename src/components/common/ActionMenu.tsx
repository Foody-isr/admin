'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds';

export interface ActionMenuEntry {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

/** Shared action menu with keyboard navigation and focus handoff to nested dialogs. */
export default function ActionMenu({label,actions,children,iconOnly=false,className=''}: {
  label:string;actions:ActionMenuEntry[];children:ReactNode;iconOnly?:boolean;className?:string;
}) {
  const [open,setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<(() => void) | null>(null);
  if (actions.length === 0) return null;
  return <Menu open={open} onOpenChange={setOpen}>
    <MenuTrigger asChild><Button ref={trigger} type="button" variant={iconOnly ? 'ghost' : 'secondary'} size="lg" icon={iconOnly} className={className} aria-label={label} onClick={event => event.stopPropagation()}>{children}</Button></MenuTrigger>
    <MenuContent align="end" collisionPadding={12} className={iconOnly ? "max-w-[calc(100vw-24px)]" : "list-popover max-w-[calc(100vw-24px)] min-w-[276px] border-0"} onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
      event.preventDefault();trigger.current?.focus({preventScroll:true});
      const next = pending.current;pending.current = null;
      if (next) requestAnimationFrame(next);
    }}>
      {actions.map((action,index) => <MenuItem key={`${index}:${action.label}`} danger={action.variant === 'danger'} disabled={action.disabled} className={iconOnly ? "h-auto min-h-11 py-2" : "h-auto min-h-14 rounded-none border-b border-[var(--line)] px-0 py-4 text-base font-semibold last:border-0"} onSelect={() => {pending.current=action.onClick;setOpen(false);}}>{action.icon}<span className="min-w-0 whitespace-normal">{action.label}</span></MenuItem>)}
    </MenuContent>
  </Menu>;
}
