"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import type {
  AvailabilityOverride,
  AvailabilityState,
  SaleStockLimit,
  SaleStockRow,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, Select } from "@/components/ds";
import { ChoiceRow } from "@/components/ds/Selection";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AvailabilityPill } from "@/components/menu/AvailabilityPill";

interface Props {
  row: SaleStockRow;
  series: boolean;
  open: boolean;
  canEdit: boolean;
  busy: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onReload: () => Promise<unknown>;
  onApply: (
    value: AvailabilityOverride,
    remaining?: SaleStockLimit,
  ) => Promise<boolean | undefined>;
}

/** Edits an explicit availability choice beside its badge; opening never writes stock. */
export function AvailabilityPopover(props: Props) {
  const { t, direction } = useI18n();
  const title = useId();
  const pill = (
    <AvailabilityPill
      state={props.row.availability.availability_state as AvailabilityState}
      override={
        props.row.config?.override ?? props.row.item.availability_override
      }
      isActive={props.row.item.is_active !== false}
      canEdit={props.canEdit}
      pending={props.busy}
      actionLabel={t("carteAvailabilityTitle")}
    />
  );
  if (!props.canEdit || props.row.item.is_active === false) return pill;
  return (
    <Popover
      modal
      open={props.open}
      onOpenChange={(open) => {
        if (!props.busy) props.onOpenChange(open);
      }}
    >
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent
        align={direction === "rtl" ? "end" : "start"}
        sideOffset={8}
        collisionPadding={12}
        dir={direction}
        aria-labelledby={title}
        className="list-popover w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--fg)] shadow-lg [&_.choice-row]:min-h-11 [&_.choice-row]:py-2 [&_.choice-title]:text-sm"
        onEscapeKeyDown={(event) => {
          if (props.busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (props.busy) event.preventDefault();
        }}
      >
        <AvailabilityForm {...props} titleId={title} />
      </PopoverContent>
    </Popover>
  );
}

function AvailabilityForm({
  row,
  series,
  busy,
  error,
  onOpenChange,
  onReload,
  onApply,
  titleId,
}: Props & { titleId: string }) {
  const { t } = useI18n();
  const name = useId();
  const storedMode = row.config?.mode || row.item.stock_mode || "";
  const initialMode =
    storedMode === "measure" || storedMode === "per_variant"
      ? storedMode
      : "count";
  const override =
    row.config?.override ??
    (row.managed ? "auto" : (row.item.availability_override ?? "auto"));
  const [choice, setChoice] = useState<AvailabilityOverride | "stock">(
    override !== "auto" ? override : storedMode && series ? "stock" : "auto",
  );
  const [mode, setMode] = useState<SaleStockLimit["mode"]>(initialMode);
  const storedUnit = row.config?.unit || row.item.stock_unit || "g";
  const [unit, setUnit] = useState(
    storedUnit === "kg" ? "g" : storedUnit === "l" ? "ml" : storedUnit,
  );
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      [0, ...row.sizes.map((s) => s.id)].map((id) => {
        const counter = row.config?.counters.find((c) => c.option_id === id);
        const remaining = counter
          ? counter.initial_quantity == null
            ? null
            : Math.max(0, counter.initial_quantity - counter.committed)
          : id === 0
            ? row.item.stock_quantity
            : row.sizes.find((s) => s.id === id)?.stock_remaining;
        return [id, remaining == null ? "" : String(remaining)];
      }),
    ),
  );
  const variant = mode === "per_variant";
  const fields = variant
    ? row.sizes.map((size) => ({ id: size.id, label: size.name }))
    : [
        {
          id: 0,
          label:
            t("carteRestockQuantity") +
            (mode === "measure" ? ` (${unit})` : ""),
        },
      ];
  const values = fields.map((f) => quantities[f.id] ?? "");
  const valid =
    choice !== "stock" ||
    (fields.length > 0 &&
      values.every(
        (v) =>
          (variant && v === "") || (/^\d+$/.test(v) && Number(v) <= 2147483647),
      ) &&
      values.some((v) => Number(v) > 0));
  const modeLocked = (row.config?.counters ?? []).some(
    (counter) => counter.committed > 0,
  );
  async function apply() {
    if (busy || !valid) return;
    const remaining: SaleStockLimit | undefined =
      choice === "stock"
        ? {
            menu_item_id: row.item.id,
            mode,
            unit: mode === "measure" ? unit : "",
            override: "auto",
            expected_revision: row.config?.revision ?? 0,
            reason: t("carteRestockReason"),
            quantity: variant ? null : Number(quantities[0]),
            options: variant
              ? Object.fromEntries(
                  row.sizes.map((size) => [
                    size.id,
                    (quantities[size.id] ?? "") === ""
                      ? null
                      : Number(quantities[size.id]),
                  ]),
                )
              : undefined,
          }
        : undefined;
    if (await onApply(choice === "stock" ? "auto" : choice, remaining))
      onOpenChange(false);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void apply();
      }}
      className="flex max-h-[min(620px,var(--radix-popover-content-available-height))] flex-col text-start"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] p-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">
            {t("availability")}
          </h2>
          <p className="mt-1 break-words text-sm text-[var(--fg-muted)]">
            {row.item.name}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("close")}
          disabled={busy}
          onClick={() => onOpenChange(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-[var(--surface-2)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 py-2">
        <fieldset disabled={busy} aria-label={t("availability")}>
          <ChoiceRow
            type="radio"
            name={name}
            value="force_available"
            checked={choice === "force_available"}
            onChange={() => setChoice("force_available")}
            label={t("carteChoiceUnlimited")}
          />
          <ChoiceRow
            type="radio"
            name={name}
            value="force_sold_out"
            checked={choice === "force_sold_out"}
            onChange={() => setChoice("force_sold_out")}
            label={t("unavailable")}
          />
          {series && (
            <ChoiceRow
              type="radio"
              name={name}
              value="stock"
              checked={choice === "stock"}
              onChange={() => setChoice("stock")}
              label={t("carteChoiceStock")}
            />
          )}
          {choice === "stock" && series && (
            <div className="space-y-3 border-b border-[var(--line)] py-3">
              {row.sizes.length > 0 && !modeLocked && (
                <Field label={t("saleStockMode")}>
                  <Select
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as SaleStockLimit["mode"])
                    }
                  >
                    <option value="count">{t("saleStockCount")}</option>
                    {row.sizes.length > 0 && (
                      <>
                        <option value="measure">{t("saleStockMeasure")}</option>
                        <option value="per_variant">
                          {t("saleStockPerVariant")}
                        </option>
                      </>
                    )}
                  </Select>
                </Field>
              )}
              {mode === "measure" && !modeLocked && (
                <Field label={t("saleStockUnit")}>
                  <Select
                    value={unit}
                    disabled={modeLocked}
                    onChange={(event) => setUnit(event.target.value)}
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                  </Select>
                </Field>
              )}
              {fields.map((field) => (
                <Field key={field.id} label={field.label}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={2147483647}
                    step={1}
                    value={quantities[field.id] ?? ""}
                    placeholder={variant ? "∞" : "0"}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
              {variant && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("carteVariantUnlimitedHint")}
                </p>
              )}
              <p className="text-xs text-[var(--fg-muted)]">
                {t("carteRemainingStockHint")}
              </p>
              {!valid && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("cartePositiveStockHint")}
                </p>
              )}
            </div>
          )}
          <ChoiceRow
            type="radio"
            name={name}
            value="auto"
            checked={choice === "auto"}
            onChange={() => setChoice("auto")}
            label={t("carteChoiceAutomatic")}
          />
        </fieldset>
        {error && (
          <div className="py-3">
            <p role="alert" className="text-sm text-[var(--danger-500)]">
              {error}
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void onReload()}
            >
              {t("carteReloadStock")}
            </Button>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--line)] p-4">
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          {t("carteApplyAvailabilityHint")}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {t("apply")}
          </Button>
        </div>
      </div>
    </form>
  );
}
