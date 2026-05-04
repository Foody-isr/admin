'use client';

import * as React from 'react';

// Drop-in replacement for `<input type="number">` that fixes three long-standing
// usability bugs across the admin:
//   1. Typing "0" got swallowed (parents commonly stored 0 as empty input, then
//      reformatted the value back into the field, erasing the keystroke).
//   2. Typing decimals "0.5" / "0.85" was unreliable for the same reason —
//      the "0" never made it into the input, so the "." that followed had
//      nothing to attach to.
//   3. French / locale keyboards type "0,85" with a comma; `+e.target.value`
//      returns NaN for that and the input would silently reset.
//
// The fix keeps a separate string buffer for the field's text. The buffer lets
// the user pass through transitional states ("0", "0.", "-") that are not yet
// valid numbers without the parent's render snapping back. Comma is normalised
// to dot so the typed character matches the parsed value.

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Disallow the decimal separator (digits only). */
  integer?: boolean;
  /** Minimum allowed value. Default: 0 (negative numbers disallowed unless this is set < 0). */
  min?: number;
  /** Maximum allowed value (clamp on change). */
  max?: number;
  /** How to render the committed value as text. Default: `String(n)`. */
  format?: (n: number) => string;
}

function parseBuffer(s: string): number | null {
  if (!s || s === '-' || s === '.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function defaultFormat(n: number): string {
  // 0 → "" so the placeholder remains visible. Matches the historical
  // `value={x || ''}` pattern that this component replaces.
  if (n === 0) return '';
  return String(n);
}

function sanitize(input: string, integer: boolean, allowNegative: boolean): string {
  // Treat comma as decimal separator (French/Hebrew/etc. locale keyboards).
  const s = input.replace(/,/g, '.');
  let out = '';
  let dotSeen = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '-' && i === 0 && allowNegative && out === '') {
      out += c;
    } else if (c >= '0' && c <= '9') {
      out += c;
    } else if (c === '.' && !integer && !dotSeen) {
      out += c;
      dotSeen = true;
    }
  }
  return out;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, integer = false, min = 0, max, format, onBlur, onFocus, inputMode, ...rest },
  ref,
) {
  const fmt = format ?? defaultFormat;
  const allowNegative = min < 0;

  const formatValue = React.useCallback(
    (v: number | null | undefined): string =>
      v == null || !Number.isFinite(v) ? '' : fmt(v),
    [fmt],
  );

  const [buffer, setBuffer] = React.useState<string>(() => formatValue(value));
  const editingRef = React.useRef(false);

  // Sync the buffer when `value` changes from outside while the user is not
  // editing. Skipped when the buffer already represents the same number, so
  // the user-typed "0" is not flattened to "" and "0.85" stays "0.85" even if
  // the parent re-renders with an equivalent value.
  React.useEffect(() => {
    if (editingRef.current) return;
    const parsed = parseBuffer(buffer);
    const bufferNum = buffer === '' ? 0 : parsed;
    if (bufferNum === value) return;
    setBuffer(formatValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number): number => {
    let v = n;
    if (max !== undefined && v > max) v = max;
    if (v < min) v = min;
    return v;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitize(e.target.value, integer, allowNegative);
    setBuffer(cleaned);
    if (cleaned === '') {
      onChange(clamp(0));
      return;
    }
    const parsed = parseBuffer(cleaned);
    if (parsed === null) return; // intermediate state ("." or "-")
    onChange(clamp(parsed));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    editingRef.current = true;
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    editingRef.current = false;
    const parsed = parseBuffer(buffer);
    if (parsed === null && buffer !== '') {
      // Reset invalid intermediate input ("." / "-") to the formatted value.
      setBuffer(formatValue(value));
    } else if (parsed !== null) {
      // Re-format normalised value (trailing dot removed, "0.50" → "0.5", clamp applied).
      setBuffer(formatValue(clamp(parsed)));
    }
    // Buffer was empty and the user blurred — keep it empty so the placeholder shows.
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={inputMode ?? (integer ? 'numeric' : 'decimal')}
      value={buffer}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
NumberInput.displayName = 'NumberInput';
