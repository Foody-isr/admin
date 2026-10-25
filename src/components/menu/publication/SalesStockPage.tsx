"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { listAllItems, type MenuItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, PageHead, Select } from "@/components/ds";
import { StockHistory } from "./StockHistory";

/** Read-only restaurant sale-stock journal, also reachable for a single item. */
export default function SalesStockPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const params = useSearchParams();
  const itemId = Number(params.get("item_id")) || undefined;
  return <Content key={`${rid}.${itemId}`} rid={rid} initialItemId={itemId} />;
}

function Content({ rid, initialItemId }: { rid: number; initialItemId?: number }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemId, setItemId] = useState(initialItemId);
  const [date, setDate] = useState("");
  const [itemsError, setItemsError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setItemsError(false);
    listAllItems(rid)
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => {
        if (active) setItemsError(true);
      });
    return () => {
      active = false;
    };
  }, [rid, revision]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8" data-sales-stock-history>
      <PageHead
        title={t("saleStockTitle")}
        desc={t("saleStockOverviewHint")}
        actions={
          <Link className="underline" href={`/${rid}/menu/menus`}>
            {t("menus")}
          </Link>
        }
      />
      {itemsError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{t("saleStockItemsError")}</span>
          <Button variant="ghost" onClick={() => setRevision((value) => value + 1)}>
            {t("retry")}
          </Button>
        </div>
      )}
      <StockHistory
        rid={rid}
        itemId={itemId}
        date={date || undefined}
        filters={
          <>
            <Field label={t("item")}>
              <Select value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value) || undefined)}>
                <option value="">{t("allItems")}</option>
                {itemId && !items.some((item) => item.id === itemId) && (
                  <option value={itemId}>#{itemId}</option>
                )}
                {[...items].sort((a, b) => a.name.localeCompare(b.name, locale)).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("saleStockSeries")} hint={
              date ? <button type="button" className="underline" onClick={() => setDate("")}>{t("saleStockAllSeries")}</button> : t("saleStockAllSeries")
            }>
              <Input type="date" aria-label={t("saleStockSeries")} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </>
        }
      />
    </div>
  );
}
