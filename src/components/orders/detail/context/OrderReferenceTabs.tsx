'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { Button, Tab, Tabs, TabsContent, TabsList } from '@/components/ds';
import type { Order } from '@/lib/api';
import type { ActivityEvent } from '@/lib/orders/activity-events';
import type { OrderAuditState } from '@/lib/orders/use-order-audit';
import type { OrderNotesState } from '@/lib/orders/use-order-notes';
import { ActivityTimeline } from '../spine/ActivityTimeline';
import { InvoiceSection } from './InvoicePanel';
import { OrderNotesSection } from './NotesPanel';

type ReferenceTab = 'activity' | 'invoice' | 'notes';

function TabCount({ children }: { children: ReactNode }) {
  return (
    <span className="tabular-nums text-[10px] leading-none text-[var(--fg-subtle)]">
      {children}
    </span>
  );
}

function FailedMark({ label }: { label: string }) {
  return (
    <span className="inline-flex text-[var(--warning-500)]" title={label}>
      <AlertTriangleIcon aria-hidden className="size-3" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The order's consulted records, using the otherwise empty space below the
 * total. Only one record is visible at a time, so a long audit trail or note
 * composer never pushes the ticket down merely by existing.
 */
export function OrderReferenceTabs({
  order,
  activityEvents,
  audit,
  invoiceCount,
  notes,
  t,
  direction,
}: {
  order: Order;
  activityEvents: ActivityEvent[];
  audit: OrderAuditState;
  invoiceCount: number;
  notes: OrderNotesState;
  t: (key: string) => string;
  direction: 'ltr' | 'rtl';
}) {
  const [active, setActive] = useState<ReferenceTab>('activity');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const userSelected = useRef(false);

  // Notes arrive after the first paint. Surface an existing note once, unless
  // the reader has already chosen another tab; async data must not steal their
  // current context.
  useEffect(() => {
    if (notes.status === 'ready' && notes.notes.length > 0 && !userSelected.current) {
      setActive('notes');
    }
  }, [notes.status, notes.notes.length]);

  const visibleEvents = showAllActivity ? activityEvents : activityEvents.slice(-4);

  return (
    <section className="mt-[var(--s-4)] border-t border-[var(--line-strong)] pt-[var(--s-2)]">
      <Tabs
        value={active}
        onValueChange={(value) => {
          userSelected.current = true;
          setActive(value as ReferenceTab);
        }}
        variant="underline"
        className="gap-[var(--s-3)]"
      >
        <TabsList aria-label={t('details')} className="w-full gap-0">
          <Tab
            value="activity"
            className="min-w-0 flex-1 justify-center gap-1.5 px-1 text-fs-xs data-[state=active]:text-[var(--brand-500)]"
          >
            <span className="truncate">{t('activity') || 'Activité'}</span>
            <TabCount>{activityEvents.length}</TabCount>
            {audit.status === 'loading' && (
              <span aria-hidden className="text-[10px] leading-none text-[var(--fg-subtle)]">…</span>
            )}
            {audit.status === 'error' && <FailedMark label={t('activityLoadError')} />}
          </Tab>

          {invoiceCount > 0 && (
            <Tab
              value="invoice"
              className="min-w-0 flex-1 justify-center gap-1.5 px-1 text-fs-xs data-[state=active]:text-[var(--brand-500)]"
            >
              <span className="truncate">{t('invoiceHeading') || 'Facture'}</span>
              <TabCount>{invoiceCount}</TabCount>
            </Tab>
          )}

          <Tab
            value="notes"
            className="min-w-0 flex-1 justify-center gap-1.5 px-1 text-fs-xs data-[state=active]:text-[var(--brand-500)]"
          >
            <span className="truncate">{t('orderNotesHeading') || 'Notes'}</span>
            {notes.status === 'ready' && <TabCount>{notes.notes.length}</TabCount>}
            {notes.status === 'loading' && (
              <span aria-hidden className="text-[10px] leading-none text-[var(--fg-subtle)]">…</span>
            )}
            {notes.status === 'error' && <FailedMark label={t('orderNotesLoadError')} />}
          </Tab>
        </TabsList>

        <TabsContent value="activity" className="pb-[var(--s-2)]">
          <ActivityTimeline
            events={visibleEvents}
            auditFailed={audit.status === 'error'}
            t={t}
          />
          {!showAllActivity && activityEvents.length > visibleEvents.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllActivity(true)}
              className="mt-[var(--s-2)] px-0 text-[var(--brand-500)] hover:bg-transparent"
            >
              {t('seeAll') || 'Voir tous'}
            </Button>
          )}
        </TabsContent>

        {invoiceCount > 0 && (
          <TabsContent value="invoice" className="pb-[var(--s-2)]">
            <InvoiceSection order={order} />
          </TabsContent>
        )}

        <TabsContent value="notes" className="pb-[var(--s-2)]">
          <OrderNotesSection
            notes={notes.notes}
            status={notes.status}
            onAdd={notes.add}
            onRemove={notes.remove}
            t={t}
            direction={direction}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
