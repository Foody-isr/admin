"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { BooleanIndicator } from "@/components/ds/Selection";
import { cn } from "@/lib/utils";

/** Accessible yes/no switch with explicit pointer choices and native keyboard toggling. */
function Switch({ className, checked, defaultChecked = false, onCheckedChange, onClick, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const value = checked ?? internal;
  return <SwitchPrimitive.Root {...props} data-slot="switch" checked={value}
    className={cn("boolean-switch", className)}
    onCheckedChange={next => { setInternal(next); onCheckedChange?.(next); }}
    onClick={event => {
      onClick?.(event);
      const segment = (event.target as HTMLElement).closest<HTMLElement>('[data-value]');
      if (segment?.dataset.value === String(value)) event.preventDefault();
    }}>
    <BooleanIndicator checked={value} />
  </SwitchPrimitive.Root>;
}

export { Switch };
