"use client";
import { useMemo, useState } from "react";
import { type SaleStockRow, type SaleStockLimit } from "@/lib/api";
import { stockErrors, stockLimit } from "@/lib/carte-editor";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ds";

/** Edits initial allowances only. Its parent decides save-draft or immediate apply. */
export function StockPreparation({
  rows,
  limits,
  onChange,
  disabled = false,
}: {
  rows: SaleStockRow[];
  limits: SaleStockLimit[];
  onChange: (value: SaleStockLimit[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      rows.filter((row) =>
        row.item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [rows, search],
  );
  const change = (value: SaleStockLimit) =>
    onChange([
      ...limits.filter((l) => l.menu_item_id !== value.menu_item_id),
      value,
    ]);
  function copyPrior() {
    const next = [...limits];
    for (const row of rows) {
      if (!row.previous) continue;
      const value = stockLimit(row, row.previous);
      const index = next.findIndex((l) => l.menu_item_id === row.item.id);
      if (index < 0) next.push(value);
      else next[index] = value;
    }
    onChange(next);
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--fg-muted)]">
        {t("saleStockPrepareHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 min-w-40"
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={disabled || !rows.some((r) => r.previous)}
          onClick={copyPrior}
        >
          {t("saleStockCopyPrior")}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            onChange(
              rows.map((row) => ({
                ...stockLimit(row),
                mode: "",
                unit: "",
                quantity: null,
                options: undefined,
              })),
            )
          }
        >
          {t("saleStockUnlimitedAll")}
        </Button>
      </div>
      <div className="divide-y border rounded-lg">
        {visible.map((row) => {
          const explicit = limits.find((l) => l.menu_item_id === row.item.id);
          const value = explicit ?? stockLimit(row);
          const invalid = !!explicit && stockErrors(value, row);
          const stale =
            !!explicit &&
            explicit.expected_revision !== (row.config?.revision ?? 0);
          const committed =
            row.config?.counters.reduce((n, c) => n + c.committed, 0) ?? 0;
          return (
            <div className="p-4 space-y-3" key={row.item.id}>
              <div className="flex flex-wrap gap-4 items-start justify-between">
                <div>
                  <h3 className="font-medium">{row.item.name}</h3>
                  <p className="text-xs text-[var(--fg-muted)]">
                    {t("saleStockCommitted")}: {committed}
                    {row.config?.unit &&
                      ` ${row.config.unit === "kg" ? "g" : row.config.unit === "l" ? "ml" : row.config.unit}`}{" "}
                    · {t("saleStockAvailable")}:{" "}
                    {row.availability.buildable_count ?? "∞"}
                    {explicit && ` · ${t("cartePendingChange")}`}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    className="input w-auto"
                    aria-label={`${t("saleStockMode")} — ${row.item.name}`}
                    disabled={disabled}
                    value={value.mode}
                    onChange={(e) => {
                      const mode = e.target.value as SaleStockLimit["mode"];
                      change({
                        ...value,
                        mode,
                        unit: mode === "measure" ? "g" : "",
                        quantity:
                          mode === "count" || mode === "measure" ? 0 : null,
                        options:
                          mode === "per_variant"
                            ? Object.fromEntries(
                                row.sizes.map((s) => [s.id, 0]),
                              )
                            : undefined,
                      });
                    }}
                  >
                    <option value="">{t("saleStockUnlimited")}</option>
                    <option value="count">{t("saleStockCount")}</option>
                    {row.sizes.length > 0 && (
                      <>
                        <option value="measure">{t("saleStockMeasure")}</option>
                        <option value="per_variant">
                          {t("saleStockPerVariant")}
                        </option>
                      </>
                    )}
                  </select>
                  {explicit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          limits.filter((l) => l.menu_item_id !== row.item.id),
                        )
                      }
                    >
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              </div>
              {(value.mode === "count" || value.mode === "measure") && (
                <div className="flex items-center flex-wrap gap-3">
                  <label className="text-sm flex gap-2 items-center">
                    {t("saleStockInitial")}
                    <input
                      className="input w-32 tabular-nums"
                      type="number"
                      min="0"
                      max="2147483647"
                      step="1"
                      disabled={disabled}
                      value={value.quantity ?? ""}
                      onChange={(e) =>
                        change({
                          ...value,
                          quantity:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  {value.mode === "measure" && (
                    <select
                      className="input w-24"
                      disabled={disabled}
                      aria-label={t("saleStockUnit")}
                      value={value.unit}
                      onChange={(e) =>
                        change({ ...value, unit: e.target.value })
                      }
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                    </select>
                  )}
                </div>
              )}
              {value.mode === "per_variant" && (
                <div className="flex gap-4 flex-wrap">
                  {row.sizes.map((size) => (
                    <label className="text-sm space-y-1" key={size.id}>
                      <span>
                        {size.name} · {t("saleStockCommitted")}:{" "}
                        {row.config?.counters.find(
                          (c) => c.option_id === size.id,
                        )?.committed ?? 0}
                      </span>
                      <input
                        className="input w-32 block"
                        type="number"
                        min="0"
                        max="2147483647"
                        step="1"
                        disabled={disabled}
                        value={value.options?.[size.id] ?? ""}
                        onChange={(e) =>
                          change({
                            ...value,
                            options: {
                              ...value.options,
                              [size.id]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {stale && (
                <div className="flex flex-wrap gap-2 text-sm items-center">
                  <p role="alert">{t("saleStockStale")}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => change(stockLimit(row))}
                  >
                    {t("saleStockUseCurrent")}
                  </Button>
                </div>
              )}
              {invalid && (
                <p role="alert" className="text-sm text-red-600">
                  {t("saleStockInvalid")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!visible.length && <p>{t("saleStockEmpty")}</p>}
    </div>
  );
}
