'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Languages, RefreshCw } from 'lucide-react';
import { getRestaurant, updateRestaurant, retranslatePreview, applyTranslations, type TranslationReviewEntry } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, PageHead, Section, Select } from '@/components/ds';
import TranslationReviewTable from '@/components/translations/TranslationReviewTable';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/components/translations/sections';

function isLocale(value:unknown):value is Locale{return value==='en'||value==='fr'||value==='he';}

/** Keep the saved source language and the reviewed translation draft in one restaurant scope. */
export default function LanguageSettingsPage(){const {restaurantId}=useParams();const rid=Number(restaurantId);return <LanguageWorkspace key={rid} rid={rid}/>;}

function LanguageWorkspace({rid}:{rid:number}) {
 const {t}=useI18n();const {hasAnyPermission}=usePermissions();const canEdit=hasAnyPermission('settings.edit');const canTranslate=hasAnyPermission('menu.edit');
 const [locale,setLocale]=useState<Locale>('en');const [savedLocale,setSavedLocale]=useState<Locale>('en');const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');
 const [busy,setBusy]=useState<'locale'|'preview'|'apply'|null>(null);const [saveError,setSaveError]=useState('');const [saved,setSaved]=useState(false);
 const [review,setReview]=useState<{entries:TranslationReviewEntry[];source:string}|null>(null);const [reviewError,setReviewError]=useState('');const [result,setResult]=useState('');const [discard,setDiscard]=useState(false);const [confirm,setConfirm]=useState(false);
 const translations=useRef(t);translations.current=t;
 const request=useRef({value:0});const lock=useRef(false);
 const load=useCallback(async()=>{const sequence=++request.current.value;setLoading(true);setLoadError('');try{const restaurant=await getRestaurant(rid);if(sequence!==request.current.value)return;const value=isLocale(restaurant.default_locale)?restaurant.default_locale:'en';setLocale(value);setSavedLocale(value);}catch(cause){if(sequence===request.current.value)setLoadError(cause instanceof Error?cause.message:translations.current('loadFailed'));}finally{if(sequence===request.current.value)setLoading(false);}},[rid]);
 useEffect(()=>{const scope=request.current;void load();return()=>{scope.value+=1;};},[load]);
 const dirty=locale!==savedLocale||review!==null;
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty||lock.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const saveLocale=async()=>{
  if(lock.current||!canEdit||loading||loadError||review||locale===savedLocale)return;lock.current=true;setBusy('locale');setSaveError('');setSaved(false);
  try{const updated=await updateRestaurant(rid,{default_locale:locale});const canonical=isLocale(updated.default_locale)?updated.default_locale:locale;setLocale(canonical);setSavedLocale(canonical);setSaved(true);}catch(cause){setSaveError(cause instanceof Error?cause.message:t('saveFailed'));}finally{lock.current=false;setBusy(null);}
 };
 const preview=async()=>{
  if(lock.current||!canTranslate||loading||loadError||locale!==savedLocale||review)return;lock.current=true;setBusy('preview');setReviewError('');setResult('');
  try{const response=await retranslatePreview(rid);setReview({entries:response.entries,source:response.sourceLocale});}catch(cause){setReviewError(cause instanceof Error?cause.message:t('languageRetranslateFailed'));}finally{lock.current=false;setBusy(null);}
 };
 const apply=async()=>{
  if(lock.current||!canTranslate||!review?.entries.length)return;lock.current=true;setBusy('apply');setReviewError('');
  try{const counts=await applyTranslations(rid,Object.fromEntries(review.entries.map(entry=>[entry.text,entry.translations])));const total=counts.items+counts.groups+counts.modifier_sets+counts.modifiers+counts.variant_groups+counts.variants+(counts.option_sets??0)+(counts.options??0);setResult(t('languageRetranslateSummary').replace('{count}',String(total)));setReview(null);}catch(cause){setReviewError(`${t('languageApplyPartialError')} ${cause instanceof Error?cause.message:t('saveFailed')}`);}finally{lock.current=false;setBusy(null);}
 };
 const edit=(text:string,target:string,value:string)=>{if(lock.current||!canTranslate)return;setReview(current=>current?{...current,entries:current.entries.map(entry=>entry.text===text?{...entry,translations:{...entry.translations,[target]:value}}:entry)}:null);};
 return <div className="space-y-6">
  <PageHead title={t('languageSettings')} desc={t('languageSettingsDesc')}/>
  {loading?<p role="status" className="py-12 text-sm">{t('loading')}</p>:loadError?<div role="alert" className="rounded-xl border border-[var(--line)] p-5"><p className="text-sm text-[var(--danger-500)]">{loadError}</p><Button variant="secondary" className="mt-3" onClick={()=>void load()}>{t('retry')}</Button></div>:<>
   <Section title={<span className="flex items-center gap-2"><Languages className="size-4" aria-hidden="true"/>{t('languageDefaultTitle')}</span>} desc={t('languageDefaultDesc')}>
    <Field label={t('languageFieldLabel')} className="max-w-sm"><Select value={locale} disabled={!!busy||!canEdit||!!review} onChange={event=>{if(isLocale(event.target.value)){setLocale(event.target.value);setSaved(false);setSaveError('');}}}>{SUPPORTED_LOCALES.map(value=><option key={value} value={value}>{LOCALE_LABELS[value]}</option>)}</Select></Field>
    {locale!==savedLocale&&<p className="mt-4 rounded-lg bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('languageChangeWarning')}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">{canEdit&&<Button disabled={!!busy||locale===savedLocale||!!review} onClick={()=>void saveLocale()}>{t(busy==='locale'?'saving':'save')}</Button>}{saved&&<p role="status" className="text-sm text-[var(--success-500)]">{t('saved')}</p>}{saveError&&<p role="alert" className="text-sm text-[var(--danger-500)]">{saveError}</p>}</div>
   </Section>
   <Section title={<span className="flex items-center gap-2"><RefreshCw className="size-4" aria-hidden="true"/>{t('languageRetranslateTitle')}</span>} desc={t('languageReviewDescription')}>
    <p className="mb-4 rounded-lg bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--fg-muted)]">{t('languageReviewEffect')}</p>
    {locale!==savedLocale&&<p className="mb-4 text-sm text-[var(--fg-muted)]">{t('languageSaveBeforeReview')}</p>}
    {review?<div className="space-y-4"><p className="text-sm text-[var(--fg-muted)]">{t('trReviewIntro')}</p><TranslationReviewTable entries={review.entries} sourceLocale={review.source} onEdit={edit} disabled={!!busy||!canTranslate}/><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={!!busy} onClick={()=>review.entries.length?setDiscard(true):setReview(null)}>{t('cancel')}</Button>{canTranslate&&<Button disabled={!!busy||!review.entries.length} onClick={()=>setConfirm(true)}>{t(busy==='apply'?'saving':'trReviewApply')}</Button>}</div></div>:canTranslate&&<Button variant="secondary" disabled={!!busy||locale!==savedLocale} onClick={()=>void preview()}>{t(busy==='preview'?'languageRetranslating':'languageReviewPreview')}</Button>}
    {reviewError&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{reviewError}</p>}{result&&<p role="status" className="mt-4 text-sm text-[var(--success-500)]">{result}</p>}
   </Section>
  </>}
  <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={()=>{setReview(null);setReviewError('');}}/>
  <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('trReviewApply')} description={t('languageApplyConfirm').replace('{count}',String(review?.entries.length??0))} confirmLabel={t('trReviewApply')} cancelLabel={t('cancel')} onConfirm={()=>void apply()}/>
 </div>;
}
