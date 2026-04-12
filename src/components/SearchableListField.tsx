'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export type SearchableOption = { value: string; label: string };

type BaseProps = {
  options: SearchableOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
};

type SingleProps = BaseProps & {
  mode: 'single';
  value: string;
  onChange: (v: string) => void;
  allowCustom?: boolean;
  values?: never;
};

type MultiProps = BaseProps & {
  mode: 'multi';
  values: string[];
  onChange: (vs: string[]) => void;
  allowCustom?: never;
  value?: never;
};

export default function SearchableListField(props: SingleProps | MultiProps) {
  const { options, placeholder, emptyLabel, className = '' } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const isSingle = props.mode === 'single';
  const selectedLabel = isSingle
    ? options.find((o) => o.value === props.value)?.label ?? (props.allowCustom ? props.value : '')
    : '';

  const displayValue = isSingle
    ? search || (open ? '' : selectedLabel)
    : search;

  const filtered = options.filter(
    (o) => !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleInputChange = (v: string) => {
    setSearch(v);
    if (isSingle && props.allowCustom) props.onChange(v);
  };

  const handleSelect = (opt: SearchableOption) => {
    if (isSingle) {
      props.onChange(opt.value);
      setSearch(opt.label);
      setOpen(false);
    } else {
      const next = props.values.includes(opt.value)
        ? props.values.filter((v) => v !== opt.value)
        : [...props.values, opt.value];
      props.onChange(next);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          value={displayValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => handleInputChange(e.target.value)}
          className="input text-sm w-full pl-9"
        />
      </div>
      {open && (
        filtered.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {filtered.map((opt) => {
              const checked = isSingle
                ? props.value === opt.value
                : props.values.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                >
                  <input
                    type={isSingle ? 'radio' : 'checkbox'}
                    name={isSingle ? 'searchable-list' : undefined}
                    checked={checked}
                    onChange={() => handleSelect(opt)}
                    className={
                      isSingle
                        ? 'rounded-full border-[var(--divider)] text-brand-500'
                        : 'rounded border-[var(--divider)]'
                    }
                  />
                  <span className="text-sm text-fg-primary">{opt.label}</span>
                </label>
              );
            })}
          </div>
        ) : emptyLabel ? (
          <p className="text-xs text-fg-tertiary italic">{emptyLabel}</p>
        ) : null
      )}
    </div>
  );
}
