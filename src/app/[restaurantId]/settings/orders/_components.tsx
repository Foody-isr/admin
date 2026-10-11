'use client';

import { useId } from 'react';
import { Switch as BooleanSwitch } from '@/components/ui/switch';
import { ChoiceRow } from '@/components/ds/Selection';

/** Explicit yes/no control shared by pause and order rules. */
export function Switch({ checked, onChange, label, disabled = false }: {
  checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean;
}) {
  return <BooleanSwitch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />;
}

/** Service or boolean setting with its description and trailing yes/no control. */
export function ServiceToggle({ label, sub, checked, onChange, disabled = false }: {
  label: string; sub: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className="boolean-setting">
    <label htmlFor={id}><span className="choice-title">{label}</span><span id={`${id}-hint`} className="choice-description">{sub}</span></label>
    <BooleanSwitch id={id} aria-label={label} aria-describedby={`${id}-hint`} checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </div>;
}

/** Exclusive choice row; the shared name defines the native keyboard group. */
export function ModeChoice({ title, desc, selected, onClick, disabled = false, name }: {
  title: string; desc: string; selected: boolean; onClick: () => void; disabled?: boolean; name: string;
}) {
  return <ChoiceRow type="radio" name={name} label={title} description={desc} checked={selected} onChange={onClick} disabled={disabled} />;
}
