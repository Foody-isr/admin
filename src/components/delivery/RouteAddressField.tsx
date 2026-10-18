'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ds';
import { autocompleteRouteAddress, resolveRouteAddress, type AddressSuggestion } from '@/lib/delivery';

/** Search and select an endpoint using the restaurant's existing address provider. */
export function RouteAddressField({ restaurantId, locale, label, placeholder, value, onChange, disabled, t }: {
  restaurantId: number; locale: string; label: string; placeholder?: string; value: string;
  onChange: (value: string) => void; disabled?: boolean; t: (key: string) => string;
}) {
  const id = useId();
  const session = useRef('');
  const request = useRef(0);
  const selection = useRef('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const version = ++request.current;
    setSuggestions([]); setError(false); setBusy(false); setActive(0);
    if (!focused || disabled || value.trim().length < 3 || value === selection.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      session.current ||= crypto.randomUUID();
      try {
        const rows = await autocompleteRouteAddress(restaurantId, value.trim(), /[\u0590-\u05ff]/.test(value) ? 'he' : locale, session.current, controller.signal);
        if (request.current === version) setSuggestions(rows);
      } catch {
        if (!controller.signal.aborted && request.current === version) setError(true);
      } finally {
        if (request.current === version) setBusy(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, focused, disabled, restaurantId, locale]);

  const select = async (suggestion: AddressSuggestion) => {
    const version = ++request.current;
    setBusy(true); setError(false); setSuggestions([]);
    try {
      const resolved = suggestion.lookup_token ? await resolveRouteAddress(restaurantId, suggestion.lookup_token) : suggestion;
      if (request.current !== version) return;
      const address = [resolved.address, resolved.city].filter(Boolean).join(', ');
      session.current = '';
      if (resolved.kind === 'street' || resolved.kind === 'place') {
        onChange(address); return;
      }
      selection.current = address;
      session.current = '';
      onChange(address); setFocused(false);
    } catch { if (request.current === version) setError(true); }
    finally { if (request.current === version) setBusy(false); }
  };

  return <div className="relative flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-fs-xs font-medium text-[var(--fg-muted)]">{label}</label>
    <Input id={id} role="combobox" aria-autocomplete="list" aria-expanded={focused && suggestions.length > 0}
      aria-controls={`${id}-list`} aria-activedescendant={suggestions[active] ? `${id}-${active}` : undefined}
      aria-describedby={error ? `${id}-error` : undefined} value={value} placeholder={placeholder} disabled={disabled}
      autoComplete="off" dir="auto" maxLength={500} className="min-w-0 text-[16px] sm:text-fs-sm"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={event => { ++request.current; selection.current = ''; onChange(event.target.value); setFocused(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setFocused(false); setSuggestions([]); }
        if (!focused || !suggestions.length) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % suggestions.length); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index + suggestions.length - 1) % suggestions.length); }
        if (event.key === 'Enter') { event.preventDefault(); void select(suggestions[active]); }
      }} />
    {focused && suggestions.length > 0 && <div className="absolute inset-x-0 top-full z-50 rounded-r-md border border-[var(--line)] bg-[var(--surface)] shadow-3">
      <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
        {suggestions.map((suggestion, index) => <li key={suggestion.id} id={`${id}-${index}`} role="option" aria-selected={index === active}>
          <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => void select(suggestion)}
            className={`w-full px-3 py-3 text-start text-fs-sm hover:bg-[var(--surface-2)] ${index === active ? 'bg-[var(--surface-2)]' : ''}`}>
            {[suggestion.address, suggestion.city].filter(Boolean).join(', ')}
          </button>
        </li>)}
      </ul><p className="px-3 py-1 text-fs-xs text-[var(--fg-subtle)]">Google</p>
    </div>}
    {busy && <span role="status" className="text-fs-xs text-[var(--fg-muted)]">{t('checking')}</span>}
    {error && <span id={`${id}-error`} role="status" className="text-fs-xs text-[var(--warning-600)]">{t('routeAddressSearchUnavailable')}</span>}
  </div>;
}
