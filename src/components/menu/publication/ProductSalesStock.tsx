"use client";
import Link from "next/link";
import { useState } from "react";
import {
  getSalesStock,
  type SaleStockRow,
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
import { ItemAvailabilityPopover } from "@/components/menu/ItemAvailabilityPopover";
import { StockHistory } from "./StockHistory";
/** Shows the series allowance and its explicit remaining-stock editor. */
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
  const measured = row.config?.mode === "measure";
  const counter = row.config?.counters.find((value) => value.option_id === 0);
  const unit = measured ? (row.config?.unit === "kg" ? "g" : row.config?.unit === "l" ? "ml" : row.config?.unit) : "";
  const available = measured && counter
    ? counter.initial_quantity == null ? "∞" : Math.max(0, counter.initial_quantity - counter.committed)
    : row.availability.buildable_count ?? "∞";
  return (
    <div className="space-y-3 border rounded-lg p-4">
      <h3 className="font-semibold">
        {t("saleStockSeries")} · {date}
      </h3>
      <p>
        {t("saleStockAvailable")}: {available} {unit} ·{" "}
        {t("saleStockCommitted")}:{" "}
        {row.config?.counters.reduce((sum, c) => sum + c.committed, 0) ?? 0} {unit}
      </p>
      {row.config?.mode === "per_variant" && <ul className="space-y-1 text-sm">
        {row.sizes.map((size) => {
          const value = row.config?.counters.find((counter) => counter.option_id === size.id);
          return <li key={size.id}>{size.name} · {t("saleStockAvailable")}: {value?.initial_quantity == null ? "∞" : Math.max(0, value.initial_quantity - value.committed)} · {t("saleStockCommitted")}: {value?.committed ?? 0}</li>;
        })}
      </ul>}
      <p className="text-sm text-[var(--fg-muted)]">
        {t("saleStockProductHint")}
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <ItemAvailabilityPopover
          key={`${rid}:${date}:${row.item.id}`}
          rid={rid}
          date={date}
          item={row.item}
          canEdit={hasAnyPermission("menu.edit")}
          triggerLabel={t("itemStockEdit")}
          onChanged={async () => {
            const latest = await getSalesStock(rid, date, row.item.id);
            const current = latest.rows.find((value) => value.item.id === row.item.id);
            if (!current) throw new Error("Missing refreshed stock");
            onUpdate(current);
          }}
        />
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
