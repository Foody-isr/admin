'use client';

import { useState, useRef, useId, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { inputFieldClass } from '@/components/ds/Input';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

/** Searchable single-value picker with keyboard selection and viewport-aware placement. */
export default function SearchableSelect({ value, onChange, options, placeholder, emptyLabel, className }: SearchableSelectProps) {
  const { t, direction } = useI18n();
  const label = placeholder ?? t('search');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useId();
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => !search || option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));
  const display = selected ? `${selected.label}${selected.sublabel ? ` (${selected.sublabel})` : ''}` : label;
  useEffect(() => { if (open) document.getElementById(`${list}-${activeIndex}`)?.scrollIntoView({block:'nearest'}); }, [activeIndex, list, open]);
  function select(option: SearchableSelectOption) { onChange(option.value); setOpen(false); setSearch(''); }
  return (
    <Popover.Root open={open} onOpenChange={next => { setOpen(next); setSearch(''); setActive(0); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`${label} · ${display}`} className={cn(inputFieldClass, 'flex items-center gap-2 text-start', className)}>
          <Search aria-hidden className="h-4 w-4 shrink-0 text-[var(--fg-subtle)]" />
          <span className="truncate">{display}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} collisionPadding={8} dir={direction}
          onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[calc(100vw-16px)] max-h-[var(--radix-popover-content-available-height)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-2 text-[var(--fg)] shadow-2">
          <input ref={input} className={inputFieldClass} role="combobox" aria-label={label} aria-controls={list} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={filtered.length ? `${list}-${activeIndex}` : undefined}
            placeholder={label} value={search} onChange={event => { setSearch(event.target.value); setActive(0); }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
              if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); select(filtered[activeIndex]); }
            }} />
          <div id={list} role="listbox" aria-label={label} className="mt-2 max-h-52 overflow-y-auto">
            {filtered.map((option, index) => <div key={option.value} id={`${list}-${index}`} role="option" aria-selected={option.value === value}
              onMouseDown={event => event.preventDefault()} onClick={() => select(option)} onMouseMove={() => setActive(index)}
              className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-r-sm px-2 py-2 text-fs-sm', index === activeIndex && 'bg-[var(--surface-2)]', option.value === value && 'text-[var(--brand-ink)] font-semibold')}>
              <span className="min-w-0 flex-1 break-words">{option.label}{option.sublabel && <span className="block text-fs-xs font-normal text-[var(--fg-muted)]">{option.sublabel}</span>}</span>
              {option.value === value && <Check aria-hidden className="h-4 w-4 shrink-0" />}
            </div>)}
          </div>
          {!filtered.length && <p role="status" className="p-3 text-fs-sm text-[var(--fg-muted)]">{emptyLabel ?? t('noResults')}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
