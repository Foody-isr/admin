'use client';

// Draws the activity trail. Nothing else.
//
// The audit fetch moved up to useOrderAudit; the trail itself now moves up to
// buildActivityEvents (lib/orders/activity-events.ts), because the activity tab
// has to say how many rows exist before its panel renders. What is left here is
// the drawing: the day separators, the connector line, the dots.

import { Fragment } from 'react';
import type { ActivityEvent } from '@/lib/orders/activity-events';
import { formatTime, formatEventDay } from '@/lib/orders/order-time';

export function ActivityTimeline({
  events,
  auditFailed = false,
  t,
}: {
  /** Already chronological — see buildActivityEvents. */
  events: ActivityEvent[];
  /** A real failure, as opposed to a 403. A caller without orders.manage sees
   *  the trail the order itself carries and no message; anything else earns one
   *  muted line, because silently showing a shorter history is worse. */
  auditFailed?: boolean;
  t: (k: string) => string;
}) {
  // The row shows the time alone, which reads as one continuous day. Once an
  // order spans several (a scheduled order, or one corrected the next morning),
  // that is actively misleading, so each new day announces itself. A
  // single-day timeline keeps its clean, unlabelled look.
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toDateString();
  };
  const spansDays = new Set(events.map((e) => dayKey(e.at))).size > 1;

  return (
    <div className="flex flex-col gap-[var(--s-3)] text-fs-xs relative">
      {/* A 403 stays silent — a caller without orders.manage still sees the
          trail the order itself carries. Any other failure says so, because a
          silently shortened history reads as "nothing happened". */}
      {auditFailed && (
        <div className="text-[var(--fg-subtle)] italic">{t('activityLoadError')}</div>
      )}
      {events.map((e, i) => (
        <Fragment key={`${e.at}-${i}`}>
        {spansDays && (i === 0 || dayKey(e.at) !== dayKey(events[i - 1].at)) && (
          <div className="flex items-center gap-[var(--s-2)] pt-[var(--s-1)] first:pt-0">
            <span className="font-medium uppercase tracking-[.06em] text-[10px] text-[var(--fg-muted)]">
              {formatEventDay(e.at)}
            </span>
            <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          </div>
        )}
        <div className="flex items-start gap-[var(--s-3)] relative">
          {/* Connector line. Suppressed before a day separator, which breaks the
              column anyway. */}
          {i < events.length - 1 && dayKey(events[i + 1].at) === dayKey(e.at) && (
            <span
              aria-hidden
              className="absolute start-[18px] top-3 bottom-[-12px] w-px"
              style={{ background: 'var(--line)' }}
            />
          )}
          {/* Timestamp */}
          <span className="font-mono text-[var(--fg-subtle)] text-[11px] shrink-0 w-[34px] tabular-nums pt-px">
            {formatTime(e.at)}
          </span>
          {/* Dot */}
          <span
            className="block w-1.5 h-1.5 rounded-full shrink-0 mt-[6px] relative z-[1]"
            style={{
              background: e.future
                ? 'color-mix(in oklab, var(--brand-500) 50%, var(--fg-muted))'
                : 'var(--brand-500)',
              boxShadow: e.future
                ? 'none'
                : '0 0 0 3px color-mix(in oklab, var(--brand-500) 14%, transparent)',
            }}
          />
          <div className="flex-1 min-w-0">
            <span className={e.future ? 'text-[var(--fg-muted)] italic' : 'text-[var(--fg)]'}>
              {e.label}
            </span>
          </div>
        </div>
        </Fragment>
      ))}
    </div>
  );
}
