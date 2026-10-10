'use client';

import { useState, useEffect, useRef } from 'react';
import {
  importDeliveryStream, importDeliveryVoice, confirmDelivery, listSuppliers, getRestaurantSettings,
  getImportDraft, createImportDraft, updateImportDraft, deleteImportDraft,
  getStockCategories, createStockCategory,
  DeliveryExtraction, ConfirmDeliveryItemInput, StockItem, Supplier, StockUnit,
} from '@/lib/api';

import { SparklesIcon, MicIcon, ScanIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import SearchableSelect from '@/components/SearchableSelect';
import { FoodySpinner } from '@/components/FoodySpinner';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog, Field, FullScreenEditor, Input } from '@/components/ds';
import VoiceRecorder from '@/components/VoiceRecorder';
import StockQuantityForm, {
  StockInput, BaseUnit, PackagingUnit, deriveTotals,
} from '@/components/stock/StockQuantityForm';

// Maps the AI's canonical English category labels (from the extraction prompt)
// to i18n keys, so we can render and persist them in the user's locale rather
// than forcing English category names into a French/Hebrew admin.
const AI_CATEGORY_KEYS: Record<string, string> = {
  'meat':       'catMeat',
  'dairy':      'catDairy',
  'produce':    'catProduce',
  'dry goods':  'catDryGoods',
  'beverages':  'catBeverages',
  'frozen':     'catFrozen',
  'oils':       'catOils',
  'spices':     'catSpices',
  'cleaning':   'catCleaning',
  'other':      'catOther',
};

function localizeAiCategory(raw: string, t: (key: string) => string): string {
  if (!raw) return '';
  const key = AI_CATEGORY_KEYS[raw.trim().toLowerCase()];
  return key ? t(key) : raw;
}

const PACKAGING_UNITS: Set<string> = new Set([
  'carton', 'pack', 'box', 'bag', 'bottle',
  'can', 'jar', 'sachet', 'tub', 'brick', 'packet',
  'crate', 'sack', 'case', 'pot', 'jug',
  'plaquette', 'tray',
]);

function coercePackagingUnit(value: string | undefined, fallback: PackagingUnit): PackagingUnit {
  return value && PACKAGING_UNITS.has(value) ? (value as PackagingUnit) : fallback;
}

const BASE_SET: Set<string> = new Set(['g', 'kg', 'ml', 'l', 'unit']);
// Weight/volume base units only — used to defensively prefer item.unit_size_unit
// over item.unit when the extracted item gives a real weight/volume for the
// inner content (e.g. "240 g") but the top-level unit field was emitted as
// "unit" — a common AI mistake the prompt cannot fully prevent.
const WEIGHT_VOLUME_UNITS: Set<string> = new Set(['g', 'kg', 'ml', 'l']);

/** Map the AI-extracted delivery line into our union.
 *  Strategy: if pack/units-per-pack/unit-size suggest multi-level packaging,
 *  produce packaged-nested. If only a single packaging level is present,
 *  packaged-direct. Otherwise fall back to simple. */
function lineToStockInput(item: ConfirmDeliveryItemInput): StockInput {
  const packs = item.pack_count ?? 0;
  const upp = item.units_per_pack ?? 0;
  const us = item.unit_size ?? 0;
  // Effective base unit for the CONTENT. Prefer item.unit_size_unit when it
  // declares a real weight/volume — that field describes the size of the
  // inner unit directly and is more reliable than item.unit, which the AI
  // sometimes defaults to "unit" even when a weight ("240 grammes") was
  // clearly given. Falls back to item.unit otherwise.
  const usu = (item.unit_size_unit ?? '').toLowerCase();
  const rawUnit = (item.unit ?? '').toLowerCase();
  const unit = (WEIGHT_VOLUME_UNITS.has(usu) ? usu : (rawUnit || 'kg')) as StockUnit;
  const isBase = BASE_SET.has(unit);

  // Nested: outer × inner × content
  // Present when we have inner-layer hints: either units_per_pack > 1, or
  // the saved packaging carries a unit_type (e.g. "can" in "cartons of 12 cans").
  const hasInnerLayer = upp > 1 || (item.unit_type ?? '') !== '';
  if (packs > 0 && hasInnerLayer && us > 0 && isBase) {
    return {
      type: 'packaged-nested',
      outerUnit: coercePackagingUnit(item.container_type, 'carton'),
      outerQuantity: packs,
      innerUnit: coercePackagingUnit(item.unit_type, 'can'),
      innerQuantity: upp,
      contentQuantity: us,
      contentUnit: unit as BaseUnit,
      totalPrice: item.total_price ?? 0,
    };
  }
  // Direct: outer × content (no inner layer)
  if (packs > 0 && us > 0 && isBase) {
    return {
      type: 'packaged-direct',
      outerUnit: coercePackagingUnit(item.container_type, 'carton'),
      outerQuantity: packs,
      contentQuantity: us,
      contentUnit: unit as BaseUnit,
      totalPrice: item.total_price ?? 0,
    };
  }
  // Simple
  return {
    type: 'simple',
    unit: (isBase ? unit : 'kg') as BaseUnit,
    quantity: item.quantity,
    totalPrice: item.total_price ?? (item.cost_per_unit * item.quantity),
  };
}

/** Map our union back into DB-facing line fields. */
function stockInputToLinePatch(i: StockInput): Partial<ConfirmDeliveryItemInput> {
  const d = deriveTotals(i);
  if (i.type === 'simple') {
    return {
      unit: i.unit,
      quantity: i.quantity,
      cost_per_unit: d.costPerBase,
      pack_count: 0,
      units_per_pack: 0,
      unit_size: 0,
      unit_size_unit: '',
      container_type: '',
      unit_type: '',
      price_per_pack: 0,
      total_price: i.totalPrice,
    };
  }
  if (i.type === 'packaged-direct') {
    return {
      unit: i.contentUnit,
      quantity: d.totalBase,
      cost_per_unit: d.costPerBase,
      pack_count: i.outerQuantity,
      units_per_pack: 0,
      unit_size: i.contentQuantity,
      unit_size_unit: i.contentUnit,
      container_type: i.outerUnit,
      unit_type: '',
      price_per_pack: d.pricePerOuter,
      total_price: i.totalPrice,
    };
  }
  return {
    unit: i.contentUnit,
    quantity: d.totalBase,
    cost_per_unit: d.costPerBase,
    pack_count: i.outerQuantity,
    units_per_pack: i.innerQuantity,
    unit_size: i.contentQuantity,
    unit_size_unit: i.contentUnit,
    container_type: i.outerUnit,
    unit_type: i.innerUnit,
    price_per_pack: d.pricePerOuter,
    total_price: i.totalPrice,
  };
}

interface DeliveryImportModalProps {
  rid:number;stockItems:StockItem[];draftId?:number;onClose:()=>void;onImported:()=>void|Promise<void>;
}

/** Delivery review scoped to one restaurant and one resumed draft. */
export default function DeliveryImportModal(props:DeliveryImportModalProps) {
  return <DeliveryImportWorkspace key={`${props.rid}:${props.draftId??'new'}`} {...props}/>;
}

function DeliveryImportWorkspace({rid,stockItems,draftId,onClose,onImported}:DeliveryImportModalProps) {
  const {t,locale}=useI18n();
  const {hasAnyPermission}=usePermissions();
  const canManage=hasAnyPermission('kitchen.manage');
  const [step,setStep]=useState<'upload'|'review'>('upload');
  const [mode,setMode]=useState<'scan'|'voice'>('scan');
  const [file,setFile]=useState<File|null>(null);
  const [filePreview,setFilePreview]=useState('');
  const [extraction,setExtraction]=useState<DeliveryExtraction|null>(null);
  const [editedItems,setEditedItems]=useState<ConfirmDeliveryItemInput[]>([]);
  const [formStates,setFormStates]=useState<StockInput[]>([]);
  const [reviewed,setReviewed]=useState<Set<number>>(new Set());
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [categoryNames,setCategoryNames]=useState<string[]>([]);
  const [supplierId,setSupplierId]=useState(0);
  const [newSupplier,setNewSupplier]=useState('');
  const [vatRate,setVatRate]=useState(18);
  const [vatMode,setVatMode]=useState<'ex'|'inc'>('inc');
  const [documentUrl,setDocumentUrl]=useState('');
  const [documentType,setDocumentType]=useState('');
  const [currentDraft,setCurrentDraft]=useState<number|undefined>(draftId);
  const [loaded,setLoaded]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [streaming,setStreaming]=useState(false);
  const [streamError,setStreamError]=useState('');
  const [transcript,setTranscript]=useState('');
  const [reviewTab,setReviewTab]=useState<'document'|'items'>('items');
  const [saving,setSaving]=useState<'draft'|'confirm'|'category'|null>(null);
  const [error,setError]=useState('');
  const [savedDraft,setSavedDraft]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [missingDocument,setMissingDocument]=useState(false);
  const [withoutDocument,setWithoutDocument]=useState(false);
  const [discard,setDiscard]=useState(false);
  const [voiceDirty,setVoiceDirty]=useState(false);
  const discardAction=useRef<()=>void>(onClose);
  const [restart,setRestart]=useState(false);
  const pendingRestart=useRef<(()=>void)|null>(null);
  const lock=useRef(false);
  const generation=useRef(0);
  const extracting=useRef(false);
  const abort=useRef<AbortController|null>(null);
  const lastVoice=useRef<{blob:Blob;type:string}|null>(null);
  const baseline=useRef<string|null>(null);
  const receipt=useRef<{confirmed:boolean;draftId?:number;draftDeleted:boolean;documentUrl:string;documentType:string}>({confirmed:false,draftDeleted:false,documentUrl:'',documentType:''});
  const busy=!!saving;
  const supplierName=supplierId===-1?newSupplier.trim():supplierId>0?(suppliers.find(supplier=>supplier.id===supplierId)?.name??extraction?.supplier_name??''):(extraction?.supplier_name??'');
  const supplierReady=supplierId>0||(supplierId===-1&&!!newSupplier.trim());
  const fingerprint=JSON.stringify({editedItems,formStates,supplierId,newSupplier,file:file?.name,mode});
  const dirty=baseline.current!==null&&fingerprint!==baseline.current;
  useEffect(()=>{if(loaded&&baseline.current===null)baseline.current=fingerprint;},[loaded,fingerprint]);
  useEffect(()=>{
    try{const value=localStorage.getItem('foody.stock.vatDisplay');if(value==='ex'||value==='inc')setVatMode(value);}catch{/* A display preference is optional. */}
    const requestGeneration=generation;
    return()=>{requestGeneration.current++;abort.current?.abort();};
  },[]);
  useEffect(()=>{
    if(!file){setFilePreview('');return;}
    const url=URL.createObjectURL(file);setFilePreview(url);return()=>URL.revokeObjectURL(url);
  },[file]);
  useEffect(()=>{
    let active=true;setLoaded(false);setLoadError('');
    Promise.all([listSuppliers(rid),getStockCategories(rid),getRestaurantSettings(rid),draftId?getImportDraft(rid,draftId):Promise.resolve(null)]).then(([nextSuppliers,categories,settings,detail])=>{
      if(!active)return;setSuppliers(nextSuppliers);setCategoryNames(categories.map(category=>category.name));setVatRate(settings.vat_rate??18);
      if(detail){setExtraction(detail.extraction);setEditedItems(detail.edited_items);setFormStates(detail.edited_items.map(lineToStockInput));setSupplierId(detail.draft.supplier_id??0);setDocumentUrl(detail.draft.document_url);setDocumentType(detail.draft.document_type);setStep('review');receipt.current={confirmed:false,draftId:detail.draft.id,draftDeleted:false,documentUrl:detail.draft.document_url,documentType:detail.draft.document_type};}
      setLoaded(true);
    }).catch(cause=>{if(active)setLoadError(cause instanceof Error?cause.message:t('workspaceLoadError'));});
    return()=>{active=false;};
  },[rid,draftId,attempt,t]);
  const close=()=>{if(lock.current)return;if((dirty||voiceDirty||streaming)&&!confirmed){discardAction.current=onClose;setDiscard(true);}else onClose();};
  const changeMode=(value:'scan'|'voice')=>{if(value===mode)return;if(voiceDirty){discardAction.current=()=>{setVoiceDirty(false);setMode(value);};setDiscard(true);}else setMode(value);};
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(((dirty||voiceDirty||streaming)&&!confirmed)||lock.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,voiceDirty,streaming,confirmed]);
  const chooseFile=(next:File|undefined)=>{
    if(!next||!canManage||busy)return;
    setError('');
    if(!['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(next.type)||next.size>10*1024*1024){setError(t('deliveryFileRequirements'));return;}
    setFile(next);
  };
  const makeLine=(item:DeliveryExtraction['items'][number]):ConfirmDeliveryItemInput=>{
    const matched=stockItems.find(stock=>stock.id===item.matched_item_id);
    return {stock_item_id:item.matched_item_id??undefined,name:item.translated_name||item.original_name,original_name:item.original_name,sku:item.sku||'',quantity:item.quantity,unit:item.unit,category:localizeAiCategory(item.category,t),cost_per_unit:item.estimated_cost,pack_count:item.pack_count??0,units_per_pack:item.units_per_pack??0,price_per_pack:item.price_per_pack||0,total_price:item.total_price||(item.estimated_cost*item.quantity),unit_size:item.unit_size||0,unit_size_unit:item.unit_size_unit||'',container_type:item.container_type||'',unit_type:item.unit_type||'',vat_rate_override:matched?.vat_rate_override??null,row_index:item.row_index,needs_review:item.needs_review,review_reason:item.review_reason};
  };
  const beginExtraction=()=>{
    const id=++generation.current;extracting.current=true;setStreaming(true);setStreamError('');setError('');setEditedItems([]);setFormStates([]);setReviewed(new Set());setExtraction({supplier_name:'',delivery_date:'',items:[],raw_notes:''});setTranscript('');setSavedDraft(false);setConfirmed(false);setCurrentDraft(undefined);setDocumentUrl('');setDocumentType('');setMissingDocument(false);setWithoutDocument(false);receipt.current={confirmed:false,draftDeleted:false,documentUrl:'',documentType:''};setStep('review');setReviewTab('items');return id;
  };
  const scan=async()=>{
    if(!file||!canManage||!loaded||lock.current||extracting.current||receipt.current.confirmed||!supplierReady)return;
    const id=beginExtraction();const controller=new AbortController();abort.current=controller;let ended=false;
    try{
      await importDeliveryStream(rid,file,{lang:locale,supplierId:supplierId>0?supplierId:undefined},{
        onMeta:meta=>{if(id===generation.current)setExtraction(previous=>previous?{...previous,supplier_name:meta.supplier_name??previous.supplier_name,delivery_date:meta.delivery_date??previous.delivery_date}:previous);},
        onItem:item=>{if(id!==generation.current)return;const line=makeLine(item);setEditedItems(previous=>[...previous,line]);setFormStates(previous=>[...previous,lineToStockInput(line)]);setExtraction(previous=>previous?{...previous,items:[...previous.items,item]}:previous);},
        onProgress:()=>{},
        onDone:done=>{ended=true;if(id!==generation.current)return;setEditedItems(previous=>previous.map((item,index)=>({...item,...(done.late_flags?.duplicate_row_indexes?.includes(index)?{needs_review:true,review_reason:item.review_reason||'duplicate_row'}:{}),...(done.late_flags?.deduped_indexes?.includes(index)?{skipped:true}:{})})));setExtraction(previous=>previous?{...previous,raw_notes:done.raw_notes??previous.raw_notes}:previous);},
        onError:failure=>{ended=true;if(id===generation.current)setStreamError(failure.message);},
      },controller.signal);
      if(id===generation.current&&!ended)setStreamError(t('deliveryStreamIncomplete'));
    }catch(cause){if(id===generation.current&&!(cause instanceof DOMException&&cause.name==='AbortError'))setStreamError(cause instanceof Error?cause.message:t('workspaceLoadError'));}
    finally{if(id===generation.current){extracting.current=false;setStreaming(false);abort.current=null;}}
  };
  const voice=async(blob:Blob,type:string)=>{
    if(!canManage||!loaded||lock.current||extracting.current||receipt.current.confirmed||!supplierReady)return;
    lastVoice.current={blob,type};setVoiceDirty(false);setFile(null);const id=beginExtraction();
    try{const response=await importDeliveryVoice(rid,blob,type,locale,supplierId>0?supplierId:undefined);if(id!==generation.current)return;setTranscript(response.transcript);setExtraction(response.extraction);const lines=response.extraction.items.map(makeLine);setEditedItems(lines);setFormStates(lines.map(lineToStockInput));}
    catch(cause){if(id===generation.current)setStreamError(cause instanceof Error?cause.message:t('workspaceLoadError'));}
    finally{if(id===generation.current){extracting.current=false;setStreaming(false); }}
  };
  const cancelScan=()=>{generation.current++;extracting.current=false;abort.current?.abort();abort.current=null;setStreaming(false);setStreamError(t('deliveryStreamCancelled'));};
  const requestRestart=(action:()=>void)=>{if(editedItems.length>0){pendingRestart.current=action;setRestart(true);}else action();};
  const retryScan=()=>requestRestart(()=>{if(mode==='voice'&&lastVoice.current)void voice(lastVoice.current.blob,lastVoice.current.type);else void scan();});
  const draftPayload=()=>({supplier_id:supplierId>0?supplierId:undefined,supplier_name:supplierName,extraction:extraction!,edited_items:editedItems});
  const saveDraft=async()=>{
    if(!canManage||!loaded||!extraction||lock.current||streaming||confirmed)return;lock.current=true;setSaving('draft');setError('');
    try{
      const draft=currentDraft?await updateImportDraft(rid,currentDraft,draftPayload()):await createImportDraft(rid,file,draftPayload());
      setCurrentDraft(draft.id);receipt.current.draftId=draft.id;receipt.current.documentUrl=draft.document_url;receipt.current.documentType=draft.document_type;setDocumentUrl(draft.document_url);setDocumentType(draft.document_type);setSavedDraft(true);baseline.current=fingerprint;
      if(file&&!draft.document_url)setMissingDocument(true);else onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(null);}
  };
  const activeItems=editedItems.filter(item=>!item.skipped);
  const unchecked=editedItems.filter((item,index)=>item.needs_review&&!item.skipped&&!reviewed.has(index)).length;
  const confirm=async()=>{
    if(!canManage||!loaded||lock.current||streaming||(!receipt.current.confirmed&&(activeItems.length===0||unchecked>0)))return;
    lock.current=true;setSaving('confirm');setError('');
    try{
      const saved=receipt.current;
      if(!saved.confirmed){
        if(file&&!saved.documentUrl&&!saved.draftId&&extraction){
          const draft=await createImportDraft(rid,file,draftPayload());saved.draftId=draft.id;saved.documentUrl=draft.document_url;saved.documentType=draft.document_type;setCurrentDraft(draft.id);setDocumentUrl(draft.document_url);setDocumentType(draft.document_type);
        }
        if(file&&!saved.documentUrl&&!withoutDocument){setMissingDocument(true);return;}
        await confirmDelivery(rid,{supplier_name:supplierName,document_url:saved.documentUrl,document_type:saved.documentType,items:activeItems});saved.confirmed=true;setConfirmed(true);
      }
      if(saved.draftId&&!saved.draftDeleted){await deleteImportDraft(rid,saved.draftId);saved.draftDeleted=true;}
      await onImported();onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(null);}
  };
  const markReviewed=(index:number)=>setReviewed(previous=>new Set([...Array.from(previous),index]));
  const updateItem=(index:number,patch:Partial<ConfirmDeliveryItemInput>)=>{if(!canManage||lock.current||confirmed)return;setSavedDraft(false);setEditedItems(previous=>previous.map((item,i)=>i===index?{...item,...patch}:item));markReviewed(index);};
  const updateForm=(index:number,value:StockInput)=>{if(!canManage||lock.current||confirmed)return;setFormStates(previous=>previous.map((item,i)=>i===index?value:item));updateItem(index,stockInputToLinePatch(value));};
  const categories=Array.from(new Set([...categoryNames,...stockItems.map(item=>item.category).filter(Boolean)])).sort((a,b)=>a.localeCompare(b,locale));
  const createCategory=async(name:string)=>{
    if(!canManage||lock.current||confirmed)throw new Error(t('saveFailed'));
    const existing=categories.find(category=>category.localeCompare(name.trim(),locale,{sensitivity:'accent'})===0);if(existing)return existing;
    lock.current=true;setSaving('category');
    try{const created=await createStockCategory(rid,{name:name.trim()});setCategoryNames(previous=>[...previous,created.name]);return created.name;}finally{lock.current=false;setSaving(null);}
  };
  const stockOptions=[{value:'',label:`— ${t('newItem')} —`},...stockItems.map(item=>({value:String(item.id),label:item.name,sublabel:item.unit}))];
  const frozen=!canManage||busy||confirmed;
  const preview=filePreview||documentUrl;
  const previewType=file?.type||documentType;
  const loadState=!loaded?<div className="space-y-4 p-5">{loadError?<><p role="alert" className="text-sm text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></>:<p role="status" className="text-sm text-fg-secondary">{t('loading')}</p>}</div>:null;
  const notices=<>{savedDraft&&<p role="status" className="text-sm">{t('deliveryDraftSaved')}</p>}{confirmed&&<p role="status" className="text-sm">{t('deliveryConfirmedRecovery')}</p>}{missingDocument&&<div className="space-y-3 rounded-r-md border border-[var(--warning-500)] p-3 text-sm"><p>{t('deliveryDocumentMissing')}</p>{!confirmed&&<label className="flex min-h-11 items-center gap-3 selection-row"><input type="checkbox" className="size-5 shrink-0" disabled={busy} checked={withoutDocument} onChange={event=>setWithoutDocument(event.target.checked)}/><span>{t('deliveryWithoutDocument')}</span></label>}</div>}{error&&<p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}</>;
  const confirmations=<><ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{setDiscard(false);discardAction.current();}}/><ConfirmDialog open={restart} onOpenChange={setRestart} title={t('deliveryRestartTitle')} description={t('deliveryRestartHint')} confirmLabel={t('continue')} cancelLabel={t('cancel')} onConfirm={()=>{setRestart(false);pendingRestart.current?.();pendingRestart.current=null;}}/></>;
  if(step==='upload')return <>
    <Modal title={t('aiDeliveryImport')} icon={<SparklesIcon/>} size="lg" onClose={close} closeDisabled={busy}>
      {loadState||<div className="space-y-5"><div role="group" aria-label={t('type')} className="flex flex-wrap gap-2">{(['scan','voice']as const).map(value=><Button key={value} type="button" variant="secondary" size="lg" aria-pressed={mode===value} className={mode===value?'bg-[var(--brand-soft)] text-[var(--brand-ink)] border-[var(--brand-ink)]':''} onClick={()=>changeMode(value)}>{value==='scan'?<ScanIcon/>:<MicIcon/>}{t(value==='scan'?'importModeScan':'importModeVoice')}</Button>)}</div>
        {mode==='scan'&&<p className="text-sm text-fg-secondary">{t('aiDeliveryDesc')}</p>}
        <fieldset disabled={!canManage||busy} className="min-w-0 space-y-4"><div className="space-y-2"><p className="text-sm font-medium">{t('selectSupplier')}</p><SearchableSelect value={supplierId===-1?'__new__':supplierId?String(supplierId):''} onChange={value=>{setSupplierId(value==='__new__'?-1:Number(value));setNewSupplier('');}} options={[...suppliers.map(supplier=>({value:String(supplier.id),label:supplier.name})),{value:'__new__',label:`+ ${t('newSupplier')}`}]} placeholder={t('selectSupplier')} className="min-h-11"/>{supplierId===-1&&<Field label={t('supplierName')}><Input className="min-h-11" value={newSupplier} onChange={event=>setNewSupplier(event.target.value)}/></Field>}</div>
          {mode==='scan'?<><Field label={t('deliveryFile')} hint={t('deliveryFileRequirements')}><input aria-label={t('deliveryFile')} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" className="min-h-11 max-w-full rounded-r-md border border-[var(--line-strong)] p-2 text-sm" onChange={event=>{chooseFile(event.target.files?.[0]);event.target.value='';}}/></Field>{file&&<p className="break-words text-sm">{file.name}</p>}{filePreview&&file?.type.startsWith('image/')&&<div className="rounded-r-md border border-[var(--line)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={filePreview} alt={t('originalDocument')} className="max-h-48 w-full object-contain"/>
          </div>}<Button type="button" size="lg" className="w-full" disabled={!file||!supplierReady} onClick={()=>requestRestart(()=>void scan())}>{t('uploadAndAnalyze')}</Button></>:<VoiceRecorder t={t} onDraftChange={setVoiceDirty} disabled={!canManage||!supplierReady||busy} onSubmit={(blob,type)=>requestRestart(()=>void voice(blob,type))}/>}
        </fieldset>{notices}
      </div>}
    </Modal>{confirmations}
  </>;
  return <>
    <FullScreenEditor open title={t('aiDeliveryImport')} subtitle={`${supplierName} · ${activeItems.length} ${t('items')}`} showCancel={false} onOpenChange={value=>{if(!value)close();}} closeDisabled={busy} bodyClassName="flex flex-col overflow-hidden" contentClassName="flex min-h-0 flex-1 flex-col p-0 md:p-0"
      footer={<div className="space-y-3">{notices}<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:justify-between"><Button size="lg" variant="secondary" disabled={busy||confirmed||streaming} onClick={()=>setStep('upload')}>{t('back')}</Button><div className="contents sm:flex sm:flex-wrap sm:gap-2">{canManage&&!confirmed&&<Button size="lg" variant="secondary" disabled={busy||streaming||!loaded||!extraction} onClick={()=>void saveDraft()}>{t(saving==='draft'?'saving':'saveDraft')}</Button>}{canManage&&<Button size="lg" className="col-span-2" disabled={busy||streaming||!loaded||(!confirmed&&(activeItems.length===0||unchecked>0||(missingDocument&&!withoutDocument)))} onClick={()=>void confirm()}>{t(saving==='confirm'?'confirming':confirmed?'retry':'confirmImport')}</Button>}</div></div></div>}>
      {loadState||<>
        <div className="flex shrink-0 border-b border-[var(--line)] lg:hidden" role="group" aria-label={t('aiDeliveryImport')}>{(['document','items']as const).map(value=><button type="button" key={value} aria-pressed={reviewTab===value} className={`min-h-11 flex-1 px-4 py-3 text-sm ${reviewTab===value?'border-b-2 border-[var(--brand-ink)] text-[var(--brand-ink)] font-semibold':'text-fg-secondary'}`} onClick={()=>setReviewTab(value)}>{t(value==='items'?'items':mode==='voice'?'voiceTranscript':'originalDocument')}</button>)}</div>
        <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label={t(mode==='voice'?'voiceTranscript':'originalDocument')} className={`${reviewTab==='document'?'block':'hidden'} h-full min-w-0 overflow-auto border-e border-[var(--line)] bg-[var(--surface-2)] p-4 lg:block`}><h2 className="mb-4 text-sm font-semibold">{t(mode==='voice'?'voiceTranscript':'originalDocument')}</h2>{mode==='voice'?<p className="whitespace-pre-wrap text-sm" dir="auto">{transcript||t('voiceTranscriptPending')}</p>:preview?previewType==='application/pdf'?<iframe src={preview} title={t('originalDocument')} className="h-full min-h-96 w-full"/>:
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt={t('originalDocument')} className="h-auto w-full rounded-r-md"/>
          :<p className="text-sm text-fg-secondary">{t('deliveryDocumentMissing')}</p>}</section>
          <section aria-label={t('items')} className={`${reviewTab==='items'?'block':'hidden'} h-full min-w-0 overflow-auto p-4 lg:block`}>
            {!confirmed&&<StreamingHeader streaming={streaming} count={editedItems.length} error={streamError} errorDetail={streamError} onCancel={cancelScan} onRetry={retryScan} t={t}/>}
            {unchecked>0&&<p role="status" className="mb-4 rounded-r-md bg-[var(--warning-50)] p-3 text-sm">{t('reviewBlockedBanner').replace('{n}',String(unchecked))}</p>}
            <fieldset disabled={frozen||streaming} className="min-w-0"><ItemsList editedItems={editedItems} formStates={formStates} stockItems={stockItems} stockOptions={stockOptions} existingCategories={categories} updateItem={updateItem} updateFormState={updateForm} vatRate={vatRate} vatDisplayMode={vatMode} onVatDisplayModeChange={value=>{setVatMode(value);try{localStorage.setItem('foody.stock.vatDisplay',value);}catch{/* Display preference is optional. */}}} onCreateCategory={createCategory} t={t} reviewedItems={reviewed} markReviewed={markReviewed} streaming={streaming}/></fieldset>
            {!streaming&&!streamError&&editedItems.length===0&&<p role="status" className="py-10 text-center text-sm text-fg-secondary">{t('nothingToImport')}</p>}
          </section>
        </div>
      </>}
    </FullScreenEditor>{confirmations}
  </>;
}

function StreamingHeader({
  streaming, count, error, errorDetail, onCancel, onRetry, t,
}: {
  streaming: boolean;
  count: number;
  error: string;
  /** Verbatim upstream error message for the user to copy/screenshot. */
  errorDetail?: string;
  onCancel: () => void;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  // Cycle a list of status verbs while streaming so the banner doesn't
  // feel frozen. Verbs come from the locale's aiStatusVerbs key (CSV).
  const verbs = t('aiStatusVerbs').split(',').map((s) => s.trim()).filter(Boolean);
  const [verbIndex, setVerbIndex] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    setVerbIndex(0);
    const id = setInterval(() => {
      setVerbIndex((i) => (i + 1) % verbs.length);
    }, 1400);
    return () => clearInterval(id);
  }, [streaming, verbs.length]);

  if (streaming) {
    const verb = verbs[verbIndex] || '';
    const msg = t('scanInProgress')
      .replace('{verb}', verb)
      .replace('{n}', String(count));
    return (
      <div role="status" className="mb-3 rounded-r-md border border-[var(--line)] bg-[var(--info-50)] p-3 flex items-center gap-3">
        <FoodySpinner size={20} className="shrink-0" />
        <span
          key={verbIndex}
          className="text-sm text-fg-primary flex-1 animate-in fade-in slide-in-from-bottom-0.5 duration-300"
        >
          {msg}
        </span>
        <button onClick={onCancel} className="min-h-11 text-xs text-fg-secondary hover:text-fg-primary px-2 py-1 rounded border border-[var(--divider)] shrink-0">
          {t('cancelScan')}
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mb-3 rounded-r-md border border-[var(--warning-500)] bg-[var(--warning-50)] p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-[var(--warning-600)]">
            {t('scanInterrupted').replace('{n}', String(count))}
          </p>
          {errorDetail && (
            <p className="min-h-11 text-xs text-fg-secondary break-words font-mono">
              {errorDetail}
            </p>
          )}
        </div>
        <button onClick={onRetry} className="min-h-11 shrink-0 text-xs px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/20 text-[var(--warning-600)]">
          {t('retry')}
        </button>
      </div>
    );
  }
  return null;
}

function ItemsList({
  editedItems, formStates, stockItems, stockOptions, existingCategories, updateItem, updateFormState, vatRate, vatDisplayMode, onVatDisplayModeChange, onCreateCategory, t, reviewedItems, markReviewed, streaming,
}: {
  editedItems: ConfirmDeliveryItemInput[];
  formStates: StockInput[];
  stockItems: StockItem[];
  stockOptions: { value: string; label: string; sublabel?: string }[];
  existingCategories: string[];
  updateItem: (idx: number, patch: Partial<ConfirmDeliveryItemInput>) => void;
  updateFormState: (idx: number, v: StockInput) => void;
  vatRate: number;
  vatDisplayMode: 'ex' | 'inc';
  onVatDisplayModeChange: (mode: 'ex' | 'inc') => void;
  onCreateCategory: (name: string) => Promise<string>;
  t: (key: string) => string;
  reviewedItems: Set<number>;
  markReviewed: (idx: number) => void;
  streaming: boolean;
}) {
  return (
    <div className="space-y-3">
      {editedItems.length > 0 && (
        <div className="flex flex-col gap-2 rounded-r-md border border-[var(--divider)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-primary">{t('priceEntryMode')}</p>
            <p className="mt-0.5 text-xs text-fg-tertiary">{t('priceEntryModeHint')}</p>
          </div>
          <div
            className="inline-flex self-start rounded-r-md bg-[var(--surface-subtle)] p-1 sm:self-auto"
            role="group"
            aria-label={t('priceEntryMode')}
          >
            {(['ex', 'inc'] as const).map((mode) => {
              const selected = vatDisplayMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onVatDisplayModeChange(mode)}
                  className={`min-h-11 min-w-14 rounded-r-md px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                    selected
                      ? 'bg-[var(--surface)] text-[var(--brand-ink)] shadow-sm'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {mode === 'ex' ? t('exVat') : t('incVat')}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {editedItems.map((item, idx) => {
        const isExisting = !!item.stock_item_id;
        const isSkipped = !!item.skipped;
        const isFlagged = !!item.needs_review && !isSkipped && !reviewedItems.has(idx);
        const reasonKey = (() => {
          switch (item.review_reason) {
            case 'math_mismatch':       return 'reviewReasonMathMismatch';
            case 'missing_size':        return 'reviewReasonMissingSize';
            case 'missing_pack_count':  return 'reviewReasonMissingPackCount';
            case 'low_confidence':      return 'reviewReasonLowConfidence';
            case 'duplicate_row':       return 'reviewReasonDuplicateRow';
            default:                    return 'reviewNeededBanner';
          }
        })();
        const statusChip = isSkipped
          ? { label: t('skipped'), cls: 'bg-fg-tertiary/10 text-fg-secondary' }
          : isExisting
            ? { label: t('existing'), cls: 'bg-[var(--success-50)] text-[var(--success-600)]' }
            : { label: t('new'), cls: 'bg-[var(--warning-50)] text-[var(--warning-600)]' };
        return (
          <div
            key={idx}
            role="region" aria-label={`${t('item')} ${idx+1} — ${item.name||item.original_name}`}
            className={`p-4 rounded-r-md space-y-4 animate-in fade-in slide-in-from-top-1 duration-200 ${isFlagged ? 'border-s-4 border-[var(--warning-500)]' : ''}`}
            style={{ background: 'var(--surface-subtle)', opacity: 1 }}
          >
            {isFlagged && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-[var(--warning-50)] text-[var(--warning-600)] text-xs">
                <span aria-hidden className="mt-0.5">⚠</span>
                <span className="flex-1">{t(reasonKey)}</span>
                <button
                  type="button"
                  onClick={() => markReviewed(idx)}
                  className="min-h-11 shrink-0 text-xs px-2 py-2 rounded-r-sm border border-amber-500/40 hover:bg-amber-500/20"
                >
                  {t('reviewAcknowledge')}
                </button>
              </div>
            )}

            {/* ── Header: identity + status ───────────────────────────── */}
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4
                    className="text-base font-semibold text-fg-primary break-words"
                    dir="auto"
                    style={{ textDecoration: isSkipped ? 'line-through' : undefined }}
                  >
                    {item.name || item.original_name || '—'}
                  </h4>
                  {item.original_name && item.original_name !== item.name && (
                    <p className="text-sm text-fg-secondary break-words">
                      <bdi>{item.original_name}</bdi>
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-r-sm whitespace-nowrap shrink-0 ${statusChip.cls}`}>
                  {statusChip.label}
                </span>
              </div>

              {/* Metadata line: line number + editable SKU + skip toggle */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-secondary">
                {item.row_index && item.row_index > 0 ? (
                  <span className="shrink-0">{t('rowNumber').replace('{n}', String(item.row_index))}</span>
                ) : null}
                <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto sm:flex-1 min-w-0">
                  <span className="shrink-0">{t('sku')}</span>
                  <input
                    className="bg-transparent border-b border-[var(--divider)]/40 hover:border-[var(--divider)] focus:border-brand-500 outline-none min-h-11 text-sm flex-1 min-w-0 px-0.5 py-0.5 text-fg-secondary transition-colors"
                    aria-label={t('sku')}
                    value={item.sku ?? ''}
                    disabled={isSkipped}
                    onChange={(e) => updateItem(idx, { sku: e.target.value })}
                    placeholder={t('skuHelp')}
                    dir="ltr"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateItem(idx, { skipped: !isSkipped })}
                  className="ms-auto min-h-11 text-sm px-3 py-2 rounded-r-sm whitespace-nowrap border border-[var(--divider)] hover:bg-[var(--surface)] text-fg-secondary shrink-0"
                  style={{ pointerEvents: 'auto' }}
                >
                  {isSkipped ? t('unskip') : t('skip')}
                </button>
              </div>
            </div>

            {/* ── Article section: match + name/category ──────────────── */}
            <fieldset disabled={isSkipped}
              className="min-w-0 space-y-3 border-t border-[var(--divider)] pt-3"
              style={{ pointerEvents: isSkipped ? 'none' : undefined }}
              aria-disabled={isSkipped}
            >
              <div className="text-sm text-fg-secondary font-medium">
                {t('articleSection')}
              </div>
              <SearchableSelect
                value={item.stock_item_id ? String(item.stock_item_id) : ''}
                onChange={(val) => {
                  if (val) {
                    const si = stockItems.find((s) => s.id === +val);
                    if (si) updateItem(idx, { stock_item_id: si.id, name: si.name, unit: si.unit, category: si.category });
                  } else {
                    updateItem(idx, { stock_item_id: undefined });
                  }
                }}
                options={stockOptions}
                placeholder={t('matchToStockItem')}
                className="min-h-11"
              />
              {!isExisting && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                    <input
                      className="input min-h-11 w-full py-2 text-sm"
                      aria-label={t('name')}
                      value={item.name}
                      disabled={isSkipped}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <CategoryPicker
                      value={item.category}
                      disabled={isSkipped}
                      categories={existingCategories}
                      onChange={(category) => updateItem(idx, { category })}
                      onCreateCategory={onCreateCategory}
                      t={t}
                    />
                  </div>
                </div>
              )}
            </fieldset>

            {/* ── Quantity / packaging / price ────────────────────────── */}
            <fieldset disabled={isSkipped}
              className="min-w-0 border-t border-[var(--divider)] pt-3"
              style={{ pointerEvents: isSkipped ? 'none' : undefined }}
              aria-disabled={isSkipped}
            >
              <StockQuantityForm
                value={formStates[idx] ?? lineToStockInput(item)}
                onChange={(v) => updateFormState(idx, v)}
                vatRate={vatRate}
                vatRateOverride={item.vat_rate_override ?? null}
                onVatRateChange={(v) => updateItem(idx, { vat_rate_override: v })}
                vatDisplayMode={vatDisplayMode}
                compact
              />
            </fieldset>
          </div>
        );
      })}

    </div>
  );
}

function CategoryPicker({
  value, categories, disabled, onChange, onCreateCategory, t,
}: {
  value: string;
  categories: string[];
  disabled: boolean;
  onChange: (category: string) => void;
  onCreateCategory: (name: string) => Promise<string>;
  t: (key: string) => string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const closeCreator = () => {
    if(saving)return;
    setCreating(false);
    setName('');
    setError('');
  };

  const saveCategory = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving || disabled) return;
    setSaving(true);
    setError('');
    try {
      const createdName = await onCreateCategory(trimmedName);
      onChange(createdName);
      closeCreator();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-fg-secondary">{t('newCategory')}</label>
        <div>
          <input
            className="input min-h-11 w-full py-2 text-sm"
            aria-label={t('categoryName')}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveCategory();
              }
              if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!saving)closeCreator();}
            }}
            placeholder={t('categoryName')}
            autoFocus
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void saveCategory()}
            disabled={!name.trim() || saving}
            className="btn-primary min-h-11 shrink-0 px-3 py-1.5 text-xs"
          >
            {saving ? t('creating') : t('create')}
          </button>
          <button
            type="button"
            onClick={closeCreator}
            disabled={saving}
            className="btn-secondary min-h-11 shrink-0 px-3 py-1.5 text-xs"
          >
            {t('cancel')}
          </button>
        </div>
        {error && <p role="alert" className="mt-1 text-sm text-[var(--danger-500)]">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-fg-secondary">{t('category')}</label>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={disabled}
          className="min-h-11 text-xs font-medium text-[var(--brand-ink)] hover:text-[var(--brand-ink)] disabled:opacity-40"
        >
          + {t('createCategory')}
        </button>
      </div>
      <select
        className="input min-h-11 w-full py-2 text-sm"
        aria-label={t('category')}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('category')}</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        {value && !categories.includes(value) && <option value={value}>{value}</option>}
      </select>
    </div>
  );
}
