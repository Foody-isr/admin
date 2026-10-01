"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ArrowLeft } from "lucide-react";
import { NumberInput } from "@/components/ui/NumberInput";
import { useI18n } from "@/lib/i18n";
import {
  KitchenDrawer,
  KitchenPagination,
  KitchenSearch,
} from "./KitchenDrawer";
import styles from "./companion.module.css";

type EntryItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  detail?: string;
};

/** Selects quantities, then reviews only selected lines before the explicit write. */
export default function QuantityEntryDrawer({
  title,
  description,
  items,
  initial = {},
  children,
  onConfirm,
  onClose,
  confirmLabel,
}: {
  title: string;
  description: string;
  items: EntryItem[];
  initial?: Record<number, number>;
  children?: ReactNode;
  onConfirm: (quantities: Record<number, number>) => Promise<void>;
  onClose: () => void;
  confirmLabel: string;
}) {
  const { t, locale } = useI18n();
  const [quantities, setQuantities] = useState(initial);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const selected = items.filter((item) => quantities[item.id] > 0);
  const rows = reviewing
    ? selected
    : items.filter(
        (item) =>
          (!category || category === item.category) &&
          item.name
            .toLocaleLowerCase(locale)
            .includes(search.toLocaleLowerCase(locale)),
      );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 8) - 1),
  );
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm(quantities);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KitchenDrawer
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <>
          <span className={styles.selectionTotal}>
            {selected.length} {t("kwSelectedOnly")}
          </span>
          {reviewing && (
            <button
              disabled={busy}
              className={styles.secondaryButton}
              onClick={() => {
                setReviewing(false);
                setPage(0);
              }}
            >
              <ArrowLeft size={15} />
              {t("kwBackToSelection")}
            </button>
          )}
          <button
            disabled={busy || !selected.length || saved}
            className={styles.primaryButton}
            onClick={
              reviewing
                ? confirm
                : () => {
                    setReviewing(true);
                    setPage(0);
                  }
            }
          >
            {busy
              ? t("saving")
              : reviewing
                ? confirmLabel
                : t("kwReviewSelection")}
            {reviewing ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </>
      }
    >
      {children}
      {!reviewing && (
        <div className={styles.toolbar}>
          <KitchenSearch
            value={search}
            label={t("search")}
            onChange={(value) => {
              setSearch(value);
              setPage(0);
            }}
          />
          <select
            aria-label={t("category")}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("all")}</option>
            {Array.from(
              new Set(items.map((item) => item.category).filter(Boolean)),
            ).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.entryHead}>
        <span>{t("items")}</span>
        <span>{t("quantity")}</span>
      </div>
      {rows.slice(currentPage * 8, currentPage * 8 + 8).map((item) => (
        <div className={styles.entryRow} key={item.id}>
          <label htmlFor={`entry-${item.id}`}>
            <strong>{item.name}</strong>
            <small>
              {[item.category, item.detail].filter(Boolean).join(" · ")}
            </small>
          </label>
          <div>
            {reviewing ? (
              <b>
                {(quantities[item.id] ?? 0).toLocaleString(locale)} {item.unit}
              </b>
            ) : (
              <>
                <NumberInput
                  id={`entry-${item.id}`}
                  aria-label={`${t("received")}: ${item.name}`}
                  value={quantities[item.id] ?? 0}
                  min={0}
                  integer={item.unit === "unit"}
                  onChange={(value) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.id]: value,
                    }))
                  }
                  placeholder="0"
                />
                <span>{item.unit}</span>
              </>
            )}
          </div>
        </div>
      ))}
      {!rows.length && <p className={styles.empty}>{t("noResults")}</p>}
      <KitchenPagination
        page={currentPage}
        count={rows.length}
        size={8}
        onChange={setPage}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </KitchenDrawer>
  );
}
