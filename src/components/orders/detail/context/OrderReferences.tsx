'use client';

import { AlertTriangleIcon, ChevronUpIcon, MessageSquareTextIcon } from 'lucide-react';
import { Drawer } from '@/components/ds';
import type { Order } from '@/lib/api';
import type { ActivityEvent } from '@/lib/orders/activity-events';
import type { OrderAuditState } from '@/lib/orders/use-order-audit';
import type { OrderNotesState } from '@/lib/orders/use-order-notes';
import { ActivityTimeline } from '../spine/ActivityTimeline';
import { InvoiceSection } from './InvoicePanel';
import { OrderNotesSection } from './NotesPanel';

export type OrderReferenceView = 'activity' | 'invoice' | 'notes';

function FailedMark({ label }: { label: string }) {
  return (
    <span className="inline-flex text-[var(--warning-500)]" title={label}>
      <AlertTriangleIcon aria-hidden className="size-3" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Fixed shortcut below the ticket. Full note content opens in a drawer so the
 * dock never steals item-list height as notes accumulate. */
export function OrderNotesDock({
  notes,
  onOpen,
  t,
}: {
  notes: OrderNotesState;
  onOpen: () => void;
  t: (key: string) => string;
}) {
  const preview = notes.status === 'ready' ? notes.notes[0]?.body : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-12 w-full min-w-0 items-center gap-[var(--s-2)] rounded-r-sm text-start focus-visible:outline-none focus-visible:shadow-ring"
    >
      <MessageSquareTextIcon aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
      <span className="text-fs-xs font-semibold uppercase tracking-[0.08em] text-[var(--fg-muted)]">
        {t('orderNotesHeading') || 'Notes internes'}
      </span>
      {notes.status === 'ready' && (
        <span className="tabular-nums text-[10px] text-[var(--fg-subtle)]">{notes.notes.length}</span>
      )}
      {notes.status === 'loading' && (
        <span aria-hidden className="text-[10px] text-[var(--fg-subtle)]">…</span>
      )}
      {notes.status === 'error' && <FailedMark label={t('orderNotesLoadError')} />}
      {preview && (
        <span className="ms-[var(--s-2)] hidden min-w-0 flex-1 truncate text-fs-xs text-[var(--fg-subtle)] md:block">
          {preview}
        </span>
      )}
      <ChevronUpIcon aria-hidden className="ms-auto size-4 shrink-0 text-[var(--fg-subtle)]" />
    </button>
  );
}

/** Portalled reference content opened by the head menu or notes dock. */
export function OrderReferenceDrawer({
  view,
  onOpenChange,
  order,
  activityEvents,
  audit,
  notes,
  t,
  direction,
}: {
  view: OrderReferenceView | null;
  onOpenChange: (open: boolean) => void;
  order: Order;
  activityEvents: ActivityEvent[];
  audit: OrderAuditState;
  notes: OrderNotesState;
  t: (key: string) => string;
  direction: 'ltr' | 'rtl';
}) {
  const title = view === 'invoice'
    ? t('invoiceHeading') || 'Facture'
    : view === 'notes'
      ? t('orderNotesHeading') || 'Notes internes'
      : t('activity') || 'Activité';

  return (
    <Drawer
      open={view !== null}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={t('orderNumber').replace('{id}', String(order.id))}
      width={480}
      className="order-detail-surface max-w-[100vw] sm:max-w-[95vw]"
    >
      {view === 'activity' && (
        <ActivityTimeline
          events={activityEvents}
          auditFailed={audit.status === 'error'}
          t={t}
        />
      )}
      {view === 'invoice' && <InvoiceSection order={order} />}
      {view === 'notes' && (
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
  );
}
