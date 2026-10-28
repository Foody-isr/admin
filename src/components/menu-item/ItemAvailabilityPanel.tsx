"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import Link from "next/link";
import { Box } from "lucide-react";
import {
  getSalesStock,
  listAvailabilityRules,
  previewItemAvailability,
  updateMenuItem,
  type SaleStockRow,
  type AvailabilityRule,
  type AvailabilityPreview,
  type MenuItem,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions-context";
import {
  preparationSummary,
  type ItemPreparationDraft,
} from "@/lib/item-preparation";
import { ProductSalesStock } from "@/components/menu/publication/ProductSalesStock";
import { AvailabilityCapacityCard } from "./AvailabilityCapacityCard";
import { ItemSettingsDialog } from "./ItemSettingsDialog";
import { ItemPreparationDialog } from "./ItemPreparationDialog";

/** Persists only the independent preparation draft with the product Save action. */
export interface ItemAvailabilityPanelHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}
interface Props {
  rid: number;
  itemId: number;
  item: MenuItem;
  defaultLeadMinutes?: number;
  inheritedRuleId?: number | null;
  onSaved?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

const ItemAvailabilityPanel = forwardRef<ItemAvailabilityPanelHandle, Props>(
  function ItemAvailabilityPanel(
    {
      rid,
      itemId,
      item,
      defaultLeadMinutes = 0,
      inheritedRuleId,
      onSaved,
      onDirtyChange,
    },
    ref,
  ) {
    const { t, locale } = useI18n();
    const { hasAnyPermission } = usePermissions();
    const canEdit = hasAnyPermission("menu.edit");
    const [preparation, setPreparation] = useState<ItemPreparationDraft>({
      leadMinutes: item.preparation_lead_time_minutes ?? null,
      schedule: item.preparation_schedule ?? null,
      saleMode: item.immediate_sale_mode ?? "",
    });
    const [saved, setSaved] = useState(preparation);
    const dirty = JSON.stringify(saved) !== JSON.stringify(preparation);
    const [row, setRow] = useState<SaleStockRow | null>(null);
    const [date, setDate] = useState("");
    const [rules, setRules] = useState<AvailabilityRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [prepOpen, setPrepOpen] = useState(false);
    const [capacityOpen, setCapacityOpen] = useState(false);
    const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
    const [previewFailed, setPreviewFailed] = useState(false);
    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    const loadPreview = useCallback(
      async (seriesKey = "") => {
        setPreviewFailed(false);
        try {
          setPreview(await previewItemAvailability(rid, itemId, seriesKey));
        } catch {
          setPreview(null);
          setPreviewFailed(true);
        }
      },
      [rid, itemId],
    );
    useEffect(() => {
      let alive = true;
      setLoading(true);
      setLoadError(false);
      Promise.all([listAvailabilityRules(rid), getSalesStock(rid, "", itemId)])
        .then(([profiles, overview]) => {
          if (!alive) return;
          const current = overview.rows.find(
            (value) => value.item.id === itemId,
          );
          if (!current) throw new Error("Missing product stock");
          setRules(profiles);
          setRow(current);
          setDate(overview.series_key);
          void loadPreview(current.managed ? overview.series_key : "");
        })
        .catch(() => {
          if (alive) setLoadError(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [rid, itemId, attempt, loadPreview]);
    const save = useCallback(async () => {
      if (!canEdit || !dirty) return;
      await updateMenuItem(rid, itemId, {
        preparation_lead_time_minutes: preparation.leadMinutes,
        preparation_schedule: preparation.schedule,
        immediate_sale_mode: preparation.saleMode,
      });
      setSaved(preparation);
      await loadPreview(row?.managed ? date : "");
      await onSaved?.();
    }, [
      canEdit,
      dirty,
      rid,
      itemId,
      preparation,
      loadPreview,
      onSaved,
      row?.managed,
      date,
    ]);
    useImperativeHandle(ref, () => ({ save, isDirty: () => dirty }), [
      save,
      dirty,
    ]);
    const readyEligible =
      !!row &&
      !row.item.stock_from_recipe &&
      !row.config?.stock_from_recipe &&
      (row.config?.mode ||
        row.item.stock_mode ||
        (row.item.stock_quantity != null ? "count" : "")) === "count";
    if (loading) return <p role="status">{t("loading")}</p>;
    if (loadError || !row)
      return (
        <div role="alert">
          <p>{t("itemAvailabilityLoadRequired")}</p>
          <button
            type="button"
            className="item-settings-link"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("retry")}
          </button>
        </div>
      );
    return (
      <div className="item-fulfillment-settings">
        <ProductSalesStock
          rid={rid}
          date={date}
          row={row}
          onUpdate={(current) => {
            setRow(current);
            void loadPreview(current.managed ? date : "");
          }}
          ruleSelection={{
            value: row.item.availability_rule_id ?? 0,
            options: rules,
            inheritedRuleId: inheritedRuleId ?? undefined,
            onSaved: (ruleId) =>
              setRow((current) =>
                current
                  ? {
                      ...current,
                      item: {
                        ...current.item,
                        availability_rule_id: ruleId || null,
                      },
                    }
                  : current,
              ),
          }}
        />
        <details className="py-3 text-sm">
          <summary className="cursor-pointer">{t("actions")}</summary>
          <div className="flex flex-wrap gap-4 py-2">
            <button
              type="button"
              className="item-settings-link"
              onClick={() => setCapacityOpen(true)}
            >
              {t("itemStockViewCalculation")}
            </button>
            <Link href={`/${rid}/settings/stock/availability`}>
              {t("availabilityManageRules")}
            </Link>
          </div>
        </details>
        <section className="item-execution-section">
          <h3>
            <span>
              <Box size={24} />
            </span>
            {t("itemPrepSection")}
          </h3>
          <div className="item-settings-row item-settings-row-plain item-preparation-row">
            <div>
              <h4>{t("itemPrepTitle")}</h4>
              <div className="item-preparation-summary">
                {preparationSummary(
                  preparation,
                  defaultLeadMinutes,
                  locale,
                  t,
                ).map((line, index) => (
                  <p key={index}>
                    {line.days && <strong>{line.days} : </strong>}
                    {line.preparation}
                    {line.deadline && <span>{line.deadline}</span>}
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              className="item-settings-link"
              onClick={() => setPrepOpen(true)}
            >
              {t("edit")}
            </button>
          </div>
        </section>
        {prepOpen && (
          <ItemPreparationDialog
            value={preparation}
            defaultLeadMinutes={defaultLeadMinutes}
            readyStockEligible={readyEligible}
            onClose={() => setPrepOpen(false)}
            onApply={(draft) => {
              setPreparation(draft);
              setPrepOpen(false);
            }}
          />
        )}
        {capacityOpen && (
          <ItemSettingsDialog
            title={t("itemStockViewCalculation")}
            onClose={() => setCapacityOpen(false)}
            onApply={() => setCapacityOpen(false)}
          >
            <AvailabilityCapacityCard
              preview={preview}
              failed={previewFailed}
            />
            <p className="item-settings-footnote">
              {t("itemStockSavedCalculation")}
            </p>
          </ItemSettingsDialog>
        )}
      </div>
    );
  },
);
export default ItemAvailabilityPanel;
