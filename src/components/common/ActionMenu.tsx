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
    <MenuContent align="end" collisionPadding={12} className="max-w-[calc(100vw-24px)]" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
      event.preventDefault();trigger.current?.focus({preventScroll:true});
      const next = pending.current;pending.current = null;
      if (next) requestAnimationFrame(next);
    }}>
      {actions.map((action,index) => <MenuItem key={`${index}:${action.label}`} danger={action.variant === 'danger'} disabled={action.disabled} className="h-auto min-h-11 py-2" onSelect={() => {pending.current=action.onClick;setOpen(false);}}>{action.icon}<span className="min-w-0 whitespace-normal">{action.label}</span></MenuItem>)}
    </MenuContent>
  </Menu>;
}
