'use client';

// The canonical order-detail view: a full-screen takeover with three zones.
//
// Replaces the 1060px right-side drawer, which put money, customer, delivery,
// invoice, notes and activity in one 340px column and left the item list
// competing with all of it. The three zones split the order along the three
// questions staff actually ask:
//
//   spine   — where is this order in its life, and what has happened to it
//   centre  — what was ordered
//   context — money, who ordered, where it goes
//
// Purely presentational, exactly as before: every mutation is delegated to the
// on* callback props the host supplies.

import { useEffect, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { groupOrder } from '@/lib/orders/group-order';
import { printOrderTicket, type PrintTicketRestaurant, type TicketKind } from '@/lib/print-ticket';
import { deriveOrderCapabilities, type PrimaryAction } from '@/lib/orders/order-actions';
import { statusStageKind } from '@/lib/orders/workflow-stepper';
import { localizeOrderType } from '@/lib/orders/status-presentation';
import { DisclosureBlock } from './primitives/DisclosureBlock';
import { WhatsAppRecapDialog } from '@/components/orders/WhatsAppRecapDialog';
import type { CheckoutConfig, Order } from '@/lib/api';

import { OrderDetailShell } from './OrderDetailShell';
import { OrderDetailHead } from './OrderDetailHead';
import { CommandBar } from './CommandBar';
import { WorkflowStepper } from './spine/WorkflowStepper';
import { ScheduledBanner } from './spine/ScheduledCallout';
import { CancellationCallout } from './spine/CancellationCallout';
import { ActivityTimeline } from './spine/ActivityTimeline';
import { useOrderAudit } from '@/lib/orders/use-order-audit';
import { useOrderNotes } from '@/lib/orders/use-order-notes';
import { buildActivityEvents } from '@/lib/orders/activity-events';
import { TicketItems } from './center/TicketItems';
import { CustomerPanel } from './context/CustomerPanel';
import { DeliveryPanel } from './context/DeliveryPanel';
import { MoneyPanel } from './context/MoneyPanel';
import { InvoiceSection, countOrderInvoices } from './context/InvoicePanel';
import { OrderNotesSection } from './context/NotesPanel';

export interface OrderDetailModalProps {
  order: Order | null;
  canManage: boolean;
  canDelete?: boolean;
  canOverride?: boolean;
  isLoading: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onDelete?: () => void;
  onOverride?: () => void;
  /** Opens the correct-payment dialog (owner/manager, cash/manual orders only). */
  onCorrectPayment?: () => void;
  /** Opens the correct-payment-METHOD dialog: relabels how a settled order was
   *  paid (cash ⇄ card) without moving its payment status. */
  onCorrectPaymentMethod?: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
  onOutForDelivery: () => void;
  onMarkDelivered: () => void;
  onTakePayment: () => void;
  onCloseOrder: () => void;
  onEdit: () => void;
  /** Opens the confirm-weights modal for by-weight orders on a card hold.
   *  The action only renders when order.settlement_status === "held". */
  onConfirmWeights?: () => void;
  /** Opens the edit-customer dialog (fix a misspelled name/address). When
   *  omitted or when !canManage, the customer name renders as plain text. */
  onEditCustomer?: () => void;
  /** Toggles the "add to production plan" override. Absent = action hidden. */
  onToggleForceProduction?: () => void;
  restaurantInfo: PrintTicketRestaurant;
  /** Restaurant's own language (he/fr/en). Fallback for the customer-facing
   *  WhatsApp recap when the order carries no customer_locale. */
  restaurantDefaultLocale?: string;
  customFieldLabels: Record<string, string>;
  /** Raw checkout form. customFieldLabels is resolved in the STAFF's
   *  language for the context column; the recap dialog needs the config
   *  itself so it can label the same answers in the customer's. */
  checkoutConfig?: CheckoutConfig | null;
}

/** "Still counting." Silent to assistive tech: the count beside it is already
 *  live and will simply grow. */
function PendingMark() {
  return <span aria-hidden className="text-[10px] leading-none text-[var(--fg-subtle)]">…</span>;
}

/** The count could not be established. The reason is announced on the FOLDED
 *  heading, not left inside a body nobody has opened. */
function FailedMark({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-[var(--warning-500)]">
      <AlertTriangleIcon aria-hidden className="w-3 h-3" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function OrderDetailModal({
  order, canManage, canDelete, canOverride, isLoading, onClose, onAccept, onReject, onDelete,
  onOverride, onCorrectPayment, onCorrectPaymentMethod, onSendToKitchen, onMarkReady, onMarkServed,
  onOutForDelivery, onMarkDelivered, onTakePayment, onCloseOrder, onEdit, onConfirmWeights,
  onEditCustomer, onToggleForceProduction, restaurantInfo, restaurantDefaultLocale, customFieldLabels, checkoutConfig,
}: OrderDetailModalProps) {
  const { t, locale, direction } = useI18n();

  // WhatsApp order-confirmation recap ("Envoyer au client → Confirmation").
  const [recapOpen, setRecapOpen] = useState(false);
  useEffect(() => {
    setRecapOpen(false);
  }, [order?.id]);

  // Both appendix fetches live up here, above the collapse. The blocks at the
  // foot of the ticket are folded by default and their bodies UNMOUNT when
  // closed — so anything that fetched inside them could never tell the closed
  // heading how much is inside, and a fold without a count is exactly the "did
  // I miss something?" this screen exists to remove.
  const audit = useOrderAudit(order?.restaurant_id, order?.id);
  const notes = useOrderNotes(order?.restaurant_id, order?.id);

  if (!order) {
    // The production page hands down order=null while it fetches, and used to
    // get a *closed* dialog for it — clicking a row on a slow connection looked
    // like nothing happened. With isLoading it now opens onto the skeleton.
    return (
      <OrderDetailShell
        open={isLoading}
        onOpenChange={(v) => { if (!v) onClose(); }}
        title={t('loading')}
        head={<div className="h-[60px]" />}
        loading
        center={null}
        context={null}
      />
    );
  }

  const caps = deriveOrderCapabilities(
    order,
    { canManage, canOverride, canDelete },
    {
      onConfirmWeights: !!onConfirmWeights,
      onOverride: !!onOverride,
      onCorrectPayment: !!onCorrectPayment,
      onCorrectPaymentMethod: !!onCorrectPaymentMethod,
      onToggleForceProduction: !!onToggleForceProduction,
      onDelete: !!onDelete,
    },
  );

  // The head's tone follows where the order sits in the pipeline, via the same
  // status→kind mapping the stepper uses, so the dot and the rail can never
  // disagree. "in_progress" pulses because it is the state staff act on.
  const stageKind = statusStageKind(order.status);
  const isActive = stageKind === 'in_progress';
  const tone: 'warning' | 'success' | 'info' | 'danger' =
    caps.isCancelled ? 'danger'
    : isActive ? 'warning'
    : stageKind === 'completed' ? 'success'
    : 'info';

  // Category groups, combo groups and reconciled totals all come from the
  // shared groupOrder() — the same math the printed ticket and the WhatsApp
  // recap use, so the three surfaces can never disagree about what was ordered.
  const {
    categoryGroups,
    comboGroups,
    subtotal,
    deliveryFee,
    discountAmount,
    total: totalsLine,
    displayedLineCount,
    totalUnits,
  } = groupOrder(order, {
    uncategorized: t('uncategorized') || 'Autres',
    comboFallback: t('comboMenuFallback') || 'Combo Menu',
  });

  const customerInitials = order.customer_name
    ? order.customer_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'C';

  const handlePrint = (kind: TicketKind) => {
    printOrderTicket({
      order,
      kind,
      restaurant: restaurantInfo,
      locale,
      dir: direction,
      labels: {
        receiptHeading: t('receiptHeading') || 'RECEIPT',
        kitchenHeading: t('kitchenHeading') || 'KITCHEN',
        orderNumber: t('orderNumber').replace('{id}', String(order.id)),
        date: t('date'),
        type: t('type'),
        typeValue: localizeOrderType(order.order_type, t),
        table: t('tableHeading') || 'Table',
        customer: t('customer'),
        phone: t('phone'),
        subtotal: t('subtotal') || 'Sous-total',
        deliveryFee: t('delivery_fee') || 'Frais de livraison',
        total: t('total'),
        uncategorized: t('uncategorized') || 'Autres',
        comboFallback: t('comboMenuFallback') || 'Combo',
      },
    });
  };

  const PRIMARY_HANDLER: Record<PrimaryAction, () => void> = {
    accept: onAccept,
    sendToKitchen: onSendToKitchen,
    markReady: onMarkReady,
    markServed: onMarkServed,
    markOutForDelivery: onOutForDelivery,
    markDelivered: onMarkDelivered,
  };

  // Decides whether the invoice block exists at all, and labels it when it
  // does. Both come from external_metadata, so neither costs a fetch — the
  // section's own getOrderInvoice is now deferred until someone opens it.
  const invoiceCount = countOrderInvoices(order);

  // Built here rather than inside the timeline: the folded heading has to say
  // how many rows are inside. `audit.events` is NOT that number — the builder
  // recognises exactly two audit actions and drops the rest.
  const activityEvents = buildActivityEvents(order, audit.events, t);

  return (
    <>
      <OrderDetailShell
        open
        onOpenChange={(v) => { if (!v) onClose(); }}
        title={t('orderNumber').replace('{id}', String(order.id))}
        head={<OrderDetailHead order={order} tone={tone} isActive={isActive} />}
        ribbon={<WorkflowStepper order={order} t={t} />}
        center={
          <>
            {/* Alerts head the ticket, and TicketItems opens with its own
                settlement banners, so the whole alarm stack stays contiguous. */}
            {caps.isScheduled && order.scheduled_for && (
              <div className="mb-[var(--s-4)]">
                <ScheduledBanner
                  iso={order.scheduled_for}
                  windowStart={order.scheduled_pickup_window_start}
                  windowEnd={order.scheduled_pickup_window_end}
                  orderType={order.order_type}
                  t={t}
                />
              </div>
            )}
            {caps.isCancelled && (
              <div className="mb-[var(--s-4)]">
                <CancellationCallout order={order} t={t} />
              </div>
            )}
            <TicketItems
            order={order}
            categoryGroups={categoryGroups}
            comboGroups={comboGroups}
            displayedLineCount={displayedLineCount}
            totalUnits={totalUnits}
              onConfirmWeights={caps.canConfirmWeights ? onConfirmWeights : undefined}
              t={t}
            />
          </>
        }
        context={
          <div className="flex flex-col">
            <CustomerPanel
              order={order}
              canManage={canManage}
              onEditCustomer={onEditCustomer}
              customFieldLabels={customFieldLabels}
              customerInitials={customerInitials}
              t={t}
            />
            <DeliveryPanel order={order} t={t} />
            <MoneyPanel
              order={order}
              subtotal={subtotal}
              discountAmount={discountAmount}
              deliveryFee={deliveryFee}
              totalsLine={totalsLine}
              t={t}
            />
          </div>
        }
        reference={
          // The appendix: reference material, consulted rather than monitored.
          // One --line-strong rule marks the seam with the ticket; each block's
          // own first:border-t-0 keeps it the only rule there.
          //
          // Everything here folds, and every heading carries a count, because
          // the three blocks together held ~394px of a screen staff should be
          // able to read without scrolling — 207px of it spent saying "no
          // notes". Folding is only safe BECAUSE of the counts: a closed block
          // always states how much is inside, so nothing can be missed by not
          // looking.
          //
          // Order: the two read-only records first, then notes — the only
          // editable block, so the one thing you might DO down here sits
          // closest to the command bar.
          //
          // Every key is `${block}-${order.id}`: the reused modal instance swaps
          // the order underneath, and without a remount the auto-open latch and
          // the open/closed state would carry across. Keyed on the ID and never
          // the object — the board hands down a new reference on every
          // WebSocket event, which would fold up a block mid-read.
          <div className="border-t border-[var(--line-strong)] pt-[var(--s-5)]">
            <DisclosureBlock
              key={`activity-${order.id}`}
              label={t('activity') || 'Activité'}
              count={activityEvents.length}
              // While the audit is in flight the count is the lifecycle-only
              // trail, so it can only rise (4 → 5). It never reads 0, because
              // created_at always yields a row. The ellipsis makes "4 …" read
              // as "at least four" rather than as a settled figure.
              mark={
                audit.status === 'loading' ? (
                  <PendingMark />
                ) : audit.status === 'error' ? (
                  <FailedMark label={t('activityLoadError')} />
                ) : null
              }
            >
              <ActivityTimeline
                events={activityEvents}
                auditFailed={audit.status === 'error'}
                t={t}
              />
            </DisclosureBlock>

            {invoiceCount > 0 && (
              <DisclosureBlock
                key={`invoice-${order.id}`}
                label={t('invoiceHeading') || 'Invoice'}
                count={invoiceCount}
              >
                <InvoiceSection order={order} />
              </DisclosureBlock>
            )}

            <DisclosureBlock
              key={`notes-${order.id}`}
              label={t('orderNotesHeading') || 'Notes internes'}
              // Withheld unless the list is KNOWN. status 'error' carries an
              // empty array, and "NOTES INTERNES 0" over a folded block would
              // be a confident lie about an order that may well have notes.
              count={notes.status === 'ready' ? notes.notes.length : undefined}
              mark={
                notes.status === 'loading' ? (
                  <PendingMark />
                ) : notes.status === 'error' ? (
                  <FailedMark label={t('orderNotesLoadError')} />
                ) : null
              }
              // Notes open themselves the moment there turn out to be any — an
              // unread note is the one thing in this appendix that is genuinely
              // about right now. A failed load opens too, so the error is on
              // screen rather than buried in an unmounted body.
              openWhen={notes.status === 'error' || notes.notes.length > 0}
            >
              <OrderNotesSection
                notes={notes.notes}
                status={notes.status}
                onAdd={notes.add}
                onRemove={notes.remove}
                t={t}
                direction={direction}
              />
            </DisclosureBlock>
          </div>
        }
        footer={
          <CommandBar
            order={order}
            caps={caps}
            canManage={canManage}
            isLoading={isLoading}
            onEdit={onEdit}
            onPrint={handlePrint}
            onSendConfirmation={() => setRecapOpen(true)}
            onConfirmWeights={onConfirmWeights}
            onTakePayment={onTakePayment}
            onCloseOrder={onCloseOrder}
            onOverride={onOverride}
            onCorrectPayment={onCorrectPayment}
            onCorrectPaymentMethod={onCorrectPaymentMethod}
            onToggleForceProduction={onToggleForceProduction}
            onReject={onReject}
            onDelete={onDelete}
            onPrimary={(action) => PRIMARY_HANDLER[action]()}
          />
        }
      />

      <WhatsAppRecapDialog
        open={recapOpen}
        onOpenChange={setRecapOpen}
        order={order}
        restaurantId={order.restaurant_id}
        restaurantName={restaurantInfo.name || ''}
        restaurantDefaultLocale={restaurantDefaultLocale}
        checkoutConfig={checkoutConfig}
      />
    </>
  );
}
