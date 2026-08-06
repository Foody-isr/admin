'use client';

// Customer picker for the manual order. Staff type two letters of the name
// (or a few digits of the phone) and the whole customer sheet fills in with
// one click, address included.
//
// Picking a customer locks nothing: every field stays editable afterwards,
// because a regular getting a one-off delivery elsewhere is normal, not an
// error. And ignoring the list to type a brand-new customer must keep
// working exactly as it did before this component existed.

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { searchCustomers, type CustomerSearchResult } from '@/lib/api';

/** Below this, the list would echo half the customer file on every keystroke. */
const MIN_CHARS = 2;
/** Gives staff time to finish a word before hitting the server. */
const DEBOUNCE_MS = 250;

interface CustomerPickerProps {
  restaurantId: number;
  /** Which field is being queried: name and phone feed the same search. */
  field: 'name' | 'phone';
  value: string;
  onChange: (value: string) => void;
  onPick: (customer: CustomerSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Owned by the parent, not this component. A pick on either the name or the
   * phone picker rewrites BOTH fields, so a purely-local "did I just write
   * this?" ref would only catch the field the user actually clicked in and
   * would let the other field's effect see a stray external value change and
   * fire a real search. The parent flips this ref to true for both pickers
   * before setting either field, so neither one re-searches on the value a
   * pick just wrote.
   */
  skipNextSearchRef: React.MutableRefObject<boolean>;
}

export function CustomerPicker({
  restaurantId, field, value, onChange, onPick, placeholder, autoFocus, skipNextSearchRef,
}: CustomerPickerProps) {
  const { t } = useI18n();
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchCustomers(restaurantId, q)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setHighlight(0);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, restaurantId, skipNextSearchRef]);

  // A click outside the field closes the list without selecting anything.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (customer: CustomerSearchResult) => {
    skipNextSearchRef.current = true;
    setOpen(false);
    setResults([]);
    onPick(customer);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={field === 'phone' ? 'tel' : undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg)] shadow-3">
          {loading && results.length === 0 && (
            <div className="px-[var(--s-3)] py-[var(--s-2)] text-fs-sm text-[var(--fg-muted)]">
              {t('customerPickerSearching')}
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-[var(--s-3)] py-[var(--s-2)] text-fs-sm text-[var(--fg-muted)]">
              {t('customerPickerNoResults')}
            </div>
          )}
          {results.map((customer, i) => (
            <button
              key={customer.phone}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(customer)}
              className={cn(
                'w-full text-start px-[var(--s-3)] py-[var(--s-2)] flex items-baseline gap-[var(--s-3)] transition-colors',
                i === highlight ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]',
              )}
            >
              <span className="flex-1 min-w-0 truncate text-fs-sm text-[var(--fg)]">
                {customer.name || customer.phone}
              </span>
              <span className="text-fs-sm text-[var(--fg-muted)] whitespace-nowrap">
                {customer.phone}
                {customer.phones.length > 1 && (
                  <> · {t('customerPickerNumbers').replace('{n}', String(customer.phones.length))}</>
                )}
              </span>
              <span className="text-fs-sm text-[var(--fg-muted)] whitespace-nowrap">
                {t('customerPickerOrders').replace('{n}', String(customer.order_count))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
