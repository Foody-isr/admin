'use client';

/** Visual track shared by switch buttons and fully clickable setting rows. */
export function SwitchIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
      style={{ background: checked ? 'var(--brand-500)' : 'var(--surface-3)' }}
    >
      <span
        className="absolute h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ insetInlineStart: checked ? 22 : 2 }}
      />
    </span>
  );
}

/** A pill switch — the on/off control shared by service toggles, pause and rules. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <SwitchIndicator checked={checked} />
    </button>
  );
}

/** A labelled row with a trailing switch — used for the order-mode toggles. */
export function ServiceToggle({
  label,
  sub,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-[76px] w-full items-center justify-between gap-[var(--s-4)] rounded-r-lg border border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)] text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: checked
          ? 'color-mix(in oklab, var(--brand-500) 6%, var(--surface))'
          : 'var(--surface)',
      }}
    >
      <div className="min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
        <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{sub}</div>
      </div>
      <SwitchIndicator checked={checked} />
    </button>
  );
}

/** A selectable card — used for the three pre-order modes. */
export function ModeCard({
  title,
  desc,
  selected,
  onClick,
  disabled = false,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className="relative h-full min-h-[118px] rounded-r-lg border p-[var(--s-4)] text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: selected
          ? 'color-mix(in oklab, var(--brand-500) 10%, var(--surface))'
          : 'var(--surface)',
        borderColor: selected ? 'var(--brand-500)' : 'var(--line)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-fs-sm font-semibold text-[var(--fg)]">{title}</div>
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: selected ? 'var(--brand-500)' : 'var(--line-strong)' }}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-[var(--brand-500)]" />}
        </span>
      </div>
      <div className="mt-2 text-fs-xs leading-[var(--lh-base)] text-[var(--fg-subtle)]">{desc}</div>
    </button>
  );
}
