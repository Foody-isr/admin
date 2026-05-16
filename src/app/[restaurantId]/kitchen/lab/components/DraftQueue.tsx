'use client';

import { useDraftQueue } from '../hooks/useDraftQueue';
import type { Draft } from '../types';
import { useI18n } from '@/lib/i18n';

/** StatusDot — small colored dot indicating a draft's current lifecycle state. */
function StatusDot({ status }: { status: Draft['status'] }) {
  const colorMap: Record<Draft['status'], string> = {
    generating: 'var(--accent-amber, #f59e0b)',
    ready: 'var(--accent-green, #10b981)',
    error: 'var(--accent-red, #ef4444)',
    committed: 'var(--accent-blue, #3b82f6)',
    discarded: 'var(--fg-muted, #9ca3af)',
  };
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        height: 8,
        width: 8,
        borderRadius: 9999,
        flexShrink: 0,
        background: colorMap[status],
        animation:
          status === 'generating' ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
    />
  );
}

/**
 * DraftQueue — scrollable list of active recipe drafts.
 *
 * Reads from useDraftQueue (polling + WebSocket). The selected draft is
 * highlighted; clicking a row calls onSelect so the parent can load the
 * draft reviewer pane.
 */
export function DraftQueue({
  restaurantId,
  activeDraftId,
  onSelect,
}: {
  restaurantId: number;
  activeDraftId: number | null;
  onSelect: (id: number) => void;
}) {
  const { t } = useI18n();
  const { drafts, loading } = useDraftQueue(restaurantId);

  if (loading) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">{t('labLoading')}</p>
    );
  }

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">{t('labNoDraftsYet')}</p>
    );
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '.25rem',
      }}
    >
      {drafts.map((d) => {
        const isActive = activeDraftId === d.id;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              title={d.dish_name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                width: '100%',
                padding: '.4rem .5rem',
                borderRadius: 6,
                textAlign: 'left',
                background: isActive
                  ? 'var(--bg-subtle, var(--surface-2, #f3f4f6))'
                  : 'transparent',
                fontWeight: isActive ? 500 : 400,
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg)',
                fontSize: '.875rem',
                transition: 'background 120ms ease',
              }}
            >
              <StatusDot status={d.status} />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.dish_name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
