"use client";

import { useState } from "react";
import { Search, ChefHat, Check, Info } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { serviceProductionNeed } from "@/lib/kitchen-service-plan";
import type { DailyPlanItem, PrepItem } from "@/lib/api";
import styles from "./companion.module.css";
import { KitchenPagination } from "./KitchenDrawer";

/** Compares temporary service targets with live stock, with an explicit production action. */
export default function NextServicePanel({
  items,
  canProduce,
  onProduce,
}: {
  items: PrepItem[];
  canProduce: boolean;
  onProduce: (item: DailyPlanItem) => void;
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<Record<number, string>>({});
  const visible = items.filter((item) =>
    item.name
      .toLocaleLowerCase(locale)
      .includes(search.toLocaleLowerCase(locale)),
  );
  return (
    <section className={styles.planner}>
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>{t("kwPlannerEyebrow")}</span>
          <h2>{t("kwPlannerTitle")}</h2>
          <p>{t("companionPlanDesc")}</p>
        </div>
        <ChefHat size={22} />
      </div>
      <label className={styles.search}>
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t("search")}
          aria-label={t("companionSearchPrep")}
        />
      </label>
      <div className={styles.planColumns}>
        <span>{t("preparations")}</span>
        <span>{t("current")}</span>
        <span>{t("companionTarget")}</span>
        <span>{t("companionToProduce")}</span>
      </div>
      {visible.slice(page * 6, page * 6 + 6).map((item) => {
        const raw = targets[item.id] ?? "";
        const target = Number(raw);
        const need =
          raw !== "" && Number.isFinite(target) && target >= 0
            ? serviceProductionNeed(item, target)
            : null;
        return (
          <div key={item.id} className={styles.planRow}>
            <div>
              <strong>{item.name}</strong>
              <small>{item.unit}</small>
            </div>
            <span className={styles.quantity}>
              {item.quantity.toLocaleString(locale)}
            </span>
            <input
              type="number"
              min="0"
              step={item.unit === "unit" ? 1 : "any"}
              inputMode="decimal"
              value={raw}
              placeholder="—"
              aria-label={`${t("companionTarget")} — ${item.name}`}
              onChange={(e) =>
                setTargets((previous) => ({
                  ...previous,
                  [item.id]: e.target.value,
                }))
              }
            />
            <div>
              {!need ? (
                "—"
              ) : (
                <>
                  {item.quantity < 0 ? (
                    <p className="text-xs text-[var(--warning-500)]">
                      {t("chefNegativePrep")}
                    </p>
                  ) : need.shortfall_qty === 0 ? (
                    <span className={styles.covered}>
                      <Check size={16} />
                      {t("companionCovered")}
                    </span>
                  ) : (
                    <>
                      <span className={styles.quantity}>
                        {need.shortfall_qty.toLocaleString(locale)} {item.unit}
                      </span>
                      <small>
                        {item.yield_per_batch > 0
                          ? `${need.batches_needed} ${t("batches")}`
                          : t("companionCheckYield")}
                      </small>
                      {canProduce && need.batches_needed > 0 && (
                        <button
                          className={styles.actionButton}
                          onClick={() => onProduce(need)}
                        >
                          {t("dailyConfirmProduction")}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {visible.length === 0 && (
        <p className={styles.empty}>
          {t(items.length === 0 ? "companionNoPrep" : "noResults")}
        </p>
      )}
      <KitchenPagination
        page={page}
        count={visible.length}
        size={6}
        onChange={setPage}
      />
      <footer className={styles.plannerFooter}>
        <span>
          <Info size={15} />
          {t("companionSimulation")}
        </span>
      </footer>
    </section>
  );
}
