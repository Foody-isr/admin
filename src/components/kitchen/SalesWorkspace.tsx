"use client";

import { useEffect, useState } from "react";
import { FileUp, Plus, Trash2, AlertTriangle } from "lucide-react";
import { getSalesLinks, type DailySalesEntry, type SalesLinkContext, type SalesLinkStatus } from "@/lib/api";
import { SalesLinkEditor } from "./SalesLinkEditor";
import { useI18n } from "@/lib/i18n";
import {
  KitchenDrawer,
  KitchenPagination,
  KitchenSearch,
} from "./KitchenDrawer";
import styles from "./companion.module.css";

/** Auditable, searchable sales detail with explicit source filters and bounded pages. */
export default function SalesWorkspace({
  sales,
  restaurantId, reportId, canLink, onLinked,
  canEdit,
  onImport,
  onManual,
  onDelete,
  onClose,
}: {
  sales: DailySalesEntry[];
  restaurantId: number; reportId?: number; canLink: boolean; onLinked: () => Promise<void>;
  canEdit: boolean;
  onImport: () => void;
  onManual: () => void;
  onDelete: (ids: number[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [unmapped, setUnmapped] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<SalesLinkContext | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [linking, setLinking] = useState<SalesLinkStatus | null>(null);
  const [linkVersion, setLinkVersion] = useState(0);
  useEffect(() => {
    if (!reportId) return;
    let active = true;
    setLinkError(false);
    getSalesLinks(restaurantId, reportId).then(value => { if (active) setLinks(value); })
      .catch(() => { if (active) setLinkError(true); });
    return () => { active = false; };
  }, [restaurantId, reportId, linkVersion]);
  const statusFor = (id: number) => links?.sales.find(link => link.sale_id === id);
  const rows = sales.filter(
    (sale) =>
      (source === "all" || sale.source === source) &&
      (!unmapped || (statusFor(sale.id) ? statusFor(sale.id)!.menu_item_id == null : sale.menu_item_id == null)) &&
      `${sale.menu_item_name} ${sale.source_name ?? ""} ${statusFor(sale.id)?.menu_item_name ?? ""}`
        .toLocaleLowerCase(locale)
        .includes(search.toLocaleLowerCase(locale)),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 10) - 1),
  );
  const pageRows = rows.slice(currentPage * 10, currentPage * 10 + 10);
  const qty = (n: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const remove = async () => {
    if (
      !confirm(
        t("kwDeleteSalesConfirm").replace("{count}", String(selected.size)),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onDelete(Array.from(selected));
      setSelected(new Set());
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
    <KitchenDrawer
      title={t("kwSalesJournal")}
      description={t("chefSalesHint")}
      onClose={onClose}
      busy={busy || linking != null}
      wide
      footer={
        canEdit && (
          <>
            <button className={styles.secondaryButton} onClick={onImport}>
              <FileUp size={16} />
              {t("chefImportSales")}
            </button>
            <button className={styles.primaryButton} onClick={onManual}>
              <Plus size={16} />
              {t("manualSalesEntry")}
            </button>
          </>
        )
      }
    >
      <div className={styles.reviewMetrics}>
        <div>
          <strong>
            {qty(sales.reduce((total, sale) => total + sale.quantity, 0))}
          </strong>
          <span>{t("kwUnitsSold")}</span>
        </div>
        <div>
          <strong>{sales.length}</strong>
          <span>{t("kwSalesLines")}</span>
        </div>
        <div>
          <strong>{new Set(sales.map((sale) => sale.source)).size}</strong>
          <span>{t("kwSources")}</span>
        </div>
      </div>
      <div className={styles.toolbar}>
        <KitchenSearch
          value={search}
          label={t("kwSearchSales")}
          onChange={(value) => {
            setSearch(value);
            setPage(0);
          }}
        />
        <select
          aria-label={t("source")}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">{t("kwAllSources")}</option>
          <option value="pos">Foody POS</option>
          <option value="manual">{t("kwManual")}</option>
          <option value="aviv">Aviv</option>
        </select>
      </div>
      <div className={styles.selectionBar}>
        <label className="selection-row">
          <input
            type="checkbox"
            checked={unmapped}
            onChange={(event) => {
              setUnmapped(event.target.checked);
              setPage(0);
            }}
          />
          {t("kwUnlinkedOnly")}
        </label>
        {canEdit && selected.size > 0 && (
          <button
            disabled={busy}
            onClick={remove}
            className={styles.dangerButton}
          >
            <Trash2 size={14} />
            {t("deleteSelected")} ({selected.size})
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {linkError && <p role="alert" className={styles.error}>{t("salesLinkLoadError")} <button onClick={() => setLinkVersion(v => v + 1)}>{t("retry")}</button></p>}
      <div className={styles.salesHead}>
        <span>
          {canEdit && (
            <input
              type="checkbox"
              aria-label={t("kwSelectPage")}
              checked={
                pageRows.length > 0 &&
                pageRows.every((row) => selected.has(row.id))
              }
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  pageRows.forEach((row) =>
                    event.target.checked
                      ? next.add(row.id)
                      : next.delete(row.id),
                  );
                  return next;
                })
              }
            />
          )}
        </span>
        <span>{t("menuItem")}</span>
        <span>{t("qtySold")}</span>
        <span>{t("source")}</span>
      </div>
      {pageRows.map((sale) => (
        <div className={styles.salesRow} key={sale.id}>
          <span>
            {canEdit && (
              <input
                type="checkbox"
                aria-label={`${t("select")} ${sale.menu_item_name}`}
                checked={selected.has(sale.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(sale.id)) next.delete(sale.id);
                    else next.add(sale.id);
                    return next;
                  })
                }
              />
            )}
          </span>
          <div>
            <strong dir="auto">{statusFor(sale.id)?.menu_item_name || sale.menu_item_name}</strong>
            {(statusFor(sale.id) ? statusFor(sale.id)!.menu_item_id == null : sale.menu_item_id == null) && (
              <small className={styles.warning}>
                <AlertTriangle size={12} />
                {t("salesLinkUnlinked")}
              </small>
            )}
            {sale.source_name && <small dir="auto">{sale.source_name}</small>}
            {statusFor(sale.id)?.menu_item_id != null && !statusFor(sale.id)?.has_recipe && <small>{t("salesLinkNoRecipe")}</small>}
            {canLink && statusFor(sale.id)?.can_link && <button className={styles.textButton} onClick={() => setLinking(statusFor(sale.id)!)}>{t(statusFor(sale.id)?.menu_item_id ? "salesLinkChange" : "salesLinkAction")}</button>}
          </div>
          <b>{qty(sale.quantity)}</b>
          <span className={styles.sourceBadge}>
            {sale.source === "pos"
              ? "Foody POS"
              : sale.source === "manual"
                ? t("kwManual")
                : sale.source === "aviv"
                  ? "Aviv"
                  : sale.source}
          </span>
        </div>
      ))}
      {!rows.length && (
        <p className={styles.empty}>
          {t(sales.length ? "noResults" : "noSalesDataYet")}
        </p>
      )}
      <KitchenPagination
        page={currentPage}
        count={rows.length}
        size={10}
        onChange={setPage}
      />
    </KitchenDrawer>
    {linking && links && reportId && <SalesLinkEditor restaurantId={restaurantId} reportId={reportId} sale={linking} context={links}
      onClose={() => setLinking(null)} onSaved={async () => {
        setLinks(await getSalesLinks(restaurantId, reportId));
        await onLinked();
      }}/>}
    </>
  );
}
