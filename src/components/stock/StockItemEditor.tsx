'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Pencil, Plus, Ruler, Sparkles, Trash2 } from 'lucide-react';
import {
  createCustomUnit, createStockItem, listCustomUnits, updateStockItem, uploadStockItemImage,
  type CustomUnit, type StockItem, type StockItemAliasInput, type StockItemInput, type Supplier, type TranslationMap,
} from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import Modal from '@/components/Modal';
import SearchableListField from '@/components/SearchableListField';
import LocalizedOrderNameField from '@/components/i18n/LocalizedOrderNameField';
import type { Locale } from '@/components/i18n/LocaleTabs';
import { Badge, Button, ConfirmDialog, EditorSectionHead, Field, FullScreenEditor, Input, NumberField, Textarea } from '@/components/ds';
import IngredientIconPicker from './IngredientIconPicker';
import StockQuantityForm, { defaultStockInput, deriveTotals, serverToStockInput, stockInputToServer, type StockInput } from './StockQuantityForm';

interface Props {
  rid:number;editing?:StockItem;categories:string[];suppliers:Supplier[];sourceLocale:Locale;vatRate:number;vatDisplayMode:'ex'|'inc';onClose:()=>void;onSaved:()=>Promise<void>;
}

/** Stock identity, purchasing and recipe conversions saved as one recoverable editing session. */
export default function StockItemEditor({rid,editing,categories,suppliers,sourceLocale,vatRate,vatDisplayMode,onClose,onSaved}:Props) {
  const {t}=useI18n();
  const {money}=useCurrency();
  const {hasAnyPermission}=usePermissions();
  const canManage=hasAnyPermission('kitchen.manage');
  const [qty,setQty]=useState<StockInput>(()=>editing?serverToStockInput(editing):defaultStockInput());
  const [name,setName]=useState(editing?.name??'');
  const [translations,setTranslations]=useState<TranslationMap>(editing?.translations??{});
  const [sku,setSku]=useState(editing?.sku??'');
  const [aliases,setAliases]=useState<StockItemAliasInput[]>(()=>(editing?.aliases??[]).map(alias=>({alias:alias.alias,language:alias.language})));
  const [supplier,setSupplier]=useState(editing?.supplier??'');
  const [supplierId,setSupplierId]=useState<number|null>(editing?.supplier_id??null);
  const [category,setCategory]=useState(editing?.category??'');
  const [notes,setNotes]=useState(editing?.notes??'');
  const [reorder,setReorder]=useState(editing?.reorder_threshold??0);
  const [isActive,setIsActive]=useState(editing?.is_active??true);
  const [vatOverride,setVatOverride]=useState<number|null>(editing?.vat_rate_override??null);
  const [conversions,setConversions]=useState<Record<number,number>>(()=>Object.fromEntries((editing?.unit_conversions??[]).map(conversion=>[conversion.custom_unit_id,conversion.base_quantity])));
  const [units,setUnits]=useState<CustomUnit[]>([]);
  const [unitsLoading,setUnitsLoading]=useState(true);
  const [unitsError,setUnitsError]=useState('');
  const [unitsAttempt,setUnitsAttempt]=useState(0);
  const [unitEditor,setUnitEditor]=useState<{id?:number;name:string;quantity:number}|null>(null);
  const [removeUnit,setRemoveUnit]=useState<number|null>(null);
  const [imageUrl,setImageUrl]=useState(editing?.image_url??'');
  const [pendingFile,setPendingFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [imageError,setImageError]=useState('');
  const [iconPicker,setIconPicker]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const [saving,setSaving]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const lock=useRef(false);
  // Each confirmed API step is retained so retry never creates the stock item or uploads twice.
  const receipt=useRef<{item:StockItem;uploadedUrl?:string;imageSaved:boolean}|null>(null);
  const frozen=!canManage||saving||confirmed;
  const fingerprint=JSON.stringify({qty,name,translations,sku,aliases,supplier,supplierId,category,notes,reorder,isActive,vatOverride,conversions,imageUrl});
  const initial=useRef(fingerprint);
  const dirty=fingerprint!==initial.current||!!pendingFile;
  const pendingImage=!!pendingFile&&!receipt.current?.imageSaved;
  const close=()=>{
    if(lock.current)return;
    if(canManage&&((dirty&&!receipt.current)||pendingImage))setDiscard(true);else onClose();
  };
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(canManage&&((dirty&&!receipt.current)||pendingImage||lock.current)){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,pendingImage,canManage]);
  useEffect(()=>{
    let active=true;setUnitsLoading(true);setUnitsError('');
    listCustomUnits(rid).then(result=>{if(active)setUnits(result);}).catch(cause=>{if(active)setUnitsError(cause instanceof Error?cause.message:t('workspaceLoadError'));}).finally(()=>{if(active)setUnitsLoading(false);});
    return()=>{active=false;};
  },[rid,unitsAttempt,t]);
  useEffect(()=>{
    if(!pendingFile){setPreview('');return;}
    const url=URL.createObjectURL(pendingFile);setPreview(url);return()=>URL.revokeObjectURL(url);
  },[pendingFile]);
  const pickImage=(file:File)=>{
    if(frozen)return;
    setImageError('');
    if(!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)||file.size>5*1024*1024){setImageError(t('stockImageRequirements'));return;}
    setPendingFile(file);
  };
  const save=async()=>{
    if(!canManage||lock.current||(!receipt.current&&(!name.trim()||unitsLoading||unitsError)))return;
    lock.current=true;setSaving(true);setError('');
    try{
      if(!receipt.current){
        const payload:StockItemInput={
          name:name.trim(),translations,...stockInputToServer(qty),reorder_threshold:reorder,supplier,supplier_id:supplierId,category,notes,sku:sku.trim(),
          aliases:aliases.map(alias=>({alias:alias.alias.trim(),language:alias.language.trim()})).filter(alias=>alias.alias!==''),
          is_active:isActive,vat_rate_override:vatOverride,image_url:imageUrl,
          unit_conversions:Object.entries(conversions).map(([id,quantity])=>({custom_unit_id:Number(id),base_quantity:quantity})).filter(conversion=>conversion.base_quantity>0),
        };
        const item=editing?await updateStockItem(rid,editing.id,payload):await createStockItem(rid,payload);
        receipt.current={item,imageSaved:!pendingFile};setConfirmed(true);
      }
      if(pendingFile&&!receipt.current.imageSaved){
        const saved=receipt.current;
        if(!saved.uploadedUrl)saved.uploadedUrl=await uploadStockItemImage(rid,saved.item.id,pendingFile);
        saved.item=await updateStockItem(rid,saved.item.id,{image_url:saved.uploadedUrl});saved.imageSaved=true;
      }
      await onSaved();onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(false);}
  };
  const total=deriveTotals(qty);
  const image=preview||imageUrl;
  const rows=Object.entries(conversions).filter(([,amount])=>amount>0).map(([key,amount])=>{
    const id=Number(key);const unit=units.find(value=>value.id===id)??editing?.unit_conversions?.find(value=>value.custom_unit_id===id)?.custom_unit;
    return {id,amount,name:unit?.name??`${t('unit')} #${id}`,abbreviation:unit?.abbreviation};
  });
  const rail=<fieldset disabled={frozen} className="min-w-0 space-y-5">
    <div className="relative overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)]" onDragOver={event=>{if(!frozen)event.preventDefault();}} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files[0];if(file)pickImage(file);}}>
      <div className="grid aspect-[4/3] place-items-center">
        {image?/* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt={name} className="size-full object-cover"/>:<ImageIcon aria-hidden className="size-12 text-fg-tertiary"/>}
      </div>
      <div className="absolute start-3 top-3"><Badge tone={isActive?'success':'neutral'}>{t(isActive?'active':'inactive')}</Badge></div>
    </div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)pickImage(file);event.target.value='';}}/>
    {canManage&&<div className="space-y-2"><div className="flex flex-wrap gap-2"><Button type="button" size="lg" variant="secondary" onClick={()=>fileInput.current?.click()}><Camera/>{t('editImage')}</Button><Button type="button" size="lg" variant="secondary" onClick={()=>setIconPicker(true)}><Sparkles/>{t('pickFromLibrary')}</Button></div><p className="text-xs text-fg-secondary">{t('stockImageRequirements')}</p></div>}
    {imageError&&<p role="alert" className="text-sm text-[var(--danger-500)]">{imageError}</p>}
    <div><h2 className="break-words text-xl font-semibold">{name||t('addStockItem')}</h2>{category&&<p className="mt-1 break-words text-sm text-fg-secondary">{category}</p>}</div>
    <dl className="space-y-3 border-y border-[var(--line)] py-4 text-sm">
      <div><dt className="text-fg-secondary">{t('stockCurrentQuantity')}</dt><dd className="mt-1 font-semibold"><bdi dir="ltr">{editing?.quantity??0} {editing?.unit??total.baseUnit}</bdi></dd></div>
      <div><dt className="text-fg-secondary">{t('value')} · {t('exVat')}</dt><dd className="mt-1 break-all font-semibold"><bdi>{money((editing?.quantity??0)*(editing?.cost_per_unit??0))}</bdi></dd></div>
    </dl>
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span>{t('active')}</span><input className="size-5 accent-[var(--brand-action)]" type="checkbox" checked={isActive} onChange={event=>setIsActive(event.target.checked)}/></label>
    <Field label={t('notes')}><Textarea rows={3} value={notes} onChange={event=>setNotes(event.target.value)}/></Field>
  </fieldset>;
  return <>
    <FullScreenEditor open onOpenChange={value=>{if(!value)close();}} closeDisabled={saving} title={t(editing?'editStockItem':'addStockItem')} subtitle={editing?.name}
      onSave={canManage?save:undefined} saveLabel={t(saving?'saving':confirmed?'retry':editing?'update':'create')} saveDisabled={saving||(!confirmed&&(!name.trim()||unitsLoading||!!unitsError))} cancelLabel={t(confirmed?'close':'cancel')} rail={rail}
      footer={(error||confirmed)?<div className="space-y-2">{confirmed&&<p role="status" className="text-sm">{t(pendingImage?'stockItemSavedImagePending':'stockItemSavedRefresh')}</p>}{error&&<p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}</div>:undefined}>
      <fieldset disabled={frozen} className="min-w-0 max-w-3xl space-y-7">
        <section className="space-y-4"><EditorSectionHead title={t('identityAndPurchase')}/><h3 className="text-sm font-semibold">{t('orderItemNames')}</h3><p className="text-sm text-fg-secondary">{t('orderItemNamesHelp')}</p>
          <LocalizedOrderNameField sourceLocale={sourceLocale} name={name} translations={translations} onNameChange={setName} onTranslationsChange={setTranslations}/>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label={t('category')}><SearchableListField mode="single" allowCustom placeholder={t('category')} options={categories.map(value=>({value,label:value}))} value={category} onChange={setCategory}/></Field>
            <Field label={t('sku')} hint={t('skuHelp')}><Input className="min-h-11" value={sku} onChange={event=>setSku(event.target.value)}/></Field>
            <Field label={t('defaultSupplier')}><SearchableListField mode="single" allowCustom placeholder={t('supplier')} options={suppliers.map(value=>({value:String(value.id),label:value.name}))} value={supplierId!==null?String(supplierId):supplier} onChange={next=>{const picked=suppliers.find(value=>String(value.id)===next);setSupplierId(picked?.id??null);setSupplier(picked?.name??next);}}/></Field>
          </div>
        </section>
        <section className="space-y-3"><EditorSectionHead title={t('purchaseAndPrice')} desc={t('purchaseAndPriceDesc')}/><StockQuantityForm value={qty} onChange={setQty} vatRate={vatRate} vatRateOverride={vatOverride} onVatRateChange={setVatOverride} vatDisplayMode={vatDisplayMode}/></section>
        <section className="space-y-3"><EditorSectionHead title={t('recipeUnits')} desc={t('recipeUnitsHint')}/>
          {unitsLoading?<p role="status" className="text-sm text-fg-secondary">{t('loading')}</p>:unitsError?<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{unitsError}</p><Button type="button" size="lg" variant="secondary" onClick={()=>setUnitsAttempt(value=>value+1)}>{t('retry')}</Button></div>:rows.length===0?<p className="text-sm text-fg-secondary">{t('recipeUnitsEmpty')}</p>:null}
          {rows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-3 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-3"><Ruler aria-hidden className="size-4 shrink-0 text-fg-secondary"/><p className="min-w-0 flex-1 break-words text-sm"><span className="font-semibold">1 {row.name}</span>{row.abbreviation&&<span className="text-fg-secondary"> ({row.abbreviation})</span>} = <bdi dir="ltr">{row.amount} {total.baseUnit}</bdi></p>{canManage&&<div className="flex gap-1"><Button type="button" size="lg" icon variant="ghost" aria-label={`${t('edit')} — ${row.name}`} disabled={unitsLoading||!!unitsError} onClick={()=>setUnitEditor({id:row.id,name:row.name,quantity:row.amount})}><Pencil/></Button><Button type="button" size="lg" icon variant="ghost" aria-label={`${t('remove')} — ${row.name}`} onClick={()=>setRemoveUnit(row.id)}><Trash2/></Button></div>}</div>)}
          {canManage&&<Button type="button" size="lg" variant="secondary" disabled={unitsLoading||!!unitsError} onClick={()=>setUnitEditor({name:'',quantity:0})}><Plus/>{t('addRecipeUnit')}</Button>}
        </section>
        <Field label={t('reorderThreshold')} hint={t('reorderThresholdHelp')}><NumberField className="min-h-11 max-w-56" min={0} format={String} value={reorder} onChange={setReorder}/></Field>
        <section className="space-y-3"><EditorSectionHead title={t('billNames')} desc={t('billNamesHelp')}/>
          {aliases.map((alias,index)=><div key={index} className="grid grid-cols-[1fr_44px] gap-2 rounded-r-md border border-[var(--line)] p-3 sm:grid-cols-[1fr_120px_44px]">
            <Input aria-label={`${t('originalName')} ${index+1}`} dir="auto" className="col-span-2 min-h-11 sm:col-span-1" value={alias.alias} onChange={event=>setAliases(previous=>previous.map((value,i)=>i===index?{...value,alias:event.target.value}:value))}/>
            <select aria-label={`${t('language')} ${index+1}`} className="min-h-11 min-w-0 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" value={alias.language} onChange={event=>setAliases(previous=>previous.map((value,i)=>i===index?{...value,language:event.target.value}:value))}><option value="">{t('all')}</option>{['he','ar','en','fr','es','ru'].map(language=><option key={language} value={language}>{language}</option>)}</select>
            <Button type="button" size="lg" variant="ghost" icon aria-label={`${t('remove')} — ${t('originalName')} ${index+1}`} onClick={()=>setAliases(previous=>previous.filter((_,i)=>i!==index))}><Trash2/></Button>
          </div>)}
          {canManage&&<Button type="button" size="lg" variant="secondary" onClick={()=>setAliases(previous=>[...previous,{alias:'',language:''}])}><Plus/>{t('addBillName')}</Button>}
        </section>
      </fieldset>
    </FullScreenEditor>
    {iconPicker&&<IngredientIconPicker restaurantId={rid} initialQuery={name} onPick={icon=>{if(frozen)return;setPendingFile(null);setImageUrl(icon.image_url);setImageError('');setIconPicker(false);}} onClose={()=>setIconPicker(false)}/>}
    {unitEditor&&<RecipeUnitEditor initial={unitEditor} library={units} baseUnit={total.baseUnit} onClose={()=>setUnitEditor(null)} onSave={async input=>{
      if(!canManage)return;
      let unitId=unitEditor.id??units.find(unit=>unit.name.toLowerCase()===input.name.toLowerCase())?.id;
      if(unitId===undefined){const created=await createCustomUnit(rid,{name:input.name,abbreviation:input.abbreviation});unitId=created.id;setUnits(previous=>[...previous,created]);}
      const id=unitId;setConversions(previous=>({...previous,[id]:input.quantity}));setUnitEditor(null);
    }}/>}
    <ConfirmDialog open={removeUnit!==null} onOpenChange={value=>{if(!value)setRemoveUnit(null);}} title={t('remove')} description={t('recipeUnitRemoveConfirm')} confirmLabel={t('remove')} cancelLabel={t('cancel')} onConfirm={()=>{if(removeUnit!==null)setConversions(previous=>{const next={...previous};delete next[removeUnit];return next;});setRemoveUnit(null);}}/>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} description={confirmed&&pendingImage?t('stockItemSavedImagePending'):undefined} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}

function RecipeUnitEditor({initial,library,baseUnit,onClose,onSave}:{initial:{id?:number;name:string;quantity:number};library:CustomUnit[];baseUnit:string;onClose:()=>void;onSave:(input:{name:string;abbreviation:string;quantity:number})=>Promise<void>}) {
  const {t}=useI18n();
  const [name,setName]=useState(initial.name);
  const [quantity,setQuantity]=useState(initial.quantity);
  const [abbreviation,setAbbreviation]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const lock=useRef(false);
  const nameRef=useRef<HTMLInputElement>(null);
  const quantityRef=useRef<HTMLInputElement>(null);
  const formId=useId();
  const listId=useId();
  const dirty=name!==initial.name||quantity!==initial.quantity||abbreviation!=='';
  const isEdit=initial.id!==undefined;
  const matched=library.find(unit=>unit.name.toLowerCase()===name.trim().toLowerCase());
  const close=()=>{if(!lock.current){if(dirty)setDiscard(true);else onClose();}};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(lock.current||!name.trim()||quantity<=0)return;lock.current=true;setSaving(true);setError('');
    try{await onSave({name:name.trim(),abbreviation:abbreviation.trim(),quantity});}catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}finally{lock.current=false;setSaving(false);}
  };
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty||lock.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  return <>
    <Modal title={t(isEdit?'editRecipeUnit':'recipeUnitModalTitle')} onClose={close} closeDisabled={saving} initialFocusRef={isEdit?quantityRef:nameRef}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={saving||!name.trim()||quantity<=0}>{t(saving?'saving':'save')}</Button></div>}>
      <form id={formId} onSubmit={save}><fieldset disabled={saving} className="min-w-0 space-y-4">
        <Field label={t('unitNameLabel')} hint={!isEdit?t('recipeUnitNameHint'):undefined}><Input ref={nameRef} aria-label={t('unitNameLabel')} className="min-h-11" value={name} readOnly={isEdit} list={listId} onChange={event=>setName(event.target.value)}/></Field><datalist id={listId}>{library.map(unit=><option key={unit.id} value={unit.name}/>)}</datalist>
        {!isEdit&&!matched&&<Field label={t('unitAbbrLabel')}><Input className="min-h-11" value={abbreviation} onChange={event=>setAbbreviation(event.target.value)}/></Field>}
        <Field label={`1 ${name.trim()||t('unitNameLabel')} ${t('recipeUnitConversionEquals')} (${baseUnit})`}><NumberField ref={quantityRef} className="min-h-11" value={quantity} onChange={setQuantity} min={0} format={String}/></Field>
      </fieldset></form>{error&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{error}</p>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}
