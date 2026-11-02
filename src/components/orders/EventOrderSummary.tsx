"use client";
import { useState } from "react";
import { useI18n, useCurrency } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { eventOrderCopy } from "@/lib/orders/event-order-copy";
import {
  collectOrderBalance,
  reconcileEventPayment,
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
    ["unpaid", "partially_paid"].includes(order.payment_status) &&
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
      {(event.payment_mode !== "none" ||
        !!balanceLink ||
        !!order.external_metadata?.internal_checkout) &&
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
