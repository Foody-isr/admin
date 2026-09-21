'use client';

import { useDraftQueue } from '../hooks/useDraftQueue';
import type { Draft } from '../types';
import { useI18n } from '@/lib/i18n';
import { ArrowUpRightIcon, LoaderCircleIcon } from 'lucide-react';

/** StatusDot — small colored dot indicating a draft's current lifecycle state. */
function StatusDot({ status }: { status: Draft['status'] }) {
  const colorMap: Record<Draft['status'], string> = {
    generating: 'var(--accent-amber, #f59e0b)',
    ready: 'var(--accent-green, #10b981)',
    error: 'var(--accent-red, #ef4444)',
    committed: 'var(--accent-blue, #3b82f6)',
    discarded: 'var(--fg-muted, #9ca3af)',
  };
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorMap[status] }} />;
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
      <p className="flex items-center gap-2 py-4 text-sm text-[var(--fg-muted)]">
        <LoaderCircleIcon className="h-4 w-4 animate-spin" /> {t('labLoading')}
      </p>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center">
        <p className="text-sm font-medium text-[var(--fg)]">{t('labNoDraftsYet')}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{t('labNoDraftsHelp')}</p>
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {drafts.map((d) => {
        const isActive = activeDraftId === d.id;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              title={d.dish_name}
              className={`group flex w-full items-center gap-3 rounded-[10px] border px-3 py-3 text-start transition-[border-color,background-color] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${isActive ? 'border-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_8%,var(--surface))]' : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'}`}
            >
              <StatusDot status={d.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--fg)]">{d.dish_name}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--fg-muted)]">
                  {d.payload?.creation_mode === 'manual' ? `${t('labManualDraftLabel')} · ` : ''}{t(`labDraftStatus_${d.status}`)}
                </span>
              </span>
              <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-[var(--fg-subtle)] transition-colors group-hover:text-[var(--fg)]" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
