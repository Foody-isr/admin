"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Package,
  RefreshCw,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  priorityKitchenStocks,
  priorityKitchenPreparations,
  kitchenStockPriority,
} from "@/lib/kitchen-review";
import type {
  DailyFoodCostReport,
  KitchenSummary,
  KitchenStockSummary,
} from "@/lib/api";
import {
  KitchenDrawer,
  KitchenPagination,
  KitchenSearch,
} from "./KitchenDrawer";
import styles from "./companion.module.css";

/** Separates recorded production, stock evidence and optional physical checks in a bounded review. */
export default function KitchenDayReview({
  report,
  summary,
  loading,
  error,
  canCount,
  onCount,
  onRetry,
  onSales,
}: {
  report: DailyFoodCostReport;
  summary: KitchenSummary | null;
  loading: boolean;
  error: string;
  canCount: boolean;
  onCount: (stockItemId: number, quantity: number) => Promise<void>;
  onRetry: () => void;
  onSales: () => void;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"priority" | "all" | "counted">(
    "priority",
  );
  const [page, setPage] = useState(0);
  const [prepPage, setPrepPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showPreps, setShowPreps] = useState(false);
  const stocks = priorityKitchenStocks(summary?.stocks ?? []);
  const preparations = priorityKitchenPreparations(summary?.preparations ?? []);
  const priorities = stocks.filter((row) => kitchenStockPriority(row) > 0);
  const counted = stocks.filter((row) => row.counted_remaining != null);
  const visible = stocks.filter(
    (row) =>
      (filter === "all" ||
        (filter === "priority"
          ? kitchenStockPriority(row) > 0
          : row.counted_remaining != null)) &&
      row.name
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / 6) - 1),
  );
  const selected = stocks.find((row) => row.stock_item_id === selectedId);
  const qty = (n: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <section className={styles.workspace} aria-label={t("chefReviewTitle")}>
      <header className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{t("kwReconcile")}</span>
          <h2>{t("kwStockReview")}</h2>
          <p>{t("chefReviewEvidenceHint")}</p>
        </div>
        <ClipboardCheck size={23} className={styles.muted} />
      </header>
      {error ? (
        <div role="alert" className={styles.notice}>
          <span>{t("chefReviewError")}</span>
          <button className={styles.textButton} onClick={onRetry}>
            {t("refresh")}
          </button>
        </div>
      ) : loading || !summary ? (
        <p className={styles.empty}>
          <RefreshCw className="animate-spin" size={20} />
          {t("loading")}
        </p>
      ) : (
        <>
          <div className={styles.reviewMetrics}>
            <div>
              <strong>{priorities.length}</strong>
              <span>{t("kwChecksToReview")}</span>
            </div>
            <div>
              <strong>
                {counted.length}
                <small> / {stocks.length}</small>
              </strong>
              <span>{t("kwPhysicalChecks")}</span>
            </div>
            <button onClick={() => setShowPreps(true)}>
              <strong>{preparations.length}</strong>
              <span>
                {t("kwProductionReview")}
                <ArrowRight size={14} />
              </span>
            </button>
          </div>
          {summary.unmapped_sales > 0 && (
            <button onClick={onSales} className={styles.coverageNotice}>
              <AlertTriangle size={18} />
              <span>
                <strong>
                  {qty(summary.unmapped_sales)} {t("kwUnmappedUnits")}
                </strong>
                <small>{t("kwIncompleteConsumption")}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          )}
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              {(["priority", "all", "counted"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    setPage(0);
                  }}
                >
                  {t(
                    value === "priority"
                      ? "kwCheck"
                      : value === "all"
                        ? "all"
                        : "kwCounted",
                  )}
                </button>
              ))}
            </div>
            <KitchenSearch
              label={t("kwSearchIngredient")}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(0);
              }}
            />
          </div>
          <div className={styles.stockHead}>
            <span>{t("ingredient")}</span>
            <span>{t("kwExpected")}</span>
            <span>{t("kwMeasured")}</span>
            <span />
          </div>
          {visible.slice(currentPage * 6, currentPage * 6 + 6).map((row) => (
            <button
              className={styles.stockRow}
              key={row.stock_item_id}
              onClick={() => setSelectedId(row.stock_item_id)}
              aria-label={`${t(canCount ? "chefCheckRemaining" : "kwViewMovement")} · ${row.name}`}
            >
              <span>
                <strong>{row.name}</strong>
                <small
                  className={
                    kitchenStockPriority(row) > 0
                      ? styles.warning
                      : styles.muted
                  }
                >
                  {row.unexplained_qty != null &&
                  Math.abs(row.unexplained_qty) > 0.001
                    ? `${t("variance")} : ${qty(row.unexplained_qty)} ${row.unit}`
                    : row.expected_remaining < 0
                      ? t("kwNegativeBalance")
                      : row.waste_qty > 0
                        ? t("chefDeclaredWaste").replace(
                            "{qty}",
                            `${qty(row.waste_qty)} ${row.unit}`,
                          )
                        : row.counted_remaining != null
                          ? t("kwCounted")
                          : t("kwCalculated")}
                </small>
              </span>
              <span className={styles.quantity}>
                <b>{qty(row.expected_remaining)}</b>
                <small>{row.unit}</small>
              </span>
              <span className={styles.quantity}>
                <b>
                  {row.counted_remaining == null
                    ? "—"
                    : qty(row.counted_remaining)}
                </b>
                <small>
                  {row.counted_remaining == null ? t("kwNotCounted") : row.unit}
                </small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!visible.length && (
            <div className={styles.empty}>
              <Check size={24} />
              <strong>
                {t(
                  search
                    ? "noResults"
                    : filter === "priority"
                      ? "kwNoFlaggedMovement"
                      : filter === "counted"
                        ? "kwNoPhysicalCheck"
                        : "chefNoMovements",
                )}
              </strong>
              <p>{t("kwChecksOptional")}</p>
              {filter !== "all" && (
                <button
                  className={styles.textButton}
                  onClick={() => setFilter("all")}
                >
                  {t("chefShowAllStocks").replace(
                    "{count}",
                    String(stocks.length),
                  )}
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          <KitchenPagination
            page={currentPage}
            count={visible.length}
            size={6}
            onChange={setPage}
          />
        </>
      )}
      {selected && (
        <StockCheck
          key={`${report.id}-${selected.stock_item_id}`}
          row={selected}
          canCount={canCount}
          onCount={onCount}
          onClose={() => setSelectedId(null)}
        />
      )}
      {showPreps && (
        <KitchenDrawer
          title={t("kwProductionReview")}
          description={t("kwProductionReviewHint")}
          onClose={() => setShowPreps(false)}
          wide
        >
          <div className={styles.prepReviewHead}>
            <span>{t("preparation")}</span>
            <span>{t("kwObjective")}</span>
            <span>{t("kwProduced")}</span>
            <span>{t("kwRemaining")}</span>
          </div>
          {preparations.slice(prepPage * 8, prepPage * 8 + 8).map((row) => (
            <div className={styles.prepReviewRow} key={row.prep_item_id}>
              <div>
                <strong>{row.name}</strong>
                <small>{row.unit}</small>
                {row.remaining_qty < 0 && (
                  <p className={styles.warning}>{t("chefNegativePrep")}</p>
                )}
                {row.target_qty != null &&
                  row.produced_qty < row.target_qty && (
                    <p className={styles.muted}>
                      {t("chefProductionShortfall").replace(
                        "{qty}",
                        `${qty(row.target_qty - row.produced_qty)} ${row.unit}`,
                      )}
                    </p>
                  )}
                {row.waste_qty > 0 && (
                  <p className={styles.warning}>
                    {t("chefDeclaredWaste").replace(
                      "{qty}",
                      `${qty(row.waste_qty)} ${row.unit}`,
                    )}
                  </p>
                )}
              </div>
              <span>{row.target_qty == null ? "—" : qty(row.target_qty)}</span>
              <span>{qty(row.produced_qty)}</span>
              <span>{qty(row.remaining_qty)}</span>
            </div>
          ))}
          {!preparations.length && (
            <p className={styles.empty}>{t("companionNoPrep")}</p>
          )}
          <KitchenPagination
            page={prepPage}
            count={preparations.length}
            size={8}
            onChange={setPrepPage}
          />
        </KitchenDrawer>
      )}
    </section>
  );
}

function StockCheck({
  row,
  canCount,
  onCount,
  onClose,
}: {
  row: KitchenStockSummary;
  canCount: boolean;
  onCount: (id: number, quantity: number) => Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [count, setCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qty = (n: number) =>
    `${(Object.is(n, -0) ? 0 : n).toLocaleString(locale, { maximumFractionDigits: 3 })} ${row.unit}`;
  const value = Number(count.replace(",", "."));
  const save = async () => {
    if (!count.trim() || !Number.isFinite(value) || value < 0) return;
    setSaving(true);
    setError("");
    try {
      await onCount(row.stock_item_id, value);
      onClose();
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <KitchenDrawer
      title={row.name}
      description={t("kwStockDetailHint")}
      busy={saving}
      onClose={onClose}
      footer={
        canCount && (
          <button
            className={styles.primaryButton}
            disabled={
              saving || !count.trim() || !Number.isFinite(value) || value < 0
            }
            onClick={save}
          >
            {saving ? t("saving") : t("chefSaveCheck")}
            <Check size={16} />
          </button>
        )
      }
    >
      <div className={styles.balance}>
        <Package size={24} />
        <span>
          {t("kwExpected")}
          <strong>{qty(row.expected_remaining)}</strong>
        </span>
      </div>
      {row.expected_remaining < 0 && (
        <p className={styles.notice}>{t("chefNegativeStock")}</p>
      )}
      <h3 className={styles.drawerSectionTitle}>{t("kwMovementBreakdown")}</h3>
      <dl className={styles.ledger}>
        {(
          [
            ["kwOpeningStock", row.opening_qty],
            ["suppliesReceived", row.received_qty],
            ["kwUsedForProduction", -row.production_usage],
            ["kwUsedForSales", -row.order_usage],
            ["kwPendingSales", -row.pending_usage],
            ["kwDeclaredWaste", -row.waste_qty],
            ["kwAdjustments", row.adjustment_qty],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>
              {amount > 0 && label !== "kwOpeningStock" ? "+" : ""}
              {qty(amount)}
            </dd>
          </div>
        ))}
      </dl>
      {row.pending_usage > 0 && (
        <p className={styles.hint}>{t("chefPendingRemainder")}</p>
      )}
      {(row.recipes ?? []).length > 0 && (
        <details className={styles.recipeDetails}>
          <summary>{t("chefRecipeDetails")}</summary>
          {row.recipes.map((recipe, index) => (
            <p key={index}>
              {recipe.name} ·{" "}
              {qty(recipe.produced_qty * recipe.quantity_per_unit)}
            </p>
          ))}
          <p>{t("chefCurrentRecipeHint")}</p>
        </details>
      )}
      <section className={styles.countPanel}>
        <h3>{t("kwPhysicalCheck")}</h3>
        <p>{t("kwChecksOptional")}</p>
        {row.counted_remaining != null && (
          <div className={styles.lastCount}>
            <Check size={16} />
            {t("chefMeasuredRemainder").replace(
              "{qty}",
              qty(row.counted_remaining),
            )}
          </div>
        )}
        {row.unexplained_qty != null &&
          Math.abs(row.unexplained_qty) > 0.001 && (
            <p className={styles.warning}>
              {t(
                row.unexplained_qty > 0 ? "chefMissingStock" : "chefExtraStock",
              ).replace("{qty}", qty(Math.abs(row.unexplained_qty)))}
            </p>
          )}
        {canCount && (
          <label>
            {t("chefActualRemaining")} ({row.unit})
            <input
              autoComplete="off"
              inputMode="decimal"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              placeholder="—"
              disabled={saving}
            />
          </label>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </section>
    </KitchenDrawer>
  );
}
