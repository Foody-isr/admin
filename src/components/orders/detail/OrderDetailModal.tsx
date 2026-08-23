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
import { useI18n } from '@/lib/i18n';
import { groupOrder } from '@/lib/orders/group-order';
import { printOrderTicket, type PrintTicketRestaurant, type TicketKind } from '@/lib/print-ticket';
import { deriveOrderCapabilities, type PrimaryAction } from '@/lib/orders/order-actions';
import { statusStageKind } from '@/lib/orders/workflow-stepper';
import { localizeOrderType } from '@/lib/orders/status-presentation';
import { ContextBlock } from './primitives/ContextBlock';
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
import { TicketItems } from './center/TicketItems';
import { CustomerPanel } from './context/CustomerPanel';
import { DeliveryPanel } from './context/DeliveryPanel';
import { MoneyPanel } from './context/MoneyPanel';
import { InvoiceSection } from './context/InvoicePanel';
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

  // Lifted out of ActivityTimeline: the trail mounts twice (spine at lg+,
  // context column below), and one fetch must serve both.
  const audit = useOrderAudit(order?.restaurant_id, order?.id);

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

  // Hoisted out of the JSX: it was a four-line inline expression inside the
  // context column and now decides whether an appendix block exists at all.
  const hasInvoice = Boolean(
    order.external_metadata?.document_number ||
      (Array.isArray(order.external_metadata?.supplementary_invoices) &&
        (order.external_metadata.supplementary_invoices as unknown[]).length > 0),
  );

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
          // The appendix. One --line-strong rule marks the seam between the
          // ticket and the reference material; ContextBlock's own
          // first:border-t-0 keeps it the only rule there.
          //
          // Order: the two read-only records first, then notes — the only
          // editable block, ending in its composer, so the one thing you might
          // DO down here sits closest to the command bar.
          <div className="border-t border-[var(--line-strong)] pt-[var(--s-5)]">
            <ContextBlock label={t('activity') || 'Activité'}>
              <ActivityTimeline
                order={order}
                auditEvents={audit.events}
                auditFailed={audit.status === 'error'}
                t={t}
              />
            </ContextBlock>
            {hasInvoice && (
              <ContextBlock label={t('invoiceHeading') || 'Invoice'}>
                <InvoiceSection order={order} />
              </ContextBlock>
            )}
            <ContextBlock label={t('orderNotesHeading') || 'Notes internes'}>
              <OrderNotesSection order={order} t={t} direction={direction} />
            </ContextBlock>
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
