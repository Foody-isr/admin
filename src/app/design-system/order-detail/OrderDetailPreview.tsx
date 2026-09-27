'use client';

import { useState } from 'react';
import { OrderDetailModal } from '@/components/orders/detail/OrderDetailModal';
import { Button, Chip, ConfirmDialog } from '@/components/ds';
import { useTheme } from '@/lib/theme-context';
import {
  PREVIEW_ORDERS,
  PREVIEW_RESTAURANT,
  PREVIEW_CUSTOM_FIELD_LABELS,
  type PreviewKey,
} from './fixtures';

/**
 * Renders the order detail against fixture orders, with no auth and no API.
 *
 * The redesign runs over several phases and every one needs to be looked at in
 * a browser; logging into the dev environment and hunting for an order in the
 * right state each time is the slow path. Scenario chips switch between the
 * states that are otherwise hard to reproduce on demand.
 *
 * The fixture uses restaurant_id=0 below so sections that normally fetch on
 * mount stay local. Without that guard, the unauthenticated design-system route
 * is redirected to login before the preview can render.
 */
export function OrderDetailPreview() {
  const { theme, toggleTheme } = useTheme();
  const [key, setKey] = useState<PreviewKey>('delivery');
  const [open, setOpen] = useState(true);
  // Mirrors how the real hosts wire the irreversible actions, so the preview
  // exercises the confirmation rather than a no-op.
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const scenario = PREVIEW_ORDERS.find((s) => s.key === key) ?? PREVIEW_ORDERS[0];
  const previewOrder = { ...scenario.order, restaurant_id: 0 };
  const noop = () => {};

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] px-[var(--s-4)] pb-[var(--s-4)] sm:px-[var(--s-8)] sm:pb-[var(--s-8)] pt-[max(var(--s-4),var(--safe-top))] sm:pt-[max(var(--s-8),var(--safe-top))]">
      <h1 className="text-fs-3xl font-semibold leading-none -tracking-[0.02em]">
        Order detail preview
      </h1>
      <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">
        Dev-only. Fixture orders, no API. Pick a scenario, then reopen.
      </p>

      <div className="flex flex-wrap items-center gap-[var(--s-2)] mt-[var(--s-6)]">
        {PREVIEW_ORDERS.map((s) => (
          <Chip
            key={s.key}
            active={s.key === key}
            onClick={() => {
              setKey(s.key);
              setOpen(true);
            }}
          >
            {s.label}
          </Chip>
        ))}
        <Button variant="secondary" size="md" onClick={() => setOpen(true)} className="ms-[var(--s-4)]">
          Ouvrir
        </Button>
        <Button variant="secondary" size="md" onClick={toggleTheme}>
          {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        </Button>
      </div>

      <OrderDetailModal
        order={open ? previewOrder : null}
        canManage
        canDelete
        canOverride
        isLoading={false}
        onClose={() => setOpen(false)}
        onAccept={noop}
        onReject={noop}
        onDelete={() => setPendingDelete(true)}
        onOverride={noop}
        onCorrectPayment={noop}
        onCorrectPaymentMethod={noop}
        onSendToKitchen={noop}
        onMarkReady={noop}
        onMarkServed={noop}
        onOutForDelivery={noop}
        onMarkDelivered={noop}
        onTakePayment={noop}
        onCloseOrder={() => setPendingClose(true)}
        onEdit={noop}
        onConfirmWeights={noop}
        onEditCustomer={noop}
        onToggleForceProduction={noop}
        restaurantName={PREVIEW_RESTAURANT.name || ''}
        restaurantDefaultLocale="fr"
        customFieldLabels={PREVIEW_CUSTOM_FIELD_LABELS}
      />

      <ConfirmDialog
        open={pendingClose}
        onOpenChange={setPendingClose}
        title="Clôturer la commande"
        description="La commande sera marquée comme servie ou livrée."
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        onConfirm={() => setPendingClose(false)}
      />

      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title="Supprimer la commande"
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={() => setPendingDelete(false)}
      />
    </div>
  );
}
