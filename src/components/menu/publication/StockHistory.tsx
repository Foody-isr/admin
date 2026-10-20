"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { orderDetailPath } from "@/lib/orders/routes";
import { getSalesStockHistory, type SaleStockEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ds";

export function StockHistory({
  rid,
  itemId,
  date,
}: {
  rid: number;
  itemId?: number;
  date?: string;
}) {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState<SaleStockEvent[]>([]);
  const [next, setNext] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(false);
    setEvents([]);
    setNext(0);
    getSalesStockHistory(rid, { itemId, date, kind })
      .then((data) => {
        if (active) {
          setEvents(data.events);
          setNext(data.next_cursor);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [rid, itemId, date, kind]);
  async function more() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const data = await getSalesStockHistory(rid, {
        itemId,
        date,
        kind,
        before: next,
      });
      setEvents((prev) => [...prev, ...data.events]);
      setNext(data.next_cursor);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-label={t("saleStockHistory")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("saleStockHistory")}</h2>
        <select
          className="input w-auto"
          aria-label={t("saleStockMovement")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{t("saleStockAllMovements")}</option>
          {[
            "quantity_changed",
            "series_initialized",
            "reservation",
            "reservation_released",
            "availability_changed",
            "baseline_imported",
          ].map((value) => (
            <option key={value} value={value}>
              {t(`stockEvent_${value}`)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-[var(--fg-muted)]">
        {t("saleStockHistoryHint")}
      </p>
      {error && (
        <p role="alert" className="text-red-600">
          {t("saleStockError")}
        </p>
      )}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-start">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              {[
                "saleStockDate",
                "item",
                "saleStockMovement",
                "saleStockBeforeAfter",
                "saleStockActor",
              ].map((k) => (
                <th className="p-3 text-start font-medium" key={k}>
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr className="border-t" key={event.id}>
                <td className="p-3 whitespace-nowrap">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(event.created_at))}
                  {event.series_key && (
                    <div className="text-xs text-[var(--fg-muted)]">
                      {event.series_key}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <Link
                    className="underline"
                    href={`/${rid}/menu/items/${event.menu_item_id}`}
                  >
                    {event.item_name}
                  </Link>
                  {event.option_name && <div>{event.option_name}</div>}
                </td>
                <td className="p-3">
                  {t(`stockEvent_${event.kind}`)}
                  {event.order_id && (
                    <div>
                      <Link
                        className="underline"
                        href={orderDetailPath(rid, event.order_id)}
                      >
                        {t("saleStockOrder")} #{event.order_id}
                      </Link>
                    </div>
                  )}
                  {event.previous_override !== event.override &&
                    event.override && (
                      <div className="text-xs">
                        {t(
                          `saleStockOverride_${event.previous_override || "auto"}`,
                        )}{" "}
                        → {t(`saleStockOverride_${event.override}`)}
                      </div>
                    )}
                </td>
                <td className="p-3 tabular-nums" dir="ltr">
                  {event.before_quantity ?? "∞"} → {event.after_quantity ?? "∞"}
                  {event.delta !== 0 && (
                    <span className="ms-2 text-[var(--fg-muted)]">
                      ({event.delta > 0 ? "+" : ""}
                      {event.delta})
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {event.actor_name || t("saleStockSystem")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length && !busy && (
          <p className="p-6 text-sm text-[var(--fg-muted)]">
            {t("saleStockNoHistory")}
          </p>
        )}
      </div>
      {busy && <p role="status">{t("loading")}</p>}
      {next > 0 && (
        <Button variant="secondary" disabled={busy} onClick={more}>
          {t("saleStockMore")}
        </Button>
      )}
    </section>
  );
}
