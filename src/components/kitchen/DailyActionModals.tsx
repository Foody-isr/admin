"use client";

import { useState } from "react";
import { KitchenDrawer } from "./KitchenDrawer";
import { Check, ArrowRight, Package } from "lucide-react";
import styles from "./companion.module.css";
import { NumberInput } from "@/components/ui/NumberInput";
import { useI18n } from "@/lib/i18n";
import {
  previewPrepBatch,
  producePrepBatch,
  receivePurchaseOrder,
  type DailyPlanItem,
  type ProduceBatchResult,
  type PurchaseOrder,
} from "@/lib/api";

/** Confirms completed production after checking the raw ingredients it consumes. */
export function DailyProductionModal({
  rid,
  item,
  onClose,
  onSaved,
}: {
  rid: number;
  item: DailyPlanItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState(
    item.batches_needed * item.yield_per_batch,
  );
  const [preview, setPreview] = useState<ProduceBatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const run = async (confirm: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (confirm) {
        await producePrepBatch(rid, item.prep_item_id, { quantity });
        setSaved(true);
        await onSaved();
        onClose();
      } else {
        setPreview(
          await previewPrepBatch(rid, item.prep_item_id, { quantity }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KitchenDrawer
      title={item.prep_item_name}
      description={t("dailyProductionHint")}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {saved ? (
            <p className={styles.success}>
              <Check size={16} />
              {t("dailyProductionSaved")}
            </p>
          ) : (
            <button
              className={styles.primaryButton}
              disabled={
                busy ||
                !Number.isFinite(quantity) ||
                quantity <= 0 ||
                (preview?.insufficient ?? []).length > 0
              }
              onClick={() => run(preview != null)}
            >
              {busy
                ? t("saving")
                : preview
                  ? t("dailyConfirmProduction")
                  : t("kwBatchPreview")}
              {preview ? <Check size={16} /> : <ArrowRight size={16} />}
            </button>
          )}
        </>
      }
    >
      <div className={styles.batchContext}>
        <div>
          <span>{t("current")}</span>
          <b>
            {item.current_qty} <small>{item.unit}</small>
          </b>
        </div>
        <div>
          <span>{t("companionToProduce")}</span>
          <b>
            {item.shortfall_qty} <small>{item.unit}</small>
          </b>
        </div>
      </div>
      <section className={styles.batchStep}>
        <h3>{t("kwBatchStepOne")}</h3>
        <label>
          {t("quantityToProduce").replace("{unit}", item.unit)}
          <NumberInput
            min={item.unit === "unit" ? 1 : 0.01}
            integer={item.unit === "unit"}
            value={quantity}
            disabled={busy || saved}
            onChange={(value) => {
              setQuantity(value);
              setPreview(null);
            }}
          />
        </label>
        <p>
          {item.yield_per_batch} {item.unit} / {t("batches")}
        </p>
      </section>
      <section className={styles.batchStep}>
        <h3>{t("kwBatchStepTwo")}</h3>
        {preview ? (
          <>
            <dl className={styles.ledger}>
              {(preview.ingredients ?? []).map((ingredient) => (
                <div key={ingredient.stock_item_id}>
                  <dt>{ingredient.stock_item_name}</dt>
                  <dd>
                    −
                    {ingredient.quantity_used.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}{" "}
                    {ingredient.unit}
                  </dd>
                </div>
              ))}
            </dl>
            {(preview.insufficient ?? []).length > 0 && (
              <p role="alert" className={styles.error}>
                {t("insufficientStock")}
              </p>
            )}
          </>
        ) : (
          <div className={styles.quietEmpty}>
            <Package size={20} />
            <p>{t("kwBatchPreview")}</p>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </KitchenDrawer>
  );
}

/** Reviews every supplier line before recording a delivery against a Foody order. */
export function DailyReceiptModal({
  rid,
  order,
  onClose,
  onSaved,
}: {
  rid: number;
  order: PurchaseOrder;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [quantities, setQuantities] = useState(
    order.items.map((item) => item.quantity),
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await receivePurchaseOrder(
        rid,
        order.id,
        order.items.map((item, index) => ({
          item_id: item.id,
          received_qty: quantities[index],
        })),
      );
      setSaved(true);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KitchenDrawer
      title={`${t("receiveOrder")} · ${order.supplier?.name ?? ""}`}
      description={t("dailyReceiptHint")}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {saved ? (
            <span className={styles.success}>
              <Check size={16} />
              {t("received")}
            </span>
          ) : (
            <button
              className={styles.primaryButton}
              disabled={
                busy ||
                order.items.length === 0 ||
                checked.size !== order.items.length ||
                quantities.some((value) => !Number.isFinite(value) || value < 0)
              }
              onClick={confirm}
            >
              {busy ? t("saving") : t("confirmReceive")}
              <Check size={16} />
            </button>
          )}
        </>
      }
    >
      <div className={styles.receiptProgress}>
        <span>PO-{order.id}</span>
        <strong>
          {t("kwReceiptProgress")
            .replace("{count}", String(checked.size))
            .replace("{total}", String(order.items.length))}
        </strong>
        <progress value={checked.size} max={Math.max(1, order.items.length)} />
      </div>
      {order.items.map((item, index) => (
        <div
          key={item.id}
          className={styles.receiptCheckRow}
          data-checked={checked.has(item.id)}
        >
          <input
            type="checkbox"
            disabled={busy || saved}
            aria-label={`${t("dailyLineChecked")}: ${item.name}`}
            checked={checked.has(item.id)}
            onChange={(event) =>
              setChecked((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(item.id);
                else next.delete(item.id);
                return next;
              })
            }
          />
          <div>
            <strong>{item.name}</strong>
            <small>
              {t("ordered")}: {item.quantity} {item.unit}
            </small>
          </div>
          <label>
            {t("received")}
            <NumberInput
              value={quantities[index]}
              format={String}
              min={0}
              disabled={busy || saved}
              aria-label={`${t("received")}: ${item.name}`}
              onChange={(value) => {
                setQuantities((current) =>
                  current.map((q, i) => (i === index ? value : q)),
                );
                setChecked((current) => {
                  const next = new Set(current);
                  next.delete(item.id);
                  return next;
                });
              }}
            />
          </label>
        </div>
      ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </KitchenDrawer>
  );
}
