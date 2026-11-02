"use client";
import { useState } from "react";
import { useI18n, useCurrency } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { eventOrderCopy } from "@/lib/orders/event-order-copy";
import {
  collectOrderBalance,
  reconcileEventPayment,
  reconcileEventHold,
  type Order,
} from "@/lib/api";
import { lifecycleCollectionAllowed } from "@/lib/orders/status-presentation";
import { Button } from "@/components/ds";

/** Shows saved event information and explicit read-only payment recovery. */
export function EventOrderSummary({ order }: { order: Order }) {
  const { locale, t } = useI18n();
  const { money } = useCurrency();
  const { hasAnyPermission } = usePermissions();
  const c = eventOrderCopy[locale];
  const [transaction, setTransaction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [holdResult, setHoldResult] = useState("");
  const [balanceLink, setBalanceLink] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const event = order.event_config;
  if (!event) return null;
  const paid = Number(
    order.external_metadata?.paid_amount ??
      (order.payment_status === "paid" ? order.total_amount : 0),
  );
  const canCollect =
    hasAnyPermission("payments.manage") &&
    lifecycleCollectionAllowed(order) &&
    !!event.finalized_at &&
    ["unpaid", "partially_paid", "paid"].includes(order.payment_status) && !event.hold &&
    !["cancelled", "rejected", "refunded"].includes(order.status) &&
    order.total_amount - paid > 0.01;
  return (
    <section className="mb-4 space-y-3 rounded border border-[var(--line)] p-4">
      <h2 className="text-fs-sm font-semibold">{c.information}</h2>
      <dl className="grid grid-cols-1 gap-2 text-fs-xs sm:grid-cols-2">
        {(
          [
            "name",
            "guests",
            "event_date",
            "event_time",
            "venue",
            "contact",
            "notes",
          ] as const
        ).map((key) =>
          event[key] ? (
            <div key={key}>
              <dt className="text-[var(--fg-muted)]">{c[key]}</dt>
              <dd className="whitespace-pre-wrap">{event[key]}</dd>
            </div>
          ) : null,
        )}
        <div>
          <dt>{c.remaining}</dt>
          <dd>{money(Math.max(0, order.total_amount - paid))}</dd>
        </div>
        {event.balance_due_date && (
          <div>
            <dt>{c.balanceDue}</dt>
            <dd>{event.balance_due_date}</dd>
          </div>
        )}
      </dl>
      {(event.payment_mode==='hold'||event.payment_mode==='deposit_hold')&&<div className="space-y-2 border-t border-[var(--line)] pt-3">
        <p className="font-medium">{event.hold?.status==='verified'?c.holdConfirmed:c.holdPending}{event.hold?` · ${new Intl.NumberFormat(locale,{style:'currency',currency:event.hold.currency}).format(event.hold.amount_minor/100)}`:''}</p>
        {event.hold?.transaction_id&&<p className="text-fs-xs">Sumit #{event.hold.transaction_id}</p>}
        {event.hold?.reference&&<p className="break-all font-mono text-fs-xs">{event.hold.reference}</p>}
        {event.hold?.verified_at&&<p className="text-fs-xs text-[var(--fg-muted)]">{new Date(event.hold.verified_at).toLocaleString(locale)}</p>}
        <p className="text-fs-xs text-[var(--fg-muted)]">{c.holdHint}</p>
        {hasAnyPermission('payments.manage')&&<><a className="inline-block text-fs-xs underline" href="https://app.sumit.co.il/" target="_blank" rel="noopener noreferrer">{c.manageHold}</a><Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);setHoldResult('');try{await reconcileEventHold(order.restaurant_id,order.id);setHoldResult(c.holdVerified);}catch{setHoldResult(c.holdVerifyError);}finally{setBusy(false);}}}>{c.verifyHold}</Button></>}
        {holdResult&&<p role="status" className="text-fs-xs">{holdResult}</p>}
      </div>}
      {canCollect && (
        <div className="space-y-2">
          <Button
            disabled={busy}
            variant="secondary"
            onClick={async () => {
              setBusy(true);
              setBalanceError("");
              try {
                const response = await collectOrderBalance(
                  order.restaurant_id,
                  order.id,
                );
                if (!response.payment_url) throw new Error(t("noPaymentUrl"));
                setBalanceLink(response.payment_url);
              } catch (error) {
                setBalanceError(
                  error instanceof Error ? error.message : t("noPaymentUrl"),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("loading") : t("generateBalanceLink")}
          </Button>
          {balanceLink && (
            <input
              className="input w-full"
              aria-label={t("paymentLink")}
              readOnly
              value={balanceLink}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          {balanceError && (
            <p role="alert" className="text-fs-xs">
              {balanceError}
            </p>
          )}
        </div>
      )}
      {((event.payment_mode !== "none" && event.payment_mode !== "hold") ||
        !!balanceLink ||
        (event.payment_mode !== "hold" && !!order.external_metadata?.internal_checkout)) &&
        order.payment_status !== "paid" &&
        hasAnyPermission("payments.manage") && (
          <details>
            <summary className="cursor-pointer text-fs-xs">
              {c.verifyTitle}
            </summary>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-fs-xs">
                {c.transaction}
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={30}
                  value={transaction}
                  onChange={(e) => setTransaction(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !/^\d+$/.test(transaction)}
                onClick={async () => {
                  setBusy(true);
                  setResult("");
                  try {
                    await reconcileEventPayment(
                      order.restaurant_id,
                      order.id,
                      transaction,
                    );
                    setResult(c.verified);
                  } catch {
                    setResult(c.verifyError);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {c.verify}
              </Button>
              <p role="status" className="w-full text-fs-xs">
                {result}
              </p>
            </div>
          </details>
        )}
    </section>
  );
}
