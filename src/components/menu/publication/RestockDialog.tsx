"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, Field, Input } from "@/components/ds";
import { useI18n } from "@/lib/i18n";
import type { SaleStockLimit, SaleStockRow } from "@/lib/api";

/** Sets remaining sale quantities; the API adds committed orders under its lock. */
export function RestockDialog({ row, busy, error, onClose, onApply }: {
 row: SaleStockRow; busy: boolean; error: string; onClose: () => void;
 onApply: (input: SaleStockLimit) => Promise<boolean | undefined>;
}) {
 const { t } = useI18n();
 const mode = row.config?.mode || row.item.stock_mode;
 const variant = mode === "per_variant";
 const counters = row.config?.counters ?? [];
 const [quantities, setQuantities] = useState<Record<number, string>>(() => Object.fromEntries(
   (variant ? row.sizes.map(size => size.id) : [0]).map(id => {
     const counter = counters.find(value => value.option_id === id);
     return [id, String(counter?.initial_quantity == null ? 0 : Math.max(0, counter.initial_quantity - counter.committed))];
   }),
 ));
 const valid = Object.values(quantities).every(value => /^\d+$/.test(value) && Number(value) <= 2147483647) && Object.values(quantities).some(value => Number(value) > 0);
 const stockUnit = row.config?.unit || row.item.stock_unit || "g";
 const unit = mode === "measure" ? stockUnit === "kg" ? "g" : stockUnit === "l" ? "ml" : stockUnit : "";
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
   <DialogContent className="max-w-md" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
     <DialogHeader><DialogTitle>{t("carteRestockTitle")}</DialogTitle><DialogDescription>{t("carteRestockHint")}</DialogDescription></DialogHeader>
     <p className="font-semibold">{row.item.name}</p>
     {(variant ? row.sizes.map(size => ({ id: size.id, name: size.name })) : [{ id: 0, name: t("carteRestockQuantity") + (unit ? ` (${unit})` : "") }]).map(field => <Field key={field.id} label={field.name}>
       <Input type="number" inputMode="numeric" min={0} max={2147483647} step={1} value={quantities[field.id] ?? "0"} disabled={busy}
         onChange={event => setQuantities(current => ({ ...current, [field.id]: event.target.value }))} />
     </Field>)}
     <p className="text-sm text-[var(--fg-muted)]">{t("carteRestockImmediate")}</p>
     {error && <p role="alert" className="text-[var(--danger-500)]">{error}</p>}
     <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>{t("cancel")}</Button>
       <Button disabled={busy || !valid} onClick={() => void onApply({ menu_item_id: row.item.id, mode: mode as SaleStockLimit["mode"], unit,
         override: "auto", expected_revision: row.config?.revision ?? 0, reason: t("carteRestockReason"),
         quantity: variant ? null : Number(quantities[0]), options: variant ? Object.fromEntries(Object.entries(quantities).map(([id,value]) => [id, Number(value)])) : undefined,
       }).then(applied => { if (applied) onClose(); })}>{t("carteRestockAction")}</Button></div>
   </DialogContent>
 </Dialog>;
}
