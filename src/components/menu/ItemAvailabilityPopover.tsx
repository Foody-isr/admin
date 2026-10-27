"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  getBatchFulfillmentConfig,
  getSalesStock,
  restockSalesStock,
  setSalesStockAvailability,
  type AvailabilityOverride,
  type MenuItem,
  type SaleStockLimit,
  type SaleStockOverview,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AvailabilityPopover, type AvailabilityRuleSelection } from "./publication/AvailabilityPopover";

/** Loads fresh tenant stock on opening and reuses the carte's explicit editor. */
export function ItemAvailabilityPopover({
  rid,
  item,
  canEdit,
  onChanged,
  date,
  triggerLabel,
  ruleSelection,
}: {
  rid: number;
  item: MenuItem;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
  date?: string;
  triggerLabel?: string;
  ruleSelection?: AvailabilityRuleSelection;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<{
    overview: SaleStockOverview;
    series: boolean;
  } | null>(null);
  const request = useRef(0);
  const lock = useRef(false);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function reload(initial = false) {
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [overview, config] = await Promise.all([
        getSalesStock(
          rid,
          initial ? (date ?? "") : (snapshot?.overview.series_key ?? date ?? ""),
          item.id,
        ),
        getBatchFulfillmentConfig(rid),
      ]);
      if (!overview.rows.some((row) => row.item.id === item.id))
        throw new Error();
      if (token !== request.current) return;
      setSnapshot({ overview, series: config.enabled });
    } catch {
      if (token === request.current) setError(t("saleStockError"));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  function changeOpen(value: boolean) {
    if (lock.current) return;
    request.current++;
    setOpen(value);
    if (value) setSnapshot(null);
    setError("");
    if (value) void reload(true);
  }
  async function apply(
    override: AvailabilityOverride,
    remaining?: SaleStockLimit,
  ) {
    if (lock.current || loading || !snapshot || !canEdit) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const date = snapshot.overview.series_key;
      if (remaining) await restockSalesStock(rid, date, remaining);
      else await setSalesStockAvailability(rid, date, item.id, override);
      const overview = await getSalesStock(rid, date, item.id);
      if (!overview.rows.some((row) => row.item.id === item.id))
        throw new Error();
      setSnapshot({ ...snapshot, overview });
      await onChanged();
      return true;
    } catch (error) {
      setError(t(error instanceof ApiError && error.message === "stock_conversion_unavailable" ? "itemStockConversionError" : "carteConflict"));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const row = (open ? snapshot?.overview.rows.find(
    (row) => row.item.id === item.id,
  ) : null) ?? {
    item,
    managed: false,
    config: null,
    previous: null,
    sizes: [],
    availability: {
      availability_state: item.availability_state ?? "available",
      buildable_count: null,
    },
  };
  return (
    <AvailabilityPopover
      row={row}
      triggerLabel={triggerLabel}
      ruleSelection={ruleSelection}
      series={snapshot?.series ?? false}
      open={open}
      canEdit={canEdit}
      ready={!!snapshot}
      loading={loading}
      busy={busy || (!!snapshot && loading)}
      error={error}
      contextLabel={
        snapshot?.series
          ? `${t("saleStockSeries")} · ${snapshot.overview.series_key}`
          : undefined
      }
      onOpenChange={changeOpen}
      onReload={() => reload()}
      onApply={apply}
    />
  );
}
