'use client';

import { useState, useRef, useEffect } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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

export default function SearchableSelect({
  value, onChange, options, placeholder = 'Search...', emptyLabel = 'No results', className = '',
}: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Find the selected option's label
  const selected = options.find((o) => o.value === value);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter((o) =>
    !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const displayText = selected ? `${selected.label}${selected.sublabel ? ` (${selected.sublabel})` : ''}` : '';

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <div className="relative">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
        {open ? (
          <input
            type="text"
            autoFocus
            className="input text-sm w-full pl-9 py-1.5"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        ) : (
          <button type="button" onClick={() => setOpen(true)}
            className="input text-sm w-full pl-9 py-1.5 text-left truncate cursor-pointer">
            {displayText || <span className="text-fg-tertiary">{placeholder}</span>}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg shadow-lg border border-[var(--divider)] max-h-48 overflow-y-auto"
          style={{ background: 'var(--surface)' }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-tertiary">{emptyLabel}</div>
          ) : (
            filtered.map((opt) => (
              <button key={opt.value} type="button"
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--surface-subtle)] transition-colors ${
                  opt.value === value ? 'bg-brand-500/10 text-brand-500 font-medium' : 'text-fg-primary'
                }`}
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}>
                <span className="truncate">{opt.label}</span>
                {opt.sublabel && <span className="text-xs text-fg-tertiary ml-2 flex-shrink-0">{opt.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
