'use client';

// The money column: the ledger, the payment state, and every warning that says
// the two disagree. Moved verbatim from OrderDetailDrawer.tsx (809-1076).
//
// One change on the way over: the pay-link and balance-link state moved in here
// with the JSX that uses it. Both are derived from the order alone and were
// eight useState hooks sitting in a component that never read them, so the
// modal is that much thinner and nothing else can touch them.
//
// The amount leads like the top of a receipt, while the ledger and exceptional
// payment states stay directly underneath. It also surfaces hold_amount /
// captured_amount, which the payload carries and nothing else renders.

import { useEffect, useState } from 'react';
import {
  AlertTriangleIcon, CheckIcon, CopyIcon, LinkIcon, MessageCircleIcon, ReceiptTextIcon, RotateCcwIcon,
} from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import { Money } from '../primitives/Money';
import { CashTag } from '@/components/orders/CashTag';
import { initOrderPaymentLink, collectOrderBalance, type Order } from '@/lib/api';
import { formatMoney } from '@/lib/format-money';
import { PAYMENT_TONE } from '@/lib/orders/status-presentation';
import { paymentReference } from '@/lib/orders/payment';

// Order.external_metadata keys the server writes when a paid order is edited
// after payment. Must stay in sync with foodyserver internal/common/models.go
// (MetaKeyEditedAfterPayment / MetaKeyPaidAmount / MetaKeyStockOversold).
const ORDER_META_EDITED_AFTER_PAYMENT = 'edited_after_payment';
const ORDER_META_PAID_AMOUNT = 'paid_amount';
const ORDER_META_STOCK_OVERSOLD = 'stock_oversold';

export function MoneyPanel({
  order,
  isCancelled,
  subtotal,
  discountAmount,
  deliveryFee,
  totalsLine,
  t,
}: {
  order: Order;
  /** Dead orders keep their financial record, but expose no new collection action. */
  isCancelled: boolean;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  totalsLine: number;
  t: (k: string) => string;
}) {
  // Payment link, for orders awaiting online payment. Regenerated on demand
  // rather than stored, so staff can re-share it any time.
  const [payLink, setPayLink] = useState<string | null>(null);
  const [payLinkLoading, setPayLinkLoading] = useState(false);
  const [payLinkError, setPayLinkError] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);

  // Balance link, for paid orders whose items were edited afterwards, leaving
  // an uncollected balance. Mirrors the pay-link pattern above.
  const [balanceLink, setBalanceLink] = useState<string | null>(null);
  const [balanceLinkLoading, setBalanceLinkLoading] = useState(false);
  const [balanceLinkError, setBalanceLinkError] = useState<string | null>(null);
  const [balanceLinkCopied, setBalanceLinkCopied] = useState(false);

  // Reset whenever a different order is shown.
  useEffect(() => {
    setPayLink(null);
    setPayLinkError(null);
    setPayLinkCopied(false);
    setBalanceLink(null);
    setBalanceLinkError(null);
    setBalanceLinkCopied(false);
  }, [order.id]);

  const fetchPayLink = async () => {
    setPayLinkLoading(true);
    setPayLinkError(null);
    try {
      const res = await initOrderPaymentLink(order.restaurant_id, order.id);
      if (res.payment_url) setPayLink(res.payment_url);
      else setPayLinkError(t('noPaymentUrl') || 'No payment link available');
    } catch (err) {
      setPayLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setPayLinkLoading(false);
    }
  };

  const copyPayLink = async () => {
    if (!payLink) return;
    try {
      await navigator.clipboard.writeText(payLink);
      setPayLinkCopied(true);
      setTimeout(() => setPayLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays visible for manual copy */
    }
  };

  const generateBalanceLink = async () => {
    setBalanceLinkLoading(true);
    setBalanceLinkError(null);
    try {
      const res = await collectOrderBalance(order.restaurant_id, order.id);
      if (res.payment_url) setBalanceLink(res.payment_url);
      else setBalanceLinkError(t('noPaymentUrl') || 'No payment link available');
    } catch (err) {
      setBalanceLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBalanceLinkLoading(false);
    }
  };

  const copyBalanceLink = async () => {
    if (!balanceLink) return;
    try {
      await navigator.clipboard.writeText(balanceLink);
      setBalanceLinkCopied(true);
      setTimeout(() => setBalanceLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const digits = (order.customer_phone || '').replace(/\D/g, '');
  const payLinkWhatsApp = payLink
    ? `https://wa.me/${digits}?text=${encodeURIComponent(`${t('paymentLinkHint')} ${payLink}`)}`
    : '';
  const balanceLinkWhatsApp = balanceLink
    ? `https://wa.me/${digits}?text=${encodeURIComponent(`${t('paymentLinkHint')} ${balanceLink}`)}`
    : '';

  // The server flags an order whose items changed after the customer had
  // already paid, snapshotting the amount actually charged. Surface the
  // uncollected — or over-collected — difference; there is no automatic
  // re-charge.
  const meta = (order.external_metadata ?? {}) as Record<string, unknown>;
  const editedAfterPayment = meta[ORDER_META_EDITED_AFTER_PAYMENT] === true;
  const stockOversold = meta[ORDER_META_STOCK_OVERSOLD] === true;
  const chargedAmount = Number(meta[ORDER_META_PAID_AMOUNT]);
  const hasChargedAmount = editedAfterPayment && Number.isFinite(chargedAmount);
  const paymentDrift = hasChargedAmount ? totalsLine - chargedAmount : 0;
  // A provider session can remain `pending` in the stored payment record after
  // the order itself was cancelled. Staff cannot collect it anymore, so the
  // summary says "unpaid" instead of presenting a live pending state.
  const displayedPaymentStatus = isCancelled && order.payment_status === 'pending'
    ? 'unpaid'
    : order.payment_status;

  return (
    <section
      aria-labelledby={`order-${order.id}-payment-summary`}
      className="overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface)]"
    >
      <div className="order-detail-money-head border-b border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)]">
        <div className="flex items-start justify-between gap-[var(--s-4)]">
          <div className="min-w-0">
            <span
              id={`order-${order.id}-payment-summary`}
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-muted)]"
            >
              <ReceiptTextIcon className="size-3.5" />
              {t('total') || 'Total'}
            </span>
            <div className="mt-1">
              <Money
                value={totalsLine}
                className="text-[28px] leading-[32px] font-bold tracking-[-0.02em]"
              />
            </div>
          </div>
          <Badge tone={PAYMENT_TONE[displayedPaymentStatus] ?? 'neutral'} dot className="mt-0.5">
            {(() => {
              const tv = t(displayedPaymentStatus);
              return tv === displayedPaymentStatus ? displayedPaymentStatus : tv;
            })()}
          </Badge>
        </div>
        <CashTag order={order} variant="full" className="mt-[var(--s-2)] bg-[var(--surface)]" />
      </div>

      <div className="order-detail-money-body flex flex-col gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] text-fs-sm">
          {/*
            The ledger. A two-column baseline grid rather than a stack of
            flex rows, so every figure lands on one axis and the decimal
            points line up down the column.
          */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[var(--s-3)] gap-y-[var(--s-2)] items-baseline">
            <span className="text-[var(--fg-subtle)]">{t('subtotal') || 'Sous-total'}</span>
            <Money value={subtotal} className="text-end" />

            {discountAmount > 0 && (
              <>
                <span className="text-[var(--fg-subtle)]">
                  {t('discountLine')}
                  {order.discount?.code
                    ? ` (${order.discount.code})`
                    : order.discount?.reason
                      ? ` · ${order.discount.reason}`
                      : ` ${t('manualDiscount')}`}
                </span>
                <Money value={-discountAmount} className="text-end" />
              </>
            )}

            {deliveryFee > 0 && (
              <>
                <span className="text-[var(--fg-subtle)]">
                  {t('delivery_fee') || 'Frais de livraison'}
                </span>
                <Money value={deliveryFee} className="text-end" />
              </>
            )}

            {/* By-weight settlement. Both figures ride on every held order and
                neither was rendered anywhere, so an order totalling ₪187.40
                against a ₪220 authorisation said nothing about the gap. */}
            {(order.hold_amount ?? 0) > 0 && (
              <>
                <span className="text-[var(--fg-subtle)]">{t('holdAmount')}</span>
                <Money value={order.hold_amount} className="text-end text-[var(--fg-muted)]" />
              </>
            )}
            {(order.captured_amount ?? 0) > 0 && (
              <>
                <span className="text-[var(--fg-subtle)]">{t('capturedAmount')}</span>
                <Money value={order.captured_amount} className="text-end text-[var(--fg-muted)]" />
              </>
            )}

          </div>

          {/* Reference for a payment taken outside Foody (card slip, provider
              invoice number). Shown as recorded, verbatim: it is the only
              handle staff have to reconcile the order against the
              provider's own books.
              Hidden once the provider confirmed it and it became the order's
              document_number — the Invoice card below then states it, with a
              PDF next to it, and repeating the bare number here would read as
              a second, lesser copy. */}
          {paymentReference(order)
            && paymentReference(order) !== String(order.external_metadata?.document_number ?? '') && (
            <div className="flex items-center justify-between gap-2 mt-[var(--s-2)] text-fs-xs">
              <span className="text-[var(--fg-subtle)]">{t('paymentReference')}</span>
              <span className="font-mono truncate">{paymentReference(order)}</span>
            </div>
          )}

          {/* Stock oversell warning — a late payment revived this order after
              its predefined stock was already taken, or a staff edit drew past
              the count. The sale is honored; staff must reconcile the physical
              stock. */}
          {stockOversold && (
            <div
              className="mt-[var(--s-2)] flex items-start gap-[var(--s-3)] rounded-md p-[var(--s-3)]"
              style={{
                background: 'color-mix(in oklab, var(--warning-500) 10%, var(--surface))',
                border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))',
              }}
            >
              <AlertTriangleIcon
                className="size-4 shrink-0 mt-0.5"
                style={{ color: 'var(--warning-500)' }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-[var(--s-2)]">
                <span className="text-fs-sm font-semibold text-[var(--fg)]">
                  {t('stockOversoldTitle')}
                </span>
                <span className="text-fs-xs text-[var(--fg-muted)]">
                  {t('stockOversoldDesc')}
                </span>
              </div>
            </div>
          )}

          {/* Post-payment edit warning — the order's items were changed after
              the customer paid, so the collected amount no longer matches. */}
          {editedAfterPayment && (
            <div
              className="mt-[var(--s-2)] flex items-start gap-[var(--s-3)] rounded-md p-[var(--s-3)]"
              style={{
                background: 'color-mix(in oklab, var(--warning-500) 10%, var(--surface))',
                border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))',
              }}
            >
              <AlertTriangleIcon
                className="size-4 shrink-0 mt-0.5"
                style={{ color: 'var(--warning-500)' }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-[var(--s-2)]">
                <span className="text-fs-sm font-semibold text-[var(--fg)]">
                  {t('editedAfterPaymentTitle')}
                </span>
                <span className="text-fs-xs text-[var(--fg-muted)]">
                  {t('editedAfterPaymentDesc')}
                </span>
                {hasChargedAmount && (
                  <div className="flex flex-col gap-1 text-fs-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--fg-subtle)]">
                        {t('editedAfterPaymentCharged')}
                      </span>
                      <span className="font-mono tabular-nums">{formatMoney(chargedAmount)}</span>
                    </div>
                    {paymentDrift > 0.005 && (
                      <div
                        className="flex items-center justify-between font-semibold"
                        style={{ color: 'var(--warning-500)' }}
                      >
                        <span>{t('editedAfterPaymentToCollect')}</span>
                        <span className="font-mono tabular-nums">{formatMoney(paymentDrift)}</span>
                      </div>
                    )}
                    {paymentDrift < -0.005 && (
                      <div
                        className="flex items-center justify-between font-semibold"
                        style={{ color: 'var(--warning-500)' }}
                      >
                        <span>{t('editedAfterPaymentToRefund')}</span>
                        <span className="font-mono tabular-nums">
                          {formatMoney(Math.abs(paymentDrift))}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Balance-due action block — shown when the server has computed
                    an explicit balance_due amount (items added after payment that
                    haven't been billed yet). Lets staff generate + share a top-up
                    payment link without leaving the drawer. */}
                {(order.balance_due ?? 0) > 0 && (() => {
                  const unpaidCount = (order.items ?? []).filter((i) => i.billed_at == null).length;
                  return (
                    <div
                      className="mt-[var(--s-1)] flex flex-col gap-[var(--s-2)] rounded-md p-[var(--s-3)]"
                      style={{
                        background: 'color-mix(in oklab, var(--warning-500) 6%, var(--surface))',
                        border: '1px solid color-mix(in oklab, var(--warning-500) 22%, var(--line))',
                      }}
                    >
                      {/* Amount pill — the balance due, prominent but not alarming */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-fs-xs font-medium text-[var(--fg-subtle)] uppercase tracking-[.05em]">
                          {t('balanceToCollect')}
                        </span>
                        <span
                          className="font-mono tabular-nums font-semibold text-fs-sm px-2 py-0.5 rounded-full"
                          style={{
                            background: 'color-mix(in oklab, var(--warning-500) 14%, transparent)',
                            color: 'var(--warning-600)',
                          }}
                        >
                          {formatMoney(order.balance_due)}
                        </span>
                      </div>
                      {unpaidCount > 0 && (
                        <span className="text-fs-xs text-[var(--fg-subtle)]">
                          {t('balanceItemsUnpaid').replace('{n}', String(unpaidCount))}
                        </span>
                      )}

                      {balanceLink ? (
                        <>
                          <div className="flex items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)]">
                            <span className="flex-1 truncate font-mono text-fs-xs">{balanceLink}</span>
                            <Button variant="secondary" size="sm" onClick={copyBalanceLink}>
                              {balanceLinkCopied ? <CheckIcon /> : <CopyIcon />}
                              {balanceLinkCopied ? t('copied') : t('copyLink')}
                            </Button>
                          </div>
                          {(order.customer_phone || '').replace(/\D/g, '') && (
                            <a
                              href={balanceLinkWhatsApp}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
                            >
                              <MessageCircleIcon className="size-3.5" /> {t('shareWhatsApp')}
                            </a>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-fs-xs text-[var(--fg-muted)] italic">
                              {t('awaitingBalancePayment')}
                            </span>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={generateBalanceLink}
                              disabled={balanceLinkLoading}
                            >
                              <RotateCcwIcon className="size-3" />
                              {balanceLinkLoading ? `${t('loading')}…` : t('regenerateBalanceLink')}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={generateBalanceLink}
                          disabled={balanceLinkLoading}
                          style={{
                            borderColor: 'color-mix(in oklab, var(--warning-500) 40%, var(--line-strong))',
                            color: 'var(--warning-700)',
                          }}
                        >
                          <LinkIcon className="size-3.5" />
                          {balanceLinkLoading ? `${t('loading')}…` : t('generateBalanceLink')}
                        </Button>
                      )}
                      {balanceLinkError && (
                        <span className="text-fs-xs text-[var(--danger-500)]">{balanceLinkError}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Payment link — for orders awaiting online payment. Lets staff
              re-fetch and re-share the link any time. */}
          {!isCancelled && order.payment_status === 'pending' && (
            <div className="mt-[var(--s-2)] flex flex-col gap-[var(--s-2)] border-t border-[var(--line)] pt-[var(--s-3)]">
              <span className="flex items-center gap-1.5 text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
                <LinkIcon className="size-3.5" /> {t('paymentLink')}
              </span>
              {payLink ? (
                <>
                  <div className="flex items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)]">
                    <span className="flex-1 truncate font-mono text-fs-xs">{payLink}</span>
                    <Button variant="secondary" size="sm" onClick={copyPayLink}>
                      {payLinkCopied ? <CheckIcon /> : <CopyIcon />}
                      {payLinkCopied ? t('copied') : t('copyLink')}
                    </Button>
                  </div>
                  {(order.customer_phone || '').replace(/\D/g, '') && (
                    <a
                      href={payLinkWhatsApp}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
                    >
                      <MessageCircleIcon className="size-3.5" /> {t('shareWhatsApp')}
                    </a>
                  )}
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchPayLink}
                  disabled={payLinkLoading}
                  className="w-full justify-center"
                >
                  <LinkIcon />
                  {payLinkLoading ? `${t('loading')}…` : t('getPaymentLink')}
                </Button>
              )}
              {payLinkError && <span className="text-fs-xs text-[var(--danger-500)]">{payLinkError}</span>}
            </div>
          )}
        </div>
    </section>
  );
}
