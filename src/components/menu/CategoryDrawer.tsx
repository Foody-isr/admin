'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Drawer, Field, Input } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';

/** Shared category metadata for catalogue, stock and preparations. */
export interface CategoryDrawerEntry { name:string; count?:number; canDelete?:boolean; }
/** Category creation payload delegated to the active service. */
export interface CreateCategoryInput { name:string; }
/** Category rename payload delegated to the active service. */
export interface EditCategoryPatch { name:string; }
interface Props {
  open:boolean;onClose:()=>void;categories:CategoryDrawerEntry[];currentCategory:string;mode:'filter'|'bulk-assign';
  onSelect:(name:string|null)=>Promise<void>|void;selectionCount?:number;
  onCreateCategory?:(input:CreateCategoryInput)=>Promise<void>|void;
  onEditCategory?:(oldName:string,patch:EditCategoryPatch)=>Promise<void>|void;
  onDeleteCategory?:(name:string)=>Promise<void>|void;
  deleteDescription?:string;processing?:boolean;
}

/** Category selection and mutations with keyboard focus, draft protection and visible errors. */
export default function CategoryDrawer({open,onClose,categories,currentCategory,mode,onSelect,selectionCount,onCreateCategory,onEditCategory,onDeleteCategory,deleteDescription,processing}:Props) {
  const {t}=useI18n();
  const [search,setSearch]=useState('');
  const [editing,setEditing]=useState<CategoryDrawerEntry|'new'|null>(null);
  const [selecting,setSelecting]=useState(false);
  const [error,setError]=useState('');
  const lock=useRef(false);
  const first=useRef<HTMLInputElement>(null);
  const busy=!!processing||selecting;
  useEffect(()=>{if(open){setSearch('');setEditing(null);setError('');}},[open]);
  const filtered=useMemo(()=>categories.filter(category=>category.name.toLowerCase().includes(search.trim().toLowerCase())),[categories,search]);
  const select=async(name:string|null)=>{
    if(busy||lock.current)return;lock.current=true;setSelecting(true);setError('');
    try{await onSelect(name);}catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSelecting(false);}
  };
  const row=(name:string,count:number,active:boolean,onClick:()=>void,onEdit?:()=>void)=><div key={name} className={`flex items-center gap-2 rounded-r-md border ${active?'border-[var(--brand-ink)] bg-[var(--brand-soft)]':'border-[var(--line)] bg-[var(--surface)]'}`}>
    <button type="button" aria-pressed={active} disabled={busy} onClick={onClick} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-4 text-start disabled:opacity-50"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{name}</span><span className="mt-1 block text-xs text-fg-secondary"><bdi>{count}</bdi> {t(count===1?'item':'articlesUnit')}</span></span>{active&&<Check aria-hidden className="size-5 shrink-0 text-[var(--brand-ink)]"/>}</button>
    {onEdit&&<Button type="button" size="lg" variant="ghost" icon className="me-2" disabled={busy} aria-label={`${t('edit')} — ${name}`} onClick={onEdit}><Pencil/></Button>}
  </div>;
  return <>
    <Drawer open={open} onOpenChange={value=>{if(!value&&!lock.current&&!processing)onClose();}} closeDisabled={busy} title={t(mode==='bulk-assign'?'assignCategory':'category')} subtitle={mode==='bulk-assign'?`${t('assignCategoryToSelected')} (${selectionCount??0})`:t('selectCategory')} width={460} initialFocusRef={first}
      footer={<div className="flex justify-end"><Button size="lg" variant="secondary" disabled={busy} onClick={onClose}>{t('close')}</Button></div>}>
      <div className="space-y-4">
        <Input ref={first} type="search" className="min-h-11" disabled={busy} aria-label={t('searchCategory')} placeholder={t('searchCategory')} value={search} onChange={event=>setSearch(event.target.value)}/>
        {error&&<p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}
        <div className="space-y-2">
          {mode==='filter'&&row(t('all'),categories.reduce((sum,category)=>sum+(category.count??0),0),currentCategory==='',()=>void select(null))}
          {filtered.map(category=>row(category.name,category.count??0,currentCategory===category.name,()=>void select(category.name),onEditCategory?()=>setEditing(category):undefined))}
          {filtered.length===0&&<p role="status" className="py-6 text-center text-sm text-fg-secondary">{t('noResults')}</p>}
        </div>
        {onCreateCategory&&<Button size="lg" variant="secondary" className="w-full" disabled={busy} onClick={()=>setEditing('new')}><Plus/>{t('createCategory')}</Button>}
      </div>
    </Drawer>
    {open&&editing&&<CategoryForm key={editing==='new'?'new':editing.name} entry={editing==='new'?undefined:editing} onClose={()=>setEditing(null)}
      onSave={async name=>{if(editing==='new')await onCreateCategory?.({name});else await onEditCategory?.(editing.name,{name});setEditing(null);}}
      onDelete={editing!=='new'&&editing.canDelete!==false&&onDeleteCategory?async()=>{await onDeleteCategory(editing.name);setEditing(null);}:undefined} deleteDescription={deleteDescription}/>}
  </>;
}

function CategoryForm({entry,onClose,onSave,onDelete,deleteDescription}: {entry?:CategoryDrawerEntry;onClose:()=>void;onSave:(name:string)=>Promise<void>;onDelete?:()=>Promise<void>;deleteDescription?:string}) {
  const {t}=useI18n();
  const [name,setName]=useState(entry?.name??'');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const first=useRef<HTMLInputElement>(null);
  const lock=useRef(false);
  const dirty=name!==(entry?.name??'');
  const close=()=>{if(!lock.current){if(dirty)setDiscard(true);else onClose();}};
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty||lock.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const save=async()=>{
    if(!name.trim()||lock.current)return;lock.current=true;setSaving(true);setError('');
    try{await onSave(name.trim());}catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(false);}
  };
  const remove=async()=>{
    if(!onDelete||lock.current)return;lock.current=true;setSaving(true);setDeleteError('');
    try{await onDelete();}catch(cause){setDeleteError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(false);}
  };
  return <>
    <Modal title={t(entry?'edit':'createCategory')} subtitle={entry?.name} initialFocusRef={first} onClose={close} closeDisabled={saving}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button><Button size="lg" disabled={!name.trim()||saving} onClick={()=>void save()}>{t(saving?'saving':entry?'save':'create')}</Button></div>}>
      <form onSubmit={event=>{event.preventDefault();void save();}}><Field label={t('categoryName')}><Input required ref={first} className="min-h-11" disabled={saving} value={name} onChange={event=>setName(event.target.value)}/></Field></form>
      {error&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{error}</p>}
      {onDelete&&<div className="mt-6 border-t border-[var(--line)] pt-4"><Button size="lg" variant="ghost" className="text-[var(--danger-500)]" disabled={saving} onClick={()=>{setDeleteError('');setDeleting(true);}}><Trash2/>{t('delete')}</Button></div>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
    {deleting&&<Modal title={t('delete')} subtitle={entry?.name} onClose={()=>{if(!lock.current)setDeleting(false);}} closeDisabled={saving}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={()=>setDeleting(false)}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={saving} onClick={()=>void remove()}>{t(saving?'saving':'delete')}</Button></div>}>
      {deleteDescription&&<p className="text-sm text-fg-secondary">{deleteDescription}</p>}{deleteError&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{deleteError}</p>}
    </Modal>}
  </>;
}
