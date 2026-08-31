'use client';

// The canonical order-detail view: a full-screen takeover with two columns.
//
// Replaces the 1060px right-side drawer, which put money, customer, delivery,
// invoice, notes and activity as six independent blocks in one 340px column
// and left the item list competing with all of it. The current layout splits
// the order along the questions staff actually ask:
//
//   ribbon  — where is this order in its life
//   ticket  — what was ordered
//   context — money, who ordered, where it goes, and consulted records in tabs
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
import { WhatsAppRecapDialog } from '@/components/orders/WhatsAppRecapDialog';
import type { CheckoutConfig, Order } from '@/lib/api';

import { OrderDetailShell } from './OrderDetailShell';
import { OrderDetailHead } from './OrderDetailHead';
import { CommandBar } from './CommandBar';
import { OrderOverflowMenu } from './menus/OrderOverflowMenu';
import { WorkflowStepper } from './spine/WorkflowStepper';
import { ScheduledBanner } from './spine/ScheduledCallout';
import { CancellationCallout } from './spine/CancellationCallout';
import { useOrderAudit } from '@/lib/orders/use-order-audit';
import { useOrderNotes } from '@/lib/orders/use-order-notes';
import { buildActivityEvents } from '@/lib/orders/activity-events';
import { splitCustomFieldAnswers } from '@/lib/orders/checkout-fields';
import { TicketItems } from './center/TicketItems';
import { CustomerPanel } from './context/CustomerPanel';
import { DeliveryPanel } from './context/DeliveryPanel';
import { MoneyPanel } from './context/MoneyPanel';
import { countOrderInvoices } from './context/InvoicePanel';
import { OrderReferenceTabs } from './context/OrderReferenceTabs';

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
  /** Raw checkout form. customFieldLabels arrives already flattened to
   *  id→label, resolved WITHOUT a locale — so the context column shows the
   *  owner's own label (the builder only ever writes `fr`), whatever language
   *  the staff member is in. The recap dialog needs the config itself so it
   *  can resolve the same answers in the CUSTOMER's language instead. */
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

  // Both reference fetches live above their tabs. Their counts and warning
  // marks remain visible even while another tab is active, and changing tabs
  // never starts a duplicate request.
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
  // disagree. Scheduled is informational blue, live work is orange, and a
  // terminal order is green in both the head and the progression rail.
  const stageKind = statusStageKind(order.status);
  const tone: 'warning' | 'success' | 'info' | 'danger' =
    caps.isCancelled ? 'danger'
    : caps.isScheduled ? 'info'
    : stageKind === 'completed' ? 'success'
    : 'warning';

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

  // Decided once for both panels. A hand-rolled "Code immeuble" is a fact
  // about the address, not about the customer, and used to render four rows
  // above the address it describes. Split here rather than in each panel: two
  // components each applying half a predicate is how an answer ends up shown
  // twice, or nowhere.
  const customFields = splitCustomFieldAnswers(order, customFieldLabels);

  return (
    <>
      <OrderDetailShell
        open
        onOpenChange={(v) => { if (!v) onClose(); }}
        title={t('orderNumber').replace('{id}', String(order.id))}
        head={
          <OrderDetailHead
            order={order}
            tone={tone}
            displayedLineCount={displayedLineCount}
            totalUnits={totalUnits}
            total={totalsLine}
            actions={canManage && caps.hasOverflow ? (
              <OrderOverflowMenu
                canCorrect={caps.canCorrectStatus && !!onOverride}
                canCorrectPayment={caps.canCorrectPayment && !!onCorrectPayment}
                canCorrectPaymentMethod={caps.canCorrectPaymentMethod && !!onCorrectPaymentMethod}
                canForceProduction={caps.canForceProduction}
                forceProductionActive={!!order.force_production}
                canCancel={caps.canCancelOrder}
                canDelete={caps.canDelete}
                onCorrect={onOverride}
                onCorrectPayment={onCorrectPayment}
                onCorrectPaymentMethod={onCorrectPaymentMethod}
                onToggleForceProduction={onToggleForceProduction}
                onCancel={onReject}
                onDelete={onDelete}
                disabled={isLoading}
              />
            ) : undefined}
          />
        }
        ribbon={<WorkflowStepper order={order} t={t} />}
        center={
          <>
            {/* Alerts head the ticket, and TicketItems opens with its own
                settlement banners, so the whole alarm stack stays contiguous. */}
            {caps.isScheduled && order.scheduled_for && (
              <div className="mb-[var(--s-3)]">
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
              <div className="mb-[var(--s-3)]">
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
              customFields={customFields.customer}
              customerInitials={customerInitials}
              t={t}
            />
            <DeliveryPanel order={order} customFields={customFields.address} t={t} />
            <MoneyPanel
              order={order}
              subtotal={subtotal}
              discountAmount={discountAmount}
              deliveryFee={deliveryFee}
              totalsLine={totalsLine}
              t={t}
            />
            <OrderReferenceTabs
              key={order.id}
              order={order}
              activityEvents={activityEvents}
              audit={audit}
              invoiceCount={invoiceCount}
              notes={notes}
              t={t}
              direction={direction}
            />
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
