"use client";

import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { stockInputUnits, stockInputValue, convertStockInput } from "@/lib/sale-stock-input";
import { X } from "lucide-react";
import type {
  AvailabilityOverride,
  AvailabilityRule,
  AvailabilityState,
  SaleStockLimit,
  SaleStockRow,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, Select } from "@/components/ds";
import { ChoiceRow } from "@/components/ds/Selection";
import { AvailabilityPill } from "@/components/menu/AvailabilityPill";

/** Synchronizes the product rule after the stock dialog confirms persistence. */
export interface AvailabilityRuleSelection {
  value: number;
  options: Pick<AvailabilityRule, "id" | "name">[];
  onSaved: (ruleId: number) => void;
}

interface Props {
  row: SaleStockRow;
  series: boolean;
  open: boolean;
  canEdit: boolean;
  busy: boolean;
  error: string;
  ready?: boolean;
  loading?: boolean;
  contextLabel?: string;
  triggerLabel?: string;
  ruleSelection?: AvailabilityRuleSelection;
  onOpenChange: (open: boolean) => void;
  onReload: () => Promise<unknown>;
  onApply: (
    value: AvailabilityOverride | undefined,
    remaining?: SaleStockLimit,
    ruleId?: number,
  ) => Promise<boolean | undefined>;
}

/** Edits availability in a spacious, viewport-bounded dialog; opening never writes stock. */
export function AvailabilityPopover(props: Props) {
  const { t, direction } = useI18n();
  const title = useId();
  const pill = props.triggerLabel ? (
    <Button type="button" variant="secondary" disabled={!props.canEdit || props.busy}>{props.triggerLabel}</Button>
  ) : (
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
  if (!props.canEdit || (props.row.item.is_active === false && !props.ruleSelection)) return pill;
  return (
    <Dialog.Root
      modal
      open={props.open}
      onOpenChange={(open) => {
        if (!props.busy) props.onOpenChange(open);
      }}
    >
      <Dialog.Trigger asChild>{pill}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Content
          dir={direction}
          aria-labelledby={title}
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(860px,calc(100dvh-24px-var(--safe-top)-var(--safe-bottom)))] w-[640px] max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-lg outline-none [&_.choice-row]:min-h-11 [&_.choice-row]:py-2 [&_.choice-title]:text-sm"
          onEscapeKeyDown={(event) => {
            if (props.busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (props.busy) event.preventDefault();
          }}
        >
          {props.ready === false ? (
            <div className="space-y-3 p-4">
              <Dialog.Title id={title} className="font-semibold">
                {t("availability")}
              </Dialog.Title>
              <p role={props.error ? "alert" : "status"} className="text-sm">
                {props.loading ? t("loading") : props.error}
              </p>
              {!props.loading && (
                <Button variant="secondary" onClick={() => void props.onReload()}>
                  {t("carteReloadStock")}
                </Button>
              )}
            </div>
          ) : (
            <AvailabilityForm {...props} titleId={title} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  contextLabel,
  ruleSelection,
}: Props & { titleId: string }) {
  const { t } = useI18n();
  const name = useId();
  const ruleHintId = useId();
  const [ruleId, setRuleId] = useState(ruleSelection?.value ?? 0);
  const [ruleEdited, setRuleEdited] = useState(false);
  const [availabilityEdited, setAvailabilityEdited] = useState(false);
  const storedMode = row.config?.mode || row.item.stock_mode || "";
  const initialMode =
    storedMode === "measure" || storedMode === "per_variant"
      ? storedMode
      : "count";
  const override =
    row.config?.override ??
    (row.managed ? "auto" : (row.item.availability_override ?? "auto"));
  const [choice, setChoice] = useState<AvailabilityOverride | "stock">(
    override !== "auto" ? override : storedMode ? "stock" : "auto",
  );
  const [mode, setMode] = useState<SaleStockLimit["mode"]>(initialMode);
  const units = stockInputUnits(row.sizes);
  const storedUnit = row.config?.unit || row.item.stock_unit || units[0] || "g";
  const baseUnit = storedUnit === "kg" ? "g" : storedUnit === "l" ? "ml" : storedUnit;
  const [unit, setUnit] = useState(initialMode === "per_variant" ? "" : baseUnit);
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
            : row.item.option_sets
                ?.flatMap((set) => set.options ?? [])
                .find((s) => s.id === id)?.stock_remaining;
        return [id, remaining == null ? "" : String(remaining)];
      }),
    ),
  );
  const variant = mode === "per_variant";
  const inputUnit = mode === "count" ? "" : unit;
  const fields = variant
    ? row.sizes.map((size) => ({ id: size.id, label: size.name + (inputUnit ? ` (${inputUnit})` : "") }))
    : [
        {
          id: 0,
          label:
            t("carteRestockQuantity") +
            (inputUnit ? ` (${inputUnit})` : ""),
        },
      ];
  const values = fields.map((field) =>
    stockInputValue(
      quantities[field.id] ?? "",
      mode,
      inputUnit,
      row.sizes.find((size) => size.id === field.id),
    ),
  );
  const valid =
    choice !== "stock" ||
    (fields.length > 0 &&
      values.every((value) => value !== undefined) &&
      values.some((value) => value != null && value > 0) &&
      (mode !== "measure" || units.includes(unit)));
  const hasCommitments = series && (row.config?.counters ?? []).some(
    (counter) => counter.committed > 0,
  );
  const ruleOnlyEdit = !!ruleSelection && ruleEdited && !availabilityEdited;
  const canApply = ruleOnlyEdit || (row.item.is_active !== false && valid);
  function changeUnit(next: string) {
    setQuantities((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, value]) => [
          id,
          convertStockInput(
            value,
            inputUnit,
            next,
            variant ? row.sizes.find((size) => size.id === Number(id)) : undefined,
          ),
        ]),
      ),
    );
    setUnit(next);
  }
  async function apply() {
    if (busy || !canApply) return;
    // A rule-only save must not reapply the displayed stock or availability.
    if (ruleOnlyEdit) {
      if (await onApply(undefined, undefined, ruleId)) onOpenChange(false);
      return;
    }
    const remaining: SaleStockLimit | undefined =
      choice === "stock"
        ? {
            menu_item_id: row.item.id,
            mode,
            unit: mode === "measure" ? (unit === "kg" ? "g" : unit === "l" ? "ml" : unit) : "",
            override: "auto",
            expected_revision:
              row.config?.revision ??
              (series ? 0 : (row.item.stock_revision ?? 0)),
            reason: t("carteRestockReason"),
            quantity: variant ? null : values[0]!,
            options: variant
              ? Object.fromEntries(
                  row.sizes.map((size, index) => [size.id, values[index]!]),
                )
              : undefined,
          }
        : undefined;
    if (await onApply(choice === "stock" ? "auto" : choice, remaining, ruleEdited ? ruleId : undefined)) {
      onOpenChange(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void apply();
      }}
      className="flex min-h-0 flex-col text-start"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] p-4 sm:px-6">
        <div className="min-w-0">
          <Dialog.Title id={titleId} className="text-lg font-semibold">
            {t("availability")}
          </Dialog.Title>
          <p className="mt-1 break-words text-sm text-[var(--fg-muted)]">
            {row.item.name}
          </p>
          {contextLabel && (
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              {contextLabel}
            </p>
          )}
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6" data-availability-scroll>
        <fieldset disabled={busy || row.item.is_active === false} aria-label={t("availability")} onChange={() => setAvailabilityEdited(true)}>
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
          {
            <ChoiceRow
              type="radio"
              name={name}
              value="stock"
              checked={choice === "stock"}
              onChange={() => setChoice("stock")}
              label={t("carteChoiceStock")}
            />
          }
          {choice === "stock" && (
            <div className="space-y-3 border-b border-[var(--line)] py-3">
              {row.sizes.length > 0 && (
                <Field label={t("saleStockMode")}>
                  <Select
                    value={mode}
                    onChange={(event) => {
                      const next = event.target.value as SaleStockLimit["mode"];
                      setMode(next);
                      setUnit(next === "measure" ? units[0] : "");
                      setQuantities({});
                    }}
                  >
                    <option value="count">{t("saleStockCount")}</option>
                    {row.sizes.length > 0 && (
                      <>
                        {(units.length > 0 || mode === "measure") && <option value="measure">{t("saleStockMeasure")}</option>}
                        <option value="per_variant">
                          {t("saleStockPerVariant")}
                        </option>
                      </>
                    )}
                  </Select>
                </Field>
              )}
              {hasCommitments && mode !== storedMode && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("itemStockModeConversionHint")}
                </p>
              )}
              {(mode === "measure" || (variant && units.length > 0)) && (
                <Field label={t("itemStockInputUnit")}>
                  <Select
                    value={unit}
                    onChange={(event) => changeUnit(event.target.value)}
                  >
                    {variant && <option value="">{t("availabilityPortions")}</option>}
                    {units.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
              )}
              <div className={variant ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
                {fields.map((field, index) => (
                  <Field key={field.id} label={field.label}>
                    <Input
                      type="number"
                      aria-label={field.label}
                      inputMode={inputUnit ? "decimal" : "numeric"}
                      min={0}
                      max={2147483647}
                      step={inputUnit ? "any" : 1}
                      value={quantities[field.id] ?? ""}
                      placeholder={variant ? "∞" : "0"}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                    />
                    {variant && inputUnit && values[index] != null && (
                      <span className="text-xs text-[var(--fg-muted)]">
                        {t("itemStockPortionPreview")
                          .replace("{count}", String(values[index]))
                          .replace("{size}", row.sizes[index].name)}
                      </span>
                    )}
                  </Field>
                ))}
              </div>
              {variant && inputUnit && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("itemStockWholePortions")}
                </p>
              )}
              {variant && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("carteVariantUnlimitedHint")}
                </p>
              )}
              <p className="text-xs text-[var(--fg-muted)]">
                {t("carteRemainingStockHint")}
              </p>
              {!valid && !ruleOnlyEdit && row.item.is_active !== false && (
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
        {ruleSelection && (
          <div className="border-t border-[var(--line)] py-3">
            <Field label={t("itemStockAvailabilityRule")}>
              <Select
                aria-label={t("itemStockAvailabilityRule")}
                aria-describedby={ruleHintId}
                disabled={busy}
                value={ruleId}
                onChange={(event) => {
                  setRuleId(Number(event.target.value));
                  setRuleEdited(true);
                }}
              >
                <option value={0}>{t("none")}</option>
                {ruleSelection.options.map((rule) => (
                  <option key={rule.id} value={rule.id}>{rule.name}</option>
                ))}
              </Select>
              <p id={ruleHintId} className="text-xs text-[var(--fg-muted)]">{t("itemStockRuleScopeHint")}</p>
            </Field>
          </div>
        )}
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
      <div className="shrink-0 border-t border-[var(--line)] p-4 sm:px-6" data-availability-actions>
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          {t(ruleSelection ? "itemStockRuleApplyHint" : series ? "carteApplyAvailabilityHint" : "itemApplyAvailabilityHint")}
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
          <Button type="submit" disabled={busy || !canApply}>
            {t("apply")}
          </Button>
        </div>
      </div>
    </form>
  );
}
