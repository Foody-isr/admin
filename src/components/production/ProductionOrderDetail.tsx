'use client';

import { useCallback, useEffect, useState } from 'react';
import { OrderDetailModal } from '@/components/orders/detail/OrderDetailModal';
import { buildCustomFieldLabels } from '@/lib/orders/checkout-fields';
import { EditOrderDrawer } from '@/components/orders/EditOrderDrawer';
import { TakePaymentDialog, PaymentMethod } from '@/components/orders/TakePaymentDialog';
import { ConfirmWeightsModal } from '@/components/orders/ConfirmWeightsModal';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ConfirmDialog } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';
import { type PrintTicketRestaurant } from '@/lib/print-ticket';
import {
  getOrder, getRestaurant, getWebsiteConfig,
  acceptOrder, rejectOrder, updateOrderStatus, updateOrderPaymentStatus,
  markOrderServed, markOrderDelivered, markOrderOutForDelivery, markOrderReadyForDelivery,
  Order,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Props {
  restaurantId: number;
  orderId: number | null;
  onClose: () => void;
}

/**
 * Production-page wrapper around the canonical {@link OrderDetailModal}. Loads
 * the full order on demand and wires the staff actions (accept, kitchen, ready,
 * payment, edit, …) so clicking a production-sheet row opens the same rich order
 * details modal used on the orders board. After any mutation the single order is
 * refetched to keep the drawer in sync (there is no list to update here).
 */
export function ProductionOrderDetail({ restaurantId, orderId, onClose }: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');

  const [order, setOrder] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Same reasoning as the orders board: no native confirm() over a
  // token-styled takeover.
  const [pendingClose, setPendingClose] = useState(false);

  // Minimal restaurant identity for printed tickets + custom checkout-field
  // labels — same data the orders board feeds the drawer.
  const [restaurantInfo, setRestaurantInfo] = useState<PrintTicketRestaurant>({});
  const [restaurantLocale, setRestaurantLocale] = useState<string>('');
  const [customFieldLabels, setCustomFieldLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!restaurantId) return;
    getRestaurant(restaurantId)
      .then((r) => {
        setRestaurantInfo({ name: r.name, address: r.address, phone: r.phone });
        setRestaurantLocale(r.default_locale || '');
      })
      .catch(() => {});
    getWebsiteConfig(restaurantId)
      .then((cfg) => setCustomFieldLabels(buildCustomFieldLabels(cfg.checkout_config)))
      .catch(() => {});
  }, [restaurantId]);

  const refetch = useCallback(() => {
    if (orderId == null) return;
    getOrder(restaurantId, orderId).then(setOrder).catch(() => {});
  }, [restaurantId, orderId]);

  // Load the selected order (and clear it when the drawer closes).
  useEffect(() => {
    if (orderId == null) {
      setOrder(null);
      return;
    }
    getOrder(restaurantId, orderId).then(setOrder).catch(() => {});
  }, [restaurantId, orderId]);

  const run = async (fn: () => Promise<unknown>) => {
    setActionLoading(true);
    try {
      await fn();
    } finally {
      setActionLoading(false);
    }
    refetch();
  };

  const handleAccept = () => order && run(() => acceptOrder(restaurantId, order.id));
  // Cancellation now requires a reason, collected in CancelOrderDialog.
  const handleReject = () => order && setCancelOpen(true);
  const handleCancelConfirm = (reasonCode: string, note: string) => {
    if (!order) return;
    return run(() => rejectOrder(restaurantId, order.id, reasonCode, note));
  };
  const handleSendToKitchen = () =>
    order && run(() => updateOrderStatus(restaurantId, order.id, 'in_kitchen'));
  const handleMarkReady = () => {
    if (!order) return;
    return order.order_type === 'delivery'
      ? run(() => markOrderReadyForDelivery(restaurantId, order.id))
      : run(() => updateOrderStatus(restaurantId, order.id, 'ready'));
  };
  const handleMarkServed = () =>
    order && run(() => updateOrderStatus(restaurantId, order.id, 'served'));
  const handleOutForDelivery = () =>
    order && run(() => markOrderOutForDelivery(restaurantId, order.id));
  const handleMarkDelivered = () =>
    order && run(() => markOrderDelivered(restaurantId, order.id));

  const handleCloseOrder = () => {
    if (!order) return;
    run(async () => {
      if (order.order_type === 'delivery') {
        await markOrderDelivered(restaurantId, order.id);
      } else {
        await markOrderServed(restaurantId, order.id);
      }
    });
    onClose();
  };

  const handleTakePayment = (method: PaymentMethod, reference?: string) => {
    if (!order) return Promise.resolve();
    return updateOrderPaymentStatus(restaurantId, order.id, 'paid', method, reference)
      .then((updated) => setOrder((prev) => (prev ? { ...prev, ...updated } : prev)))
      .catch(() => refetch());
  };

  return (
    <>
      <OrderDetailModal
        order={order}
        canManage={canManage}
        isLoading={actionLoading}
        onClose={onClose}
        onAccept={handleAccept}
        onReject={handleReject}
        onSendToKitchen={handleSendToKitchen}
        onMarkReady={handleMarkReady}
        onMarkServed={handleMarkServed}
        onOutForDelivery={handleOutForDelivery}
        onMarkDelivered={handleMarkDelivered}
        onTakePayment={() => setPaymentOpen(true)}
        onCloseOrder={() => setPendingClose(true)}
        onEdit={() => setEditOpen(true)}
        onConfirmWeights={() => setWeightsOpen(true)}
        restaurantInfo={restaurantInfo}
        restaurantDefaultLocale={restaurantLocale}
        customFieldLabels={customFieldLabels}
      />

      <EditOrderDrawer
        open={editOpen}
        order={order}
        restaurantId={restaurantId}
        onClose={() => setEditOpen(false)}
        onSaved={refetch}
      />

      <TakePaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        totalAmount={order?.total_amount ?? 0}
        onConfirm={handleTakePayment}
        discountAmount={order?.discount_amount}
        discountLabel={order?.discount?.code}
      />

      <ConfirmWeightsModal
        open={weightsOpen}
        onOpenChange={setWeightsOpen}
        order={order}
        onConfirmed={refetch}
      />

      <ConfirmDialog
        open={pendingClose}
        onOpenChange={setPendingClose}
        title={t('closeOrder')}
        description={t('closeOrderConfirm')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          setPendingClose(false);
          handleCloseOrder();
        }}
      />

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancelConfirm}
      />
    </>
  );
}
