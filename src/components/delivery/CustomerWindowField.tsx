import { Input } from '@/components/ds';

/** Parse a communication duration entered as minutes, H:MM or 1h30. */
export function parseCustomerWindowMinutes(value: string): number | null {
  const duration = value.trim().toLowerCase();
  const hours = /^(\d{1,2})\s*[:h]\s*([0-5]\d)?$/.exec(duration);
  const minutes = hours ? Number(hours[1]) * 60 + Number(hours[2] || 0) : /^\d+$/.test(duration) ? Number(duration) : NaN;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 720 ? minutes : null;
}

/** Customer communication width, independent from time spent serving each stop. */
export function CustomerWindowField({ value, onChange, disabled, t }: { value: string; onChange: (value: string) => void; disabled?: boolean; t: (key: string) => string }) {
  const valid = parseCustomerWindowMinutes(value) != null;
  return <label className="flex min-w-0 flex-col gap-1.5">
    <span className="text-fs-xs font-medium text-[var(--fg-muted)]">{t('customerWindowLabel')}</span>
    <Input value={value} onChange={event => onChange(event.target.value)} disabled={disabled} placeholder="1:30" dir="ltr" required aria-invalid={!valid} />
    <span className="text-fs-xs leading-relaxed text-[var(--fg-subtle)]">{t(valid ? 'customerWindowHint' : 'customerWindowInvalid')}</span>
  </label>;
}
