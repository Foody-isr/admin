"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, AlertTriangle, ArrowRight } from "lucide-react";
import type { DailyPlanItem, KitchenSummary, PrepItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { KitchenPagination, KitchenSearch } from "./KitchenDrawer";
import styles from "./companion.module.css";

/** Organizes live preparations by actionable need, keeping goals distinct from stock. */
export default function ProductionBoard({
  rid,
  plans,
  items,
  summary,
  canProduce,
  unavailable,
  onProduce,
  objectives,
}: {
  rid: number;
  plans: DailyPlanItem[];
  items: PrepItem[];
  summary: KitchenSummary | null;
  canProduce: boolean;
  unavailable: boolean;
  onProduce: (item: DailyPlanItem) => void;
  objectives?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"priority" | "all">("priority");
  const [page, setPage] = useState(0);
  const rows = items.filter(
    (item) =>
      (filter === "all" ||
        plans.some((plan) => plan.prep_item_id === item.id)) &&
      item.name
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 6) - 1),
  );
  const qty = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <section className={styles.workspace} aria-label={t("kwProduction")}>
      <header className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>{t("kwMiseEnPlace")}</span>
          <h2>{t("kwProduction")}</h2>
          <p>{t("kwProductionHint")}</p>
        </div>
        {objectives}
      </header>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <button
            aria-pressed={filter === "priority"}
            onClick={() => {
              setFilter("priority");
              setPage(0);
            }}
          >
            {t("kwPriorities")} <b>{plans.length}</b>
          </button>
          <button
            aria-pressed={filter === "all"}
            onClick={() => {
              setFilter("all");
              setPage(0);
            }}
          >
            {t("all")} <b>{items.length}</b>
          </button>
        </div>
        <KitchenSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(0);
          }}
          label={t("companionSearchPrep")}
        />
      </div>
      <div className={styles.productionHead}>
        <span>{t("preparation")}</span>
        <span>{t("kwAvailable")}</span>
        <span>{t("kwToFinish")}</span>
        <span />
      </div>
      {unavailable ? (
        <p role="alert" className={styles.empty}>
          {t("dailyLoadError")}
        </p>
      ) : (
        rows.slice(currentPage * 6, currentPage * 6 + 6).map((item) => {
          const plan = plans.find((row) => row.prep_item_id === item.id);
          const target = summary?.preparations.find(
            (row) => row.prep_item_id === item.id,
          );
          const invalid =
            item.quantity < 0 ||
            (plan?.current_qty ?? 0) < 0 ||
            (!!plan && item.yield_per_batch <= 0);
          return (
            <article key={item.id} className={styles.productionRow}>
              <div>
                <strong>{item.name}</strong>
                <small>{item.category || t("preparation")}</small>
                {target?.target_qty != null && (
                  <div className={styles.productionProgress}>
                    <progress
                      max={Math.max(1, target.target_qty)}
                      value={Math.min(target.target_qty, target.produced_qty)}
                      aria-label={t("kwObjectiveProgress")}
                    />
                    <small>
                      {qty(target.produced_qty)} / {qty(target.target_qty)}{" "}
                      {item.unit} · {t("kwProduced")}
                    </small>
                  </div>
                )}
              </div>
              <div className={styles.quantity}>
                <b>{qty(item.quantity)}</b>
                <small>{item.unit}</small>
              </div>
              <div>
                {invalid ? (
                  <span className={styles.warning}>
                    <AlertTriangle size={14} />
                    {t("kwCheck")}
                  </span>
                ) : plan ? (
                  <>
                    <b className={styles.need}>+{qty(plan.shortfall_qty)}</b>
                    <small>
                      {item.unit} · {plan.batches_needed} {t("batches")}
                    </small>
                  </>
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </div>
              <div>
                {invalid ? (
                  <Link
                    className={styles.textButton}
                    href={`/${rid}/kitchen/prep`}
                  >
                    {t("chefReviewProduction")}
                    <ArrowUpRight size={15} />
                  </Link>
                ) : plan && canProduce ? (
                  <button
                    className={styles.actionButton}
                    onClick={() => onProduce(plan)}
                  >
                    <Check size={15} />
                    {t("kwRecordBatch")}
                  </button>
                ) : !plan &&
                  target?.target_qty != null &&
                  target.produced_qty >= target.target_qty ? (
                  <span className={styles.success}>
                    <Check size={15} />
                    {t("kwObjectiveMet")}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })
      )}
      {!unavailable && !rows.length && (
        <div className={styles.empty}>
          <Check size={24} />
          <strong>
            {t(
              search
                ? "noResults"
                : filter === "priority"
                  ? "kwNoSuggestedProduction"
                  : "companionNoPrep",
            )}
          </strong>
          <p>{t("kwObjectivesHelp")}</p>
        </div>
      )}
      <KitchenPagination
        page={currentPage}
        count={rows.length}
        size={6}
        onChange={setPage}
      />
      <Link className={styles.panelLink} href={`/${rid}/kitchen/prep`}>
        {t("viewPreparations")}
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
