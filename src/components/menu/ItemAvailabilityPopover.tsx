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
  type SaleStockRow,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AvailabilityPopover, type AvailabilityRuleSelection } from "./publication/AvailabilityPopover";

/** Loads fresh tenant stock on opening and reuses the carte's explicit editor. */
export function ItemAvailabilityPopover({
  rid,
  item,
  stockRow,
  canEdit,
  onChanged,
  date,
  stockSeriesKey,
  triggerLabel,
  compactTrigger,
  portalContainer,
  ruleSelection,
}: {
  rid: number;
  item: MenuItem;
  /** Stock already read for this item and the editor's scope. */
  stockRow?: SaleStockRow;
  canEdit: boolean;
  onChanged?: (row: SaleStockRow) => void | Promise<unknown>;
  date?: string;
  /** Explicit stock scope from the production plan, including persistent stock. */
  stockSeriesKey?: string;
  triggerLabel?: string;
  compactTrigger?: boolean;
  portalContainer?: HTMLElement | null;
  ruleSelection?: AvailabilityRuleSelection;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState(false);
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
      const expectedDate = stockSeriesKey ?? date;
      const requestedDate = initial ? expectedDate : snapshot?.overview.series_key ?? expectedDate;
      const [overview, config] = await Promise.all([
        getSalesStock(rid, requestedDate, item.id),
        getBatchFulfillmentConfig(rid),
      ]);
      if (!overview.rows.some((row) => row.item.id === item.id))
        throw new Error();
      const loadedStockScope = config.enabled ? overview.series_key : "";
      if (stockSeriesKey !== undefined && stockSeriesKey !== loadedStockScope)
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
  async function refresh() {
    const token = request.current;
    const overview = await getSalesStock(rid, snapshot?.overview.series_key ?? date ?? "", item.id);
    const row = overview.rows.find((row) => row.item.id === item.id);
    if (!row || (stockSeriesKey && overview.series_key !== stockSeriesKey)) throw new Error();
    if (token !== request.current) return;
    setSnapshot((current) => current ? { ...current, overview } : current);
    await onChanged?.(row);
    setRefreshError(false);
  }
  async function apply(
    override: AvailabilityOverride | undefined,
    remaining?: SaleStockLimit,
    ruleId?: number,
  ) {
    if (lock.current || loading || !snapshot || !canEdit) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const date = snapshot.overview.series_key;
      if (remaining) await restockSalesStock(rid, date, { ...remaining, availability_rule_id: ruleId });
      else await setSalesStockAvailability(rid, date, item.id, override, ruleId);
      if (ruleId !== undefined) ruleSelection?.onSaved(ruleId);
      // The write is confirmed. A failed read must never replay its stock change.
      try { await refresh(); } catch { setRefreshError(true); }
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
  ) : null) ?? stockRow ?? {
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
    <>
    <AvailabilityPopover
      row={row}
      triggerLabel={triggerLabel}
      compactTrigger={compactTrigger}
      portalContainer={portalContainer}
      ruleSelection={ruleSelection ? {...ruleSelection,value:row.item.availability_rule_id ?? 0} : undefined}
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
    {refreshError && <div role="alert" className="text-sm">
      <p>{t("itemStockSavedRefreshError")}</p>
      <button type="button" className="underline" disabled={busy} onClick={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true);
        try { await refresh(); } catch { setRefreshError(true); }
        finally { lock.current = false; setBusy(false); }
      }}>{t("retry")}</button>
    </div>}
    </>
  );
}
