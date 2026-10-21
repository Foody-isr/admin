"use client";
import Link from "next/link";
import { useState } from "react";
import {
  getSalesStock,
  setSalesStockAvailability,
  type SaleStockRow,
  type AvailabilityOverride,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { Button } from "@/components/ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StockHistory } from "./StockHistory";
export function ProductSalesStock({
  rid,
  date,
  row,
  onUpdate,
}: {
  rid: number;
  date: string;
  row: SaleStockRow;
  onUpdate: (row: SaleStockRow) => void;
}) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function change(value: AvailabilityOverride) {
    setBusy(true);
    setError(false);
    try {
      await setSalesStockAvailability(rid, date, row.item.id, value);
      const latest = await getSalesStock(rid, date, row.item.id);
      if (latest.rows[0]) onUpdate(latest.rows[0]);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border rounded-lg p-4">
      <h3 className="font-semibold">
        {t("saleStockSeries")} · {date}
      </h3>
      <p>
        {t("saleStockAvailable")}: {row.availability.buildable_count ?? "∞"} ·{" "}
        {t("saleStockCommitted")}:{" "}
        {row.config?.counters.reduce((sum, c) => sum + c.committed, 0) ?? 0}
      </p>
      <p className="text-sm text-[var(--fg-muted)]">
        {t("saleStockProductHint")}
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="input w-auto"
          aria-label={t("carteImmediateAvailability")}
          disabled={busy || !hasAnyPermission("menu.edit")}
          value={row.config?.override ?? "auto"}
          onChange={(e) => change(e.target.value as AvailabilityOverride)}
        >
          {(["auto", "force_available", "force_sold_out"] as const).map(
            (value) => (
              <option key={value} value={value}>
                {t(`saleStockOverride_${value}`)}
              </option>
            ),
          )}
        </select>
        <Link
          className="underline text-sm"
          href={`/${rid}/menu/stock?item_id=${row.item.id}`}
        >
          {t("saleStockFullHistory")}
        </Link>
        <Button variant="ghost" onClick={() => setHistory(true)}>
          {t("saleStockHistory")}
        </Button>
      </div>
      {error && <p role="alert">{t("saleStockError")}</p>}
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("saleStockHistory")}</DialogTitle>
            <DialogDescription>{t("saleStockHistoryHint")}</DialogDescription>
          </DialogHeader>
          <StockHistory rid={rid} itemId={row.item.id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
