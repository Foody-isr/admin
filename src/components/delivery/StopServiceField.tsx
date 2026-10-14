import { Input } from '@/components/ds';

/** Shared route handover duration used during planning and pre-departure edits. */
export function StopServiceField({ value, onChange, disabled, t }: { value: string; onChange: (value: string) => void; disabled?: boolean; t: (key: string) => string }) {
  return <label className="flex min-w-0 flex-col gap-1.5">
    <span className="text-fs-xs font-medium text-[var(--fg-muted)]">{t('stopServiceMinutesLabel')}</span>
    <Input type="number" min={0} max={60} step={1} required inputMode="numeric" dir="ltr" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />
    <span className="text-fs-xs leading-relaxed text-[var(--fg-subtle)]">{t('stopServiceMinutesHint')}</span>
  </label>;
}

/** Zero is valid; blank, decimal and out-of-range durations are not. */
export function validStopServiceMinutes(value: string): boolean {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number >= 0 && number <= 60;
}
