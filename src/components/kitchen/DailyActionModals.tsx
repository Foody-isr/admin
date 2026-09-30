'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { previewPrepBatch, producePrepBatch, receivePurchaseOrder, type DailyPlanItem, type ProduceBatchResult, type PurchaseOrder } from '@/lib/api';

/** Confirms completed production after checking the raw ingredients it consumes. */
export function DailyProductionModal({ rid, item, onClose, onSaved }: {
  rid: number; item: DailyPlanItem; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState(item.batches_needed * item.yield_per_batch);
  const [preview, setPreview] = useState<ProduceBatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const run = async (confirm: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (confirm) {
        await producePrepBatch(rid, item.prep_item_id, { quantity });
        setSaved(true);
        await onSaved();
        onClose();
      } else {
        setPreview(await previewPrepBatch(rid, item.prep_item_id, { quantity }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={item.prep_item_name} onClose={() => { if (!busy) onClose(); }}>
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">{t('dailyProductionHint')}</p>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <label className="block text-sm">
          {t('quantityToProduce').replace('{unit}', item.unit)}
          <NumberInput min={item.unit === 'unit' ? 1 : 0.01} integer={item.unit === 'unit'} value={quantity}
            disabled={busy || saved} className="input mt-2 w-full" onChange={(value) => { setQuantity(value); setPreview(null); }} />
        </label>
        {preview && (
          <div className="divide-y divide-[var(--line)] text-sm">
            {(preview.ingredients ?? []).map((ingredient) => (
              <div key={ingredient.stock_item_id} className="flex justify-between gap-3 py-2">
                <span>{ingredient.stock_item_name}</span><span className="tabular-nums">−{ingredient.quantity_used.toFixed(2)} {ingredient.unit}</span>
              </div>
            ))}
            {(preview.insufficient ?? []).length > 0 && <p role="alert" className="py-3 text-red-500">{t('insufficientStock')}</p>}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>
          {!saved && <button className="btn-primary" disabled={busy || quantity <= 0 || (preview?.insufficient ?? []).length > 0}
            onClick={() => run(preview != null)}>{busy ? t('saving') : preview ? t('dailyConfirmProduction') : t('preview')}</button>}
          {saved && <p className="text-sm text-green-600">{t('dailyProductionSaved')}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Reviews every supplier line before recording a delivery against a Foody order. */
export function DailyReceiptModal({ rid, order, onClose, onSaved }: {
  rid: number; order: PurchaseOrder; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [quantities, setQuantities] = useState(order.items.map((item) => item.quantity));
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await receivePurchaseOrder(rid, order.id, order.items.map((item, index) => ({ item_id: item.id, received_qty: quantities[index] })));
      setSaved(true);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`${t('receiveOrder')} · ${order.supplier?.name ?? ''}`} onClose={() => { if (!busy) onClose(); }} size="xl">
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">{t('dailyReceiptHint')}</p>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="divide-y divide-[var(--line)]">
          {order.items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_100px] items-center gap-3 py-3">
              <input type="checkbox" disabled={busy || saved} aria-label={`${t('dailyLineChecked')}: ${item.name}`} checked={checked.has(item.id)}
                onChange={(event) => setChecked((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />
              <div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-fg-secondary">{t('ordered')}: {item.quantity} {item.unit}</p></div>
              <NumberInput value={quantities[index]} min={0} disabled={busy || saved} aria-label={`${t('received')}: ${item.name}`}
                onChange={(value) => { setQuantities((current) => current.map((q, i) => i === index ? value : q)); setChecked((current) => { const next = new Set(current); next.delete(item.id); return next; }); }} className="input w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={onClose}>{t('close')}</button>
          {!saved && <button className="btn-primary" disabled={busy || order.items.length === 0 || checked.size !== order.items.length}
            onClick={confirm}>{busy ? t('saving') : t('confirmReceive')}</button>}
        </div>
      </div>
    </Modal>
  );
}
