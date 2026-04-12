'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';

export default function StatusPill({
  active,
  onToggle,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  onToggle: () => void;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1 ${
        active ? 'text-status-ready' : 'text-fg-secondary'
      }`}
      style={{ background: active ? 'rgba(119,186,75,0.12)' : 'var(--surface-subtle)' }}
    >
      {active ? activeLabel : inactiveLabel}
      <ChevronDownIcon className="w-3 h-3" />
    </button>
  );
}
