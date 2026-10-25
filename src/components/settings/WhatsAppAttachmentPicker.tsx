'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Field, Select } from '@/components/ds';
import { ApiError, deleteWhatsAppMedia, getWhatsAppMedia, getWhatsAppMediaFile, uploadWhatsAppMedia, type WhatsAppAttachment, type WhatsAppMedia, type MetaWhatsAppTemplate } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Select one private fixed file or the current order's receipt for a media header. */
export function WhatsAppAttachmentPicker({ rid, format, value, disabled, onChange, onBusyChange, template }: { rid: number; template?: MetaWhatsAppTemplate; format: 'IMAGE' | 'DOCUMENT'; value?: WhatsAppAttachment; disabled?: boolean; onChange: (value: WhatsAppAttachment)=>void; onBusyChange?: (busy: boolean)=>void }) {
 const {t}=useI18n();
 const [files,setFiles]=useState<WhatsAppMedia[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [revision,setRevision]=useState(0),[deleting,setDeleting]=useState(false);
 const input=useRef<HTMLInputElement>(null),alive=useRef(false),operation=useRef(false);
 const callback=useRef(onBusyChange);callback.current=onBusyChange;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;callback.current?.(false)}},[]);
 useEffect(()=>{let current=true;setLoading(true);void getWhatsAppMedia(rid).then(result=>{if(!Array.isArray(result.media))throw new Error('Invalid file library');if(current){setFiles(result.media);setError('')}}).catch(()=>{if(current)setError('waAttachmentLoadFailed')}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[rid,revision]);
 useEffect(()=>{callback.current?.(busy);return()=>callback.current?.(false)},[busy]);
 const source=value?.source==='receipt'?'receipt':'fixed';
 const automatic=format==='IMAGE' && !!template?.image_available && !value?.asset_id && value?.source!=='fixed';
 const selected=files.find(file=>file.id===value?.asset_id);
 const choices=files.filter(file=>file.format===format);
 const locked=disabled || busy || loading;
 const upload=async(file?:File)=>{
  if(!file || locked || operation.current)return;
  const mime=format==='IMAGE'?['image/jpeg','image/png']:['application/pdf'];
  if(!mime.includes(file.type) || file.size===0 || file.size>(format==='IMAGE'?5:10)*1024*1024){setError('waAttachmentInvalid');return}
  operation.current=true;setBusy(true);setError('');
  onChange({source:'fixed',asset_id:''});
  try{const asset=await uploadWhatsAppMedia(rid,file);if(alive.current){setFiles(old=>[asset,...old]);onChange({source:'fixed',asset_id:asset.id})}}
  catch(e){if(alive.current){setError(e instanceof ApiError && e.message==='wa_meta_media_quota'?'waAttachmentQuota':'waAttachmentUploadFailed');setRevision(n=>n+1)}}
  finally{operation.current=false;if(alive.current)setBusy(false)}
 };
 const preview=async()=>{
  if(!selected || busy || operation.current)return;
  // Open synchronously so the browser does not block the authenticated preview.
  const tab=window.open('about:blank','_blank');if(!tab){setError('waAttachmentPreviewFailed');return}
  tab.opener=null;operation.current=true;setBusy(true);setError('');
  try{const blob=await getWhatsAppMediaFile(rid,selected.id);if(!alive.current){tab.close();return}const url=URL.createObjectURL(blob);tab.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),60000)}catch{tab.close();if(alive.current)setError('waAttachmentPreviewFailed')}
  finally{operation.current=false;if(alive.current)setBusy(false)}
 };
 return <div className="space-y-3">
  <div className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4" aria-hidden="true"/>{t('waAttachmentTitle')}</div>
  {format==='DOCUMENT' && <Field label={t('waAttachmentSource')}><Select aria-label={t('waAttachmentSource')} value={source} disabled={locked} onChange={event=>onChange({source:event.target.value as 'fixed'|'receipt',asset_id:''})}><option value="fixed">{t('waAttachmentFixed')}</option><option value="receipt">{t('waAttachmentReceipt')}</option></Select></Field>}
  {source==='receipt' && format==='DOCUMENT' ? <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waAttachmentReceiptHint')}</p> : <>
   <Field label={t(format==='IMAGE'?'waAttachmentPhoto':'waAttachmentPDF')}><Select aria-label={t(format==='IMAGE'?'waAttachmentPhoto':'waAttachmentPDF')} disabled={locked} value={automatic?'meta':value?.asset_id ?? ''} onChange={event=>onChange({source:event.target.value==='meta'?'meta':'fixed',asset_id:event.target.value==='meta'?'':event.target.value})}>{format==='IMAGE' && template?.image_available && <option value="meta">{t('waMetaImageSource')}</option>}<option value="">{t('waAttachmentChoose')}</option>{value?.asset_id && !selected && <option value={value.asset_id} disabled>{t('waAttachmentMissing')}</option>}{choices.map(file=><option key={file.id} value={file.id}>{file.filename}</option>)}</Select></Field>
   <div className="flex flex-wrap items-center gap-2">
    <input ref={input} className="sr-only" aria-label={t('waAttachmentUpload')} type="file" accept={format==='IMAGE'?'image/jpeg,image/png':'.pdf,application/pdf'} disabled={locked} onChange={event=>{void upload(event.target.files?.[0]);event.target.value=''}}/>
    <Button type="button" variant="secondary" size="sm" disabled={locked} onClick={()=>input.current?.click()}>{format==='IMAGE'?<ImageIcon className="h-4 w-4" aria-hidden="true"/>:<FileText className="h-4 w-4" aria-hidden="true"/>}{t('waAttachmentUpload')}</Button>
    {selected && <><Button type="button" variant="ghost" size="sm" disabled={busy || loading} onClick={()=>void preview()}>{t('waAttachmentPreview')}</Button><span className="text-xs text-[var(--fg-muted)]">{(selected.size/1024/1024).toFixed(1)} MB</span>{!disabled && <Button type="button" variant="ghost" size="sm" icon disabled={locked} aria-label={t('waAttachmentDelete')} onClick={()=>setDeleting(true)}><Trash2 className="h-4 w-4" aria-hidden="true"/></Button>}</>}
   </div>
   <p className="text-xs leading-5 text-[var(--fg-muted)]">{t(format==='IMAGE'?'waAttachmentPhotoHint':'waAttachmentPDFHint')}</p>
  </>}
  {loading && <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p>}
  {busy && <p role="status" className="text-sm text-[var(--fg-muted)]">{t('waAttachmentWorking')}</p>}
  {error && <div role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}{error==='waAttachmentLoadFailed' && <Button type="button" variant="ghost" size="sm" onClick={()=>setRevision(n=>n+1)}>{t('retry')}</Button>}</div>}
  <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t('waAttachmentDelete')} description={t('waAttachmentDeleteHint')} danger confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={()=>{
   setDeleting(false);if(!selected || operation.current)return;operation.current=true;setBusy(true);setError('');
   void deleteWhatsAppMedia(rid,selected.id).then(()=>{if(alive.current){setFiles(old=>old.filter(file=>file.id!==selected.id));onChange({source:'fixed',asset_id:''})}}).catch(e=>{if(alive.current)setError(e instanceof ApiError && e.message==='wa_meta_media_in_use'?'waAttachmentInUse':'waAttachmentDeleteFailed')}).finally(()=>{operation.current=false;if(alive.current)setBusy(false)});
  }}/>
 </div>;
}
