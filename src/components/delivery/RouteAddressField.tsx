'use client';

import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { formatRouteAddress, selectedNumberedAddress } from '@/lib/route-address';
import { addressFieldObservation, type AddressChoiceOutcome } from '@/lib/address-field-observation';
import { getAddressObservationPolicy, observeOrderAddress } from '@/lib/delivery';
import { ApiError } from '@/lib/api';
import { Input } from '@/components/ds';
import { autocompleteRouteAddress, resolveRouteAddress, type AddressSuggestion } from '@/lib/delivery';

/** Search and select an endpoint using the restaurant's existing address provider. */
export function RouteAddressField({ onObservedChoice, restaurantId, locale, label, placeholder, value, onChange, onSelectAddress, onReviewAddress, onSelectStreet, onResolvingChange, inputProps, disabled, t }: {
  restaurantId: number; locale: string; label: string; placeholder?: string; value: string;
  onChange: (value: string) => void; onResolvingChange?: (resolving: boolean) => void; disabled?: boolean; t: (key: string) => string;
  /** Receives a complete address and its city separately. Partial suggestions stay in the search field. */
  onObservedChoice?: (choice: AddressChoiceOutcome | undefined) => void;
  onSelectAddress?: (suggestion: AddressSuggestion) => void;
  /** Accepts the street explicitly picked by staff, even when it has no building point. */
  onSelectStreet?: (suggestion: AddressSuggestion) => boolean | void;
  /** Lets a staff editor review the label that was clicked if Details cannot confirm it. */
  onReviewAddress?: (prediction: AddressSuggestion) => boolean | void;
  inputProps?: Pick<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-label' | 'aria-invalid' | 'aria-describedby'>;
}) {
  const generatedId = useId();
  const id = inputProps?.id ?? generatedId;
  const measureOrders = !!onObservedChoice;
  const [observationPolicy, setObservationPolicy] = useState<{rid:number; until?:string}>();
  useEffect(() => {
    if (!measureOrders || disabled) return;
    const abort = new AbortController();
    void getAddressObservationPolicy(restaurantId, abort.signal)
      .then(policy => { if (!abort.signal.aborted) setObservationPolicy({rid: restaurantId, until:policy.observation_until}); })
      .catch(() => { /* The order form also works when observations are unavailable. */ });
    return () => abort.abort();
  }, [restaurantId, measureOrders, disabled]);
  const until = observationPolicy?.rid === restaurantId ? observationPolicy.until : undefined;
  const observer = useMemo(() => addressFieldObservation(until, event => {
    void observeOrderAddress(restaurantId, event).catch(() => { /* Optional field observation. */ });
  }), [restaurantId, until]);
  const accepted = () => onObservedChoice?.(observer.accept());
  const session = useRef('');
  const request = useRef(0);
  const selection = useRef('');
  const resolution = useRef(0);
  const currentValue = useRef(value);
  currentValue.current = value;
  const resolvingCallback = useRef(onResolvingChange);
  resolvingCallback.current = onResolvingChange;
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    return () => { ++resolution.current; resolvingCallback.current?.(false); };
  }, [restaurantId]);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const retry = () => { inputRef.current?.focus(); setFocused(true); setAttempt(n => n + 1); };
  useEffect(() => {
    if (!error) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error]);

  useEffect(() => {
    const version = ++request.current;
    setSuggestions([]); setEmpty(false); setError(false); setBusy(false); setActive(0);
    if (!focused || disabled || value.trim().length < 3 || value === selection.current) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function search(mayRetry: boolean) {
      setBusy(true);
      try {
        session.current ||= crypto.randomUUID();
        const rows = await autocompleteRouteAddress(restaurantId, value.trim(), /[\u0590-\u05ff]/.test(value) ? 'he' : locale, session.current, controller.signal);
        if (!controller.signal.aborted && request.current === version) { observer.available(rows.length > 0); setSuggestions(rows); setEmpty(rows.length === 0); }
      } catch (cause) {
        if (controller.signal.aborted || request.current !== version) return;
        session.current = '';
        if (mayRetry && (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 409)) {
          timer = setTimeout(() => void search(false), 450);
        } else { observer.available(false); setError(true); }
      } finally {
        if (request.current === version) setBusy(false);
      }
    }
    timer = setTimeout(() => void search(true), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, focused, disabled, restaurantId, locale, attempt, observer]);

  const select = async (suggestion: AddressSuggestion) => {
    observer.choose();
    ++request.current;
    const version = ++resolution.current;
    setResolving(true); resolvingCallback.current?.(true); setError(false); setSuggestions([]);
    try {
      const details = suggestion.lookup_token ? await resolveRouteAddress(restaurantId, suggestion.lookup_token) : suggestion;
      if (resolution.current !== version || currentValue.current !== value) return;
      const resolved = (onSelectAddress && selectedNumberedAddress(suggestion, details)) || details;
      const address = formatRouteAddress(resolved);
      session.current = '';
      // The API labels street/place refinements and omits kind on complete addresses.
      const completeAddress = resolved.address.trim() && resolved.city.trim() &&
        (resolved.kind === 'address' || (!resolved.kind && resolved.street?.trim() && resolved.house_number?.trim()));
      if (resolved.kind === 'street' || (onSelectAddress && !completeAddress)) {
        if (onReviewAddress && /\d/.test(suggestion.address) && suggestion.address.trim() !== resolved.street?.trim()) {
          if (onReviewAddress(suggestion)) accepted();
          return;
        }
        if (onSelectStreet && resolved.kind === 'street' && resolved.city.trim()) {
          const chosen: AddressSuggestion = {
            id: suggestion.id, kind: 'street', address: suggestion.address.trim() || resolved.address,
            street: resolved.street, city: resolved.city,
          };
          selection.current = formatRouteAddress(chosen);
          setFocused(false);
          if (onSelectStreet(chosen)) accepted();
          return;
        }
        onChange(address); return;
      }
      selection.current = address;
      if (onSelectAddress) { onSelectAddress(resolved); accepted(); }
      else onChange(address);
      setFocused(false);
    } catch {
      if (resolution.current === version && currentValue.current === value) {
        session.current = '';
        if (onReviewAddress?.(suggestion)) accepted();
        else { observer.available(false); if (!onReviewAddress) setError(true); }
      }
    }
    finally { if (resolution.current === version) { setResolving(false); resolvingCallback.current?.(false); } }
  };

  const describedBy = [inputProps?.['aria-describedby'], error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="relative flex min-w-0 flex-col gap-1.5" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }}>
    <label htmlFor={id} className="text-fs-xs font-medium text-[var(--fg-muted)]">{label}</label>
    <Input ref={inputRef} {...inputProps} id={id} role="combobox" aria-autocomplete="list" aria-expanded={focused && suggestions.length > 0}
      aria-controls={`${id}-list`} aria-activedescendant={suggestions[active] ? `${id}-${active}` : undefined}
      aria-describedby={describedBy} value={value} placeholder={placeholder} disabled={disabled}
      autoComplete="off" dir="auto" maxLength={200} className="min-w-0 text-[16px] sm:text-fs-sm"
      onFocus={() => setFocused(true)}
      onChange={event => { ++request.current; ++resolution.current; setResolving(false); resolvingCallback.current?.(false); selection.current = ''; onChange(event.target.value); setFocused(true); }}
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
          <button type="button" tabIndex={-1} onPointerDown={event => event.preventDefault()} onClick={() => void select(suggestion)}
            className={`w-full px-3 py-3 text-start text-fs-sm hover:bg-[var(--surface-2)] ${index === active ? 'bg-[var(--surface-2)]' : ''}`}>
            {formatRouteAddress(suggestion)}
          </button>
        </li>)}
      </ul><p className="px-3 py-1 text-fs-xs text-[var(--fg-subtle)]">Google</p>
    </div>}
    {(busy || resolving) && <span role="status" className="text-fs-xs text-[var(--fg-muted)]">{t('checking')}</span>}
    {(error || empty) && <button type="button" onPointerDown={event => event.preventDefault()} onClick={retry} className="self-start min-h-11 text-fs-sm underline">{t('retry')}</button>}
    {empty && <span role="status" className="text-fs-xs text-[var(--fg-muted)]">{t('noResults')}</span>}
    {error && <span id={`${id}-error`} role="status" className="text-fs-xs text-[var(--warning-600)]">{t('routeAddressSearchUnavailable')}</span>}
  </div>;
}
