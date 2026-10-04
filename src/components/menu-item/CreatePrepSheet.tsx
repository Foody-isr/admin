'use client';

import { useId, useRef, useState } from 'react';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, Field, NumberField } from '@/components/ds';
import Modal from '@/components/Modal';
import { createPrepItem, setPrepIngredients, type PrepItem, type StockItem, type StockUnit } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'portion' as StockUnit];
interface Draft { id: string; stock_item_id: number | null; quantity: number; }
interface Props { restaurantId: number; menuItemName: string; initialName: string; stockItems: StockItem[]; onCreated: (prep: PrepItem) => void | Promise<void>; onCancel: () => void; }

/** Creates a preparation once and resumes unfinished ingredient writes on retry. */
export default function CreatePrepSheet({ restaurantId, menuItemName, initialName, stockItems, onCreated, onCancel }: Props) {
  const { t } = useI18n(); const { money } = useCurrency();
  const { hasAnyPermission } = usePermissions(); const canCreate = hasAnyPermission('kitchen.manage');
  const [name,setName] = useState(initialName); const [yieldQty,setYieldQty] = useState(1); const [unit,setUnit] = useState<StockUnit>('kg'); const [dlcDays,setDlcDays] = useState(3);
  const [drafts,setDrafts] = useState<Draft[]>([{id:crypto.randomUUID(),stock_item_id:null,quantity:0}]);
  const [saving,setSaving] = useState(false); const [error,setError] = useState(''); const [created,setCreated] = useState<PrepItem | null>(null);
  const ingredientSaved = useRef(false); const lock = useRef(false); const firstInput = useRef<HTMLInputElement>(null); const formId = useId();
  const validDrafts = drafts.filter(draft=>draft.stock_item_id !== null && draft.quantity>0);
  // Preserve the existing preview: native stock-unit quantities × cost/unit.
  const totalCost = validDrafts.reduce((sum,draft)=>sum+draft.quantity*(stockItems.find(item=>item.id===draft.stock_item_id)?.cost_per_unit || 0),0);
  const costPerUnit = totalCost / Math.max(yieldQty,0.00001);
  const updateDraft = (id:string,patch:Partial<Draft>) => setDrafts(current=>current.map(draft=>draft.id===id?{...draft,...patch}:draft));
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); if (!canCreate || lock.current || !name.trim() || yieldQty<=0) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const prep = created ?? await createPrepItem(restaurantId,{name:name.trim(),unit,yield_per_batch:yieldQty,shelf_life_hours:dlcDays>0?dlcDays*24:0,is_active:true});
      setCreated(prep);
      if (!ingredientSaved.current && validDrafts.length>0) await setPrepIngredients(restaurantId,prep.id,validDrafts.map(draft=>({stock_item_id:draft.stock_item_id!,quantity_needed:draft.quantity})));
      ingredientSaved.current = true; await onCreated(prep);
    } catch (cause) { setError(cause instanceof Error?cause.message:t('saveFailed')); }
    finally { lock.current=false; setSaving(false); }
  };
  return <Modal title={t('newPreparation')} subtitle={t('itemRecipePrepHint')} icon={<FlaskConical/>} size="2xl" initialFocusRef={firstInput} onClose={()=>{if(!lock.current)onCancel();}} footer={<div className="space-y-3"><p className="text-sm text-fg-secondary">{t('itemRecipeCreateUseHint').replace('{name}',menuItemName)}</p><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={onCancel}>{t('cancel')}</Button><Button type="submit" form={formId} disabled={!canCreate||saving||!name.trim()||yieldQty<=0}>{t(saving?'creating':created?'retry':'itemRecipeCreateUse')}</Button></div></div>}>
    <form id={formId} onSubmit={submit}><fieldset disabled={saving||!canCreate||!!created} className="min-w-0 space-y-5">
      <Field label={t('name')}><Input ref={firstInput} className="min-h-11" value={name} onChange={event=>setName(event.target.value)} required/></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Field label={t('yieldPerBatch')}><NumberField className="min-h-11" min={0} value={yieldQty} onChange={setYieldQty}/></Field><Field label={t('unit')}><Select className="min-h-11" value={unit} onChange={event=>setUnit(event.target.value as StockUnit)}>{UNITS.map(value=><option key={value} value={value}>{value}</option>)}</Select></Field><Field label={`${t('shelfLife')} (${t('days')})`}><NumberField className="min-h-11" integer min={0} value={dlcDays} onChange={setDlcDays}/></Field></div>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{t('ingredients')}</h4><Button type="button" variant="secondary" onClick={()=>setDrafts(current=>[...current,{id:crypto.randomUUID(),stock_item_id:null,quantity:0}])}><Plus size={16}/>{t('add')}</Button></div>
      {drafts.map((draft,index)=>{const picked=stockItems.find(item=>item.id===draft.stock_item_id);return <div key={draft.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-r-md border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"><Field label={`${t('ingredient')} ${index+1}`} className="col-span-2 sm:col-span-1"><Select className="min-h-11" value={draft.stock_item_id??''} onChange={event=>updateDraft(draft.id,{stock_item_id:event.target.value?Number(event.target.value):null})}><option value="">{t('select')}</option>{stockItems.filter(item=>item.is_active!==false).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label={`${t('quantity')} ${index+1}${picked?` (${picked.unit})`:''}`}><NumberField className="min-h-11" value={draft.quantity} onChange={quantity=>updateDraft(draft.id,{quantity})} min={0} placeholder="0"/></Field><Button type="button" variant="ghost" icon aria-label={`${t('remove')} ${index+1}`} disabled={drafts.length<=1} onClick={()=>setDrafts(current=>current.filter(value=>value.id!==draft.id))}><Trash2 size={18}/></Button></div>;})}
      </section>
      <div className="flex flex-wrap justify-between gap-4 rounded-r-md bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]"><div><p className="text-sm">{t('itemRecipePrepCost')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totalCost)}</p></div><div><p className="text-sm">{t('costPerUnit')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(costPerUnit)} / {unit}</p></div></div>
    </fieldset></form>
    {created&&<p role="status" className="mt-4 text-sm text-fg-secondary">{t('itemRecipeCreatedPartial')}</p>}{error&&<p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
  </Modal>;
}
