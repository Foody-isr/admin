'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { Drawer } from '@/components/ds';
import type { Order } from '@/lib/api';
import type { ActivityEvent } from '@/lib/orders/activity-events';
import type { OrderAuditState } from '@/lib/orders/use-order-audit';
import type { OrderNotesState } from '@/lib/orders/use-order-notes';
import { ActivityTimeline } from '../spine/ActivityTimeline';
import { InvoiceSection } from './InvoicePanel';
import { OrderNotesSection } from './NotesPanel';

type ReferenceView = 'activity' | 'invoice' | 'notes';

function Count({ children }: { children: ReactNode }) {
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
 * Compact record shortcuts. Their full content is deliberately portalled into
 * a Drawer: activity, invoices and notes can never contribute to the order
 * grid's height, so the main surface only scrolls when the ticket itself grows.
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
  const [openView, setOpenView] = useState<ReferenceView | null>(null);
  const columns = invoiceCount > 0 ? 'grid-cols-3' : 'grid-cols-2';
  const title = openView === 'invoice'
    ? t('invoiceHeading') || 'Facture'
    : openView === 'notes'
      ? t('orderNotesHeading') || 'Notes internes'
      : t('activity') || 'Activité';

  const shortcutClass =
    'flex h-10 min-w-0 items-center justify-center gap-1.5 border-b-2 border-transparent px-1 ' +
    'text-fs-xs font-semibold text-[var(--fg-muted)] transition-colors ' +
    'hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] ' +
    'focus-visible:outline-none focus-visible:shadow-ring rounded-r-sm';

  return (
    <>
      <section className="mt-[var(--s-2)] border-t border-[var(--line-strong)] pt-1">
        <div
          role="group"
          aria-label={t('details')}
          className={`grid ${columns} border-b border-[var(--line)]`}
        >
          <button type="button" onClick={() => setOpenView('activity')} className={shortcutClass}>
            <span className="truncate">{t('activity') || 'Activité'}</span>
            <Count>{activityEvents.length}</Count>
            {audit.status === 'loading' && (
              <span aria-hidden className="text-[10px] leading-none text-[var(--fg-subtle)]">…</span>
            )}
            {audit.status === 'error' && <FailedMark label={t('activityLoadError')} />}
          </button>

          {invoiceCount > 0 && (
            <button type="button" onClick={() => setOpenView('invoice')} className={shortcutClass}>
              <span className="truncate">{t('invoiceHeading') || 'Facture'}</span>
              <Count>{invoiceCount}</Count>
            </button>
          )}

          <button type="button" onClick={() => setOpenView('notes')} className={shortcutClass}>
            <span className="truncate">{t('orderNotesHeading') || 'Notes'}</span>
            {notes.status === 'ready' && <Count>{notes.notes.length}</Count>}
            {notes.status === 'loading' && (
              <span aria-hidden className="text-[10px] leading-none text-[var(--fg-subtle)]">…</span>
            )}
            {notes.status === 'error' && <FailedMark label={t('orderNotesLoadError')} />}
          </button>
        </div>
      </section>

      <Drawer
        open={openView !== null}
        onOpenChange={(open) => { if (!open) setOpenView(null); }}
        title={title}
        subtitle={t('orderNumber').replace('{id}', String(order.id))}
        width={480}
        className="order-detail-surface max-w-[100vw] sm:max-w-[95vw]"
      >
        {openView === 'activity' && (
          <ActivityTimeline
            events={activityEvents}
            auditFailed={audit.status === 'error'}
            t={t}
          />
        )}
        {openView === 'invoice' && <InvoiceSection order={order} />}
        {openView === 'notes' && (
          <OrderNotesSection
            notes={notes.notes}
            status={notes.status}
            onAdd={notes.add}
            onRemove={notes.remove}
            t={t}
            direction={direction}
          />
        )}
      </Drawer>
    </>
  );
}
