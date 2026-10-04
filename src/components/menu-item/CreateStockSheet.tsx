'use client';

import { useId, useRef, useState } from 'react';
import { Package } from 'lucide-react';
import { Button, Input, Select, Field, NumberField } from '@/components/ds';
import Modal from '@/components/Modal';
import { createStockItem, type StockItem, type StockUnit } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
interface Props {
  restaurantId: number;
  itemName: string;
  initialName: string;
  onCreated: (item: StockItem) => void | Promise<void>;
  onCancel: () => void;
}

/** Creates a stock ingredient inside the recipe editor with recoverable errors. */
export default function CreateStockSheet({ restaurantId, itemName, initialName, onCreated, onCancel }: Props) {
  const { t } = useI18n(); const { symbol } = useCurrency();
  const { hasAnyPermission } = usePermissions(); const canCreate = hasAnyPermission('kitchen.manage');
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<StockUnit>('kg');
  const [cost, setCost] = useState(0); const [category, setCategory] = useState(''); const [supplier, setSupplier] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [created, setCreated] = useState<StockItem | null>(null);
  const lock = useRef(false); const firstInput = useRef<HTMLInputElement>(null); const formId = useId();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canCreate || lock.current || !name.trim()) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const stock = created ?? await createStockItem(restaurantId, {name:name.trim(),unit,cost_per_unit:cost,category:category.trim(),supplier:supplier.trim(),is_active:true});
      setCreated(stock); await onCreated(stock);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Modal title={t('itemRecipeCreateRaw')} subtitle={t('itemRecipeRawHint')} icon={<Package/>} size="lg" initialFocusRef={firstInput} onClose={() => { if (!lock.current) onCancel(); }} footer={<div className="space-y-3"><p className="text-sm text-fg-secondary">{t('itemRecipeCreateUseHint').replace('{name}',itemName)}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={onCancel}>{t('cancel')}</Button><Button type="submit" form={formId} disabled={!canCreate || saving || !name.trim()}>{t(saving?'creating':created?'retry':'itemRecipeCreateUse')}</Button></div></div>}>
    <form id={formId} onSubmit={submit}><fieldset disabled={saving || !canCreate || !!created} className="min-w-0 space-y-4">
      <Field label={t('name')}><Input ref={firstInput} className="min-h-11" value={name} onChange={event=>setName(event.target.value)} required/></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={t('stockUnit')}><Select className="min-h-11" value={unit} onChange={event=>setUnit(event.target.value as StockUnit)}>{UNITS.map(value=><option key={value} value={value}>{value}</option>)}</Select></Field><Field label={`${t('costPerUnit')} (${symbol}/${unit})`}><NumberField className="min-h-11" min={0} value={cost} onChange={setCost} placeholder="0.00"/></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={t('category')} hint={t('optional')}><Input className="min-h-11" value={category} onChange={event=>setCategory(event.target.value)}/></Field><Field label={t('supplier')} hint={t('optional')}><Input className="min-h-11" value={supplier} onChange={event=>setSupplier(event.target.value)}/></Field></div>
    </fieldset></form>
    {created && <p role="status" className="mt-4 text-sm text-fg-secondary">{t('itemRecipeCreatedPartial')}</p>}{error && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
  </Modal>;
}
