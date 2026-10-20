"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  getSalesStock,
  getBatchFulfillmentConfig,
  setSalesStock,
  type SaleStockOverview,
  type SaleStockLimit,
  type BatchFulfillmentConfigResponse,
} from "@/lib/api";
import { stockErrors } from "@/lib/carte-editor";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import { PageHead, Button } from "@/components/ds";
import { StockHistory } from "./StockHistory";
import { StockPreparation } from "./StockPreparation";
import { BatchPicker } from "@/components/menu/BatchPicker";
import ItemUnsavedDialog from "@/components/menu-item/ItemUnsavedDialog";
import { useItemLeaveGuard } from "@/components/menu-item/useItemLeaveGuard";

export default function SalesStockPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const params = useSearchParams();
  const itemId = Number(params.get("item_id")) || undefined;
  return <Content key={`${rid}.${itemId}`} rid={rid} itemId={itemId} />;
}
function Content({ rid, itemId }: { rid: number; itemId?: number }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission("menu.edit");
  const [data, setData] = useState<SaleStockOverview | null>(null);
  const [config, setConfig] = useState<BatchFulfillmentConfigResponse | null>(
    null,
  );
  const [index, setIndex] = useState(0);
  const [date, setDate] = useState("");
  const [allHistory, setAllHistory] = useState(true);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [limits, setLimits] = useState<SaleStockLimit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = useRef(false);
  const guard = useItemLeaveGuard(
    () => limits.length > 0,
    () => gate.current,
  );
  const load = useCallback(async () => {
    const [overview, batch] = await Promise.all([
      getSalesStock(rid, date, itemId),
      getBatchFulfillmentConfig(rid),
    ]);
    setData(overview);
    setConfig(batch);
  }, [rid, date, itemId]);
  useEffect(() => {
    let active = true;
    getSalesStock(rid, date, itemId)
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError(t("saleStockError"));
      });
    return () => {
      active = false;
    };
  }, [rid, date, itemId, t]);
  useEffect(() => {
    getBatchFulfillmentConfig(rid)
      .then(setConfig)
      .catch(() => setError(t("saleStockError")));
  }, [rid, t]);
  const invalid = limits.some((limit) => {
    const row = data?.rows.find((r) => r.item.id === limit.menu_item_id);
    return !row || stockErrors(limit, row);
  });
  async function save() {
    if (!canEdit || gate.current || invalid || !data) return false;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      // Each correction is independent and journaled. Remove completed rows as we go
      // so a subsequent conflict never replays an already applied correction.
      for (const limit of limits) {
        await setSalesStock(rid, data.series_key, limit);
        setLimits((prev) =>
          prev.filter((l) => l.menu_item_id !== limit.menu_item_id),
        );
      }
      await load();
      setHistoryRevision((value) => value + 1);
      return true;
    } catch {
      setError(t("carteConflict"));
      await load().catch(() => {});
      return false;
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <PageHead
        title={t("saleStockTitle")}
        desc={t("saleStockOverviewHint")}
        actions={
          <Link className="underline" href={`/${rid}/menu/menus`}>
            {t("menus")}
          </Link>
        }
      />
      {config && config.upcoming_cycles.length > 0 && (
        <BatchPicker
          cycles={config.upcoming_cycles}
          selectedIndex={index}
          onChange={(next) =>
            guard.requestAction(() => {
              setLimits([]);
              setIndex(next);
              setDate(
                config.upcoming_cycles[next]?.fulfillment_days?.[0]?.date ?? "",
              );
            })
          }
        />
      )}
      {data && (
        <p className="text-sm font-medium">
          {t("saleStockSeries")}: {data.series_key}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {data ? (
        <>
          {data.rows
            .filter((row) => !row.managed)
            .map((row) => (
              <div
                key={row.item.id}
                className="border-b py-3 flex justify-between gap-3"
              >
                <span>
                  {row.item.name} · {t("saleStockAvailable")}:{" "}
                  {row.availability.buildable_count ?? "∞"}
                </span>
                <Link
                  className="underline"
                  href={`/${rid}/menu/items/${row.item.id}`}
                >
                  {t("saleStockManage")}
                </Link>
              </div>
            ))}
          <StockPreparation
            rows={data.rows.filter((row) => row.managed)}
            limits={limits}
            onChange={setLimits}
            disabled={!canEdit || busy}
          />
          {limits.length > 0 && (
            <div className="flex flex-wrap gap-3 items-center">
              <Button disabled={busy || invalid || !canEdit} onClick={save}>
                {t("saleStockApplyCorrections")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setLimits([])}
              >
                {t("cancel")}
              </Button>
              <span className="text-sm text-[var(--fg-muted)]">
                {t("saleStockImmediateHint")}
              </span>
            </div>
          )}
        </>
      ) : (
        <p>{t("loading")}</p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allHistory}
          onChange={(e) => setAllHistory(e.target.checked)}
        />
        {t("saleStockAllSeries")}
      </label>
      <StockHistory
        key={`${date}.${itemId}.${historyRevision}`}
        rid={rid}
        itemId={itemId}
        date={allHistory ? undefined : date || data?.series_key}
      />
      <ItemUnsavedDialog
        open={guard.open}
        onCancel={guard.cancel}
        onDiscard={() => {
          setLimits([]);
          guard.finish(`/${rid}/menu/stock`);
        }}
        onSave={async () => {
          if (await save()) guard.finish(`/${rid}/menu/stock`);
        }}
        saving={busy}
        saveDisabled={invalid || !canEdit}
        error={error}
        title={t("carteUnsavedTitle")}
        description={t("saleStockLeaveHint")}
        saveLabel={t("saleStockApplyCorrections")}
      />
    </div>
  );
}
