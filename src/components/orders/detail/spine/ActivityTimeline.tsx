'use client';

import { CheckCircle2Icon, ClockIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ActivityEvent } from '@/lib/orders/activity-events';
import styles from '../order-detail.module.css';

/** Chronological order events, including audit failure and future milestones. */
export function ActivityTimeline({ events, auditFailed = false, t }: {
  events: ActivityEvent[];
  auditFailed?: boolean;
  t: (k: string) => string;
}) {
  const { locale } = useI18n();
  return <div>
    {auditFailed && <p className="mb-4 text-fs-xs text-[var(--fg-muted)]">{t('activityLoadError')}</p>}
    <ol className={styles.timeline}>
      {events.map((event, index) => {
        const date = new Date(event.at);
        return <li key={`${event.at}-${index}`} className={styles.timelineEvent}>
          {event.future ? <ClockIcon aria-hidden /> : <CheckCircle2Icon aria-hidden />}
          <div>
            <span className={event.future ? 'text-[var(--fg-muted)]' : 'font-semibold'}>{event.label}</span>
            <time dateTime={event.at}>{Number.isNaN(date.getTime()) ? event.at : date.toLocaleString(locale, {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}</time>
          </div>
        </li>;
      })}
    </ol>
  </div>;
}
