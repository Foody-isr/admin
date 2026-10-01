"use client";

import { useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";
import {
  setProductionTarget,
  type KitchenSummary,
  type PrepItem,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  KitchenDrawer,
  KitchenPagination,
  KitchenSearch,
} from "./KitchenDrawer";
import styles from "./companion.module.css";

/** Edits optional per-preparation goals without treating them as stock or production. */
export default function ProductionObjectives({
  rid,
  reportId,
  items,
  summary,
  onSaved,
}: {
  rid: number;
  reportId: number;
  items: PrepItem[];
  summary: KitchenSummary | null;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [values, setValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const visible = items.filter((item) =>
    item.name
      .toLocaleLowerCase(locale)
      .includes(search.toLocaleLowerCase(locale)),
  );
  const close = () => {
    if (Object.keys(values).length && !confirm(t("kwDiscardObjectives")))
      return;
    setOpen(false);
    setValues({});
  };
  return (
    <>
      <button
        className={styles.secondaryButton}
        aria-label={t("chefEditObjectives")}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={15} />
        {t("kwObjectives")}
      </button>
      {open && (
        <KitchenDrawer
          title={t("chefEditObjectives")}
          description={t("chefObjectivesHint")}
          busy={saving != null}
          onClose={close}
        >
          <KitchenSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(0);
            }}
            label={t("companionSearchPrep")}
          />
          {visible.slice(page * 8, page * 8 + 8).map((item) => {
            const saved = summary?.preparations?.find(
              (row) => row.prep_item_id === item.id,
            )?.target_qty;
            const raw = values[item.id] ?? (saved == null ? "" : String(saved));
            const value = Number(raw.replace(",", "."));
            return (
              <form
                key={item.id}
                className={styles.objectiveRow}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!raw.trim() || !Number.isFinite(value) || value < 0)
                    return;
                  setSaving(item.id);
                  setError("");
                  setSavedId(null);
                  try {
                    await setProductionTarget(rid, reportId, item.id, value);
                    await onSaved();
                    setValues((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    });
                    setSavedId(item.id);
                  } catch {
                    setError(t("saveFailed"));
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                <label htmlFor={`objective-${item.id}`}>
                  <strong>{item.name}</strong>
                  <small>{item.unit}</small>
                </label>
                <input
                  id={`objective-${item.id}`}
                  inputMode="decimal"
                  aria-label={`${item.name} (${item.unit})`}
                  value={raw}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }));
                    setSavedId(null);
                  }}
                  placeholder="—"
                />
                <button
                  type="submit"
                  className={styles.secondaryButton}
                  disabled={
                    saving != null ||
                    !raw.trim() ||
                    !Number.isFinite(value) ||
                    value < 0
                  }
                >
                  {savedId === item.id ? (
                    <Check size={16} />
                  ) : saving === item.id ? (
                    t("saving")
                  ) : (
                    t("save")
                  )}
                </button>
              </form>
            );
          })}
          {!visible.length && <p className={styles.empty}>{t("noResults")}</p>}
          <KitchenPagination
            page={page}
            count={visible.length}
            size={8}
            onChange={setPage}
          />
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </KitchenDrawer>
      )}
    </>
  );
}
