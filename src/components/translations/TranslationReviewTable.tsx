'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table/DataTable';
import { Input, Select, Textarea } from '@/components/ds';
import type { TranslationReviewEntry } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { LOCALE_LABELS, SUPPORTED_LOCALES, SECTION_ORDER, SECTION_LABEL_KEY, sectionFor, usageTotal } from './sections';

interface Props {
 entries:TranslationReviewEntry[];
 onEdit:(text:string,locale:string,value:string)=>void;
 /** Saved restaurant locale in the language settings workspace. */
 sourceLocale?:string;
 /** Source locale for each independent section of the import preview. */
 sectionSources?:Record<string,string>;
 onSectionSourceChange?:(section:string,locale:string)=>void;
 disabled?:boolean;
}

/** Review deduplicated source texts with locale-labelled inputs and their shared usages. */
export default function TranslationReviewTable({entries,onEdit,sourceLocale,sectionSources,onSectionSourceChange,disabled=false}:Props) {
 const {t}=useI18n();const id=useId();const [query,setQuery]=useState('');const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
 const sections=useMemo(()=>{
  const q=query.trim().toLowerCase();const filtered=q?entries.filter(entry=>entry.text.toLowerCase().includes(q)||Object.values(entry.translations).some(value=>value.toLowerCase().includes(q))):entries;
  const grouped:Record<string,TranslationReviewEntry[]>={};for(const entry of filtered)(grouped[sectionFor(entry.usage)]??=[]).push(entry);
  return SECTION_ORDER.filter(key=>grouped[key]?.length).map(key=>({key,rows:grouped[key]}));
 },[entries,query]);
 if(!entries.length)return <p className="text-sm text-[var(--fg-muted)]">{t('trReviewEmpty')}</p>;
 return <div className="space-y-5">
  <div className="relative max-w-md"><SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]"/><Input aria-label={t('trReviewSearch')} dir="auto" className="ps-10" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('trReviewSearch')}/></div>
  {!sections.length&&<p role="status" className="text-sm text-[var(--fg-muted)]">{t('trReviewNoResults')}</p>}
  {sections.map(({key,rows})=>{
   const source=sectionSources?(sectionSources[key]??'en'):(sourceLocale??'en');const targets=SUPPORTED_LOCALES.filter(value=>value!==source);const closed=collapsed[key]??false;
   return <section key={key} aria-label={t(SECTION_LABEL_KEY[key])}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><button type="button" aria-expanded={!closed} aria-controls={`${id}-${key}`} onClick={()=>setCollapsed(current=>({...current,[key]:!closed}))} className="flex min-h-11 items-center gap-2 text-start font-semibold"><ChevronDownIcon aria-hidden="true" className={`size-4 ${closed?'-rotate-90 rtl:rotate-90':''}`}/>{t(SECTION_LABEL_KEY[key])}<span className="text-sm font-normal text-[var(--fg-muted)]">({rows.length})</span></button>
     {sectionSources&&<label className="flex flex-wrap items-center gap-2 text-sm text-[var(--fg-muted)]">{t('importSectionSourceLabel')}<Select aria-label={`${t('importSectionSourceLabel')} · ${t(SECTION_LABEL_KEY[key])}`} className="w-auto" value={source} disabled={disabled||!onSectionSourceChange} onChange={event=>onSectionSourceChange?.(key,event.target.value)}>{SUPPORTED_LOCALES.map(value=><option key={value} value={value}>{LOCALE_LABELS[value]}</option>)}</Select></label>}
    </div>
    <div id={`${id}-${key}`} hidden={closed}><DataTable><DataTableHead><DataTableHeadCell className="md:w-1/3">{LOCALE_LABELS[source]??source}</DataTableHeadCell>{targets.map(target=><DataTableHeadCell key={target} className="md:w-1/3">{LOCALE_LABELS[target]}</DataTableHeadCell>)}</DataTableHead><DataTableBody>{rows.map((row,index)=><DataTableRow key={row.text} index={index}>
     <DataTableCell mobilePrimary className="align-top"><p dir={source==='he'?'rtl':'ltr'} className="whitespace-pre-wrap break-words text-sm">{row.text}</p>{usageTotal(row.usage)>1&&<p className="mt-2 text-xs font-normal text-[var(--fg-muted)]">{t('trReviewUsedIn').replace('{count}',String(usageTotal(row.usage)))}</p>}</DataTableCell>
     {targets.map(target=><DataTableCell key={target} mobileLabel={LOCALE_LABELS[target]} className="align-top"><Textarea className="min-w-0 flex-1" aria-label={`${LOCALE_LABELS[target]} · ${row.text}`} dir={target==='he'?'rtl':'ltr'} rows={3} disabled={disabled} value={row.translations[target]??''} onChange={event=>onEdit(row.text,target,event.target.value)}/></DataTableCell>)}
    </DataTableRow>)}</DataTableBody></DataTable></div>
   </section>;
  })}
 </div>;
}
