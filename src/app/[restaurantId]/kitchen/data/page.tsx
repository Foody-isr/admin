'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Database, Download, FlaskConical, History, Loader2, RotateCcw, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { actOnKitchenData, getKitchenData, getKitchenDataBackup, getKitchenDataOperation, parseKitchenData, previewKitchenData, type KitchenDataCatalog, type KitchenDataDetail, type KitchenDataPlan, type KitchenDataQuantity, type KitchenDataRow } from '@/lib/api';
import { ConfirmDialog } from '@/components/ds';
import styles from './workspace.module.css';

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function initialPlan(kind: KitchenDataPlan['kind'], name: string): KitchenDataPlan {
  const end = new Date(); end.setDate(end.getDate()-1); const start = new Date(end); start.setDate(start.getDate()-41);
  return { kind, name, from: day(start), to: day(end), rows: [], replace_dates: [], reset_reports: kind === 'reset', reset_movements: false, default_stock: kind === 'simulation' ? 10 : null, default_prep: kind === 'simulation' ? 10 : null, unit_defaults: {}, overrides: [], volume: 'normal', seed: 1, closed_weekdays: [] };
}
function download(name: string, body: string, type = 'application/json') { const url = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000); }

/** Review dated kitchen data operations without changing their API contracts. */
export default function KitchenDataPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const { hasPermission, loading } = usePermissions(); const { t } = useI18n();
  if (loading) return <p className={styles.page}>{t('kdLoading')}</p>;
  if (!hasPermission('kitchen.data_manage')) return <p className={styles.page} role="alert">{t('kdNoAccess')}</p>;
  return <Workspace key={restaurantId} rid={Number(restaurantId)} />;
}
function Workspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const planForm = useRef<HTMLFieldSetElement>(null);
  const [pendingLeave,setPendingLeave] = useState<(() => void) | null>(null);
  const [refreshPending,setRefreshPending] = useState(false);
  const [catalog, setCatalog] = useState<KitchenDataCatalog | null>(null);
  const [plan, setPlan] = useState(()=>initialPlan('history',t('kdhistory')));
  const [baseline,setBaseline] = useState(()=>JSON.stringify(plan));
  const dirty = JSON.stringify(plan) !== baseline;
  const [operation,setOperation] = useState<KitchenDataDetail | null>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const [confirmed,setConfirmed] = useState(false); const [restoreConfirmed,setRestoreConfirmed] = useState(false);
  const [query,setQuery] = useState(''); const [unlinkedOnly,setUnlinkedOnly] = useState(false); const [page,setPage] = useState(0);
  const [skipped,setSkipped] = useState(0); const [detailDate,setDetailDate] = useState('');
  useEffect(()=>{let current=true; getKitchenData(rid).then(v=>{if(current)setCatalog(v);}).catch(()=>{if(current)setError('kdError');});return()=>{current=false;};},[rid]);
  useEffect(()=>{const handler=(e: BeforeUnloadEvent)=>{if(busy || dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[busy,dirty]);
  const run = async (fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){const code=e instanceof Error?e.message:'';setError(t(`kdError_${code}`)!==`kdError_${code}`?`kdError_${code}`:'kdError');}finally{lock.current=false;setBusy(false);}};
  const change = (patch: Partial<KitchenDataPlan>) => {setPlan(p=>({...p,...patch}));setOperation(null);setConfirmed(false);setRestoreConfirmed(false);};
  const leave = (next: () => void) => { if(lock.current || refreshPending)return; if(dirty)setPendingLeave(()=>next);else next(); };
  const choose = (kind: KitchenDataPlan['kind'])=>leave(()=>{const next=initialPlan(kind,t('kd'+kind));setPlan(next);setBaseline(JSON.stringify(next));setOperation(null);setConfirmed(false);setRestoreConfirmed(false);setQuery('');setPage(0);setSkipped(0);setError('');setDetailDate('');setUnlinkedOnly(false);});
  const refresh = async()=>{setCatalog(await getKitchenData(rid));setRefreshPending(false);};
  const inspect = (id: string)=>leave(()=>void run(async()=>{const op=await getKitchenDataOperation(rid,id);setOperation(op);setPlan(op.plan);setBaseline(JSON.stringify(op.plan));setConfirmed(false);setRestoreConfirmed(false);setDetailDate('');setPage(0);setQuery('');}));
  const preview = async (next: KitchenDataPlan) => { const op=await previewKitchenData(rid,next);setOperation(op);setPlan(op.plan);setBaseline(JSON.stringify(op.plan));setCatalog(current=>current?{...current,operations:[op,...current.operations.filter(row=>row.id!==op.id)]}:current);setPage(0);setConfirmed(false);setRestoreConfirmed(false); };
  const mutateOperation = (action: 'apply'|'restore'|'archive') => run(async()=>{
    if(!operation || refreshPending)return;
    if(action==='apply' && (!confirmed || dirty))return;
    if(action==='restore' && !restoreConfirmed)return;
    const saved=await actOnKitchenData(rid,operation.id,action);
    setOperation(saved);setPlan(saved.plan);setBaseline(JSON.stringify(saved.plan));setConfirmed(false);setRestoreConfirmed(false);setRefreshPending(true);
    await refresh();
  });
  const importFiles = (files: File[]) => {
    if(!files.length)return;
    if(files.length>62 || files.some(file=>! /\.(csv|xlsx|pdf)$/i.test(file.name))){setError('kdError_invalid_files');return;}
    if(files.some(file=>file.size>10*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>25*1024*1024){setError('kdError_files_too_large');return;}
    void run(async()=>{const result=await parseKitchenData(rid,files);const dates=result.rows.map(row=>row.date).sort();change({rows:result.rows,from:dates[0]??plan.from,to:dates.at(-1)??plan.to});setSkipped(result.skipped_files);setPage(0);});
  };
  const inventory = useMemo(()=>[...(catalog?.stocks??[]),...(catalog?.preps??[])],[catalog]);
  const visibleRows = plan.rows.filter(r=>(!unlinkedOnly||!r.item_id)&&r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const visibleInventory = inventory.filter(r=>r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const number = (n: number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:3}).format(n);
  const tablePager = (count: number)=><div className={styles.pager}><span>{count===0?0:page*30+1}–{Math.min((page+1)*30,count)} / {count}</span><button disabled={page===0||busy} onClick={()=>setPage(v=>v-1)} aria-label={t('kdPrevious')}><ArrowLeft size={17} className="rtl:rotate-180"/></button><button disabled={(page+1)*30>=count||busy} onClick={()=>setPage(v=>v+1)} aria-label={t('kdNext')}><ArrowRight size={17} className="rtl:rotate-180"/></button></div>;
  const setOverride = (item: KitchenDataQuantity, value: string)=>change({overrides:[...plan.overrides.filter(o=>o.kind!==item.kind||o.item_id!==item.item_id),...(value===''?[]:[{kind:item.kind,item_id:item.item_id,quantity:Number(value)}])]});
  const stockSetup = <>
    <div className={styles.fields}>{(['stock','prep'] as const).map(kind=><label key={kind}>{t(kind==='stock'?'kdDefaultStock':'kdDefaultPrep')}<input type="number" min="0" step="any" placeholder={t('kdKeep')} value={plan[`default_${kind}`]??''} onChange={e=>change({[`default_${kind}`]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div>
    <details><summary>{t('kdPerUnit')}</summary><div className={styles.units}>{Array.from(new Set(catalog?.stocks.map(s=>s.unit))).map(unit=><label key={unit}>{unit}<input type="number" min="0" step="any" placeholder={t('kdKeep')} value={plan.unit_defaults[unit]??''} onChange={e=>{const values={...plan.unit_defaults};if(e.target.value==='')delete values[unit];else values[unit]=Number(e.target.value);change({unit_defaults:values});}}/></label>)}</div></details>
    <details><summary>{t('kdOverrides')} <span>{plan.overrides.length}</span></summary><input aria-label={t('kdSearch')} placeholder={t('kdSearch')} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><div className={styles.tableWrap} role="region" tabIndex={0} aria-label={t('kdQuantity')}><table><thead><tr><th scope="col">{t('kdProduct')}</th><th scope="col">{t('kdBefore')}</th><th scope="col">{t('kdAfter')}</th></tr></thead><tbody>{visibleInventory.slice(page*30,(page+1)*30).map(item=><tr key={`${item.kind}:${item.item_id}`}><td>{item.name}<small>{item.unit} · {item.kind==='prep'?t('preparations'):t('stock')}</small></td><td>{number(item.before)}</td><td><input aria-label={`${item.name} ${t('kdAfter')}`} type="number" min="0" step="any" placeholder={t('kdKeep')} value={plan.overrides.find(o=>o.kind===item.kind&&o.item_id===item.item_id)?.quantity??''} onChange={e=>setOverride(item,e.target.value)}/></td></tr>)}</tbody></table></div>{visibleInventory.length===0&&<p role="status">{t('kdNoResults')}</p>}{tablePager(visibleInventory.length)}</details>
  </>;
  const mapping = (row: KitchenDataRow) => {
    const choices=row.kind==='sale'?catalog?.items.map(i=>({id:i.id,name:i.name})): (row.kind.startsWith('prep_')?catalog?.preps:catalog?.stocks)?.map(i=>({id:i.item_id,name:`${i.name} · ${i.unit}`}));
    return <select aria-label={`${row.name} ${row.date}`} value={row.item_id} onChange={e=>change({rows:plan.rows.map(r=>r.name===row.name&&r.source===row.source&&r.kind.split('_')[0]===row.kind.split('_')[0]?{...r,item_id:Number(e.target.value)}:r)})}><option value={0}>{t('kdUnlinked')}</option>{choices?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>;
  };
  const hints: Record<string,string>={history:'kdHistoryHint',simulation:'kdSimulationHint',reset:'kdResetHint',opening:'kdOpeningHint'};
  return <main className={styles.page}>
    <header className={styles.header}><div><Link href={`/${rid}/kitchen/daily-operations`} onClick={event=>{event.preventDefault();leave(()=>router.push(`/${rid}/kitchen/daily-operations`));}}><ArrowLeft size={15} className="rtl:rotate-180"/>{t('companionTitle')}</Link><h1>{t('kdTitle')}</h1><p>{t('kdSubtitle')}</p></div><Database size={30} strokeWidth={1.3}/></header>
    <nav className={styles.modes} aria-label={t('kdTitle')}>{(['history','simulation','opening','reset'] as const).map(kind=><button key={kind} disabled={busy||refreshPending} aria-current={plan.kind===kind?'page':undefined} onClick={()=>choose(kind)}><strong>{t('kd'+kind)}</strong>{kind==='simulation'?<FlaskConical size={19}/>:kind==='reset'?<RotateCcw size={19}/>:kind==='history'?<Upload size={19}/>:<Database size={19}/>}</button>)}</nav>
    {error&&<div role="alert" className={styles.error}>{t(refreshPending?'kdRefreshSavedHint':error)}{(!catalog||refreshPending)&&<button disabled={busy} onClick={()=>run(refresh)}>{t('kdRetry')}</button>}{catalog&&!refreshPending&&operation&&dirty&&<button disabled={busy} onClick={()=>run(()=>preview(plan))}>{t('kdRetry')}</button>}</div>}
    {busy&&<div role="status" className={styles.loading}><Loader2 size={17} className="animate-spin"/>{t('kdLoading')}</div>}
    {!catalog?(!error&&<p role="status">{t('kdLoading')}</p>):<div className={styles.layout}>
      <section className={styles.surface} aria-busy={busy}>
        <div className={styles.intro}><span className={plan.kind==='simulation'?styles.simulation:styles.label}>{plan.kind==='simulation'?t('kdSimulationBanner'):t('kdReal')}</span><h2 dir="auto">{operation?operation.name:t('kd'+plan.kind)}</h2><p>{t(hints[plan.kind])}</p></div>
        {!operation?<fieldset ref={planForm} disabled={busy||refreshPending} className={styles.form}>
          <label>{t('kdName')}<input dir="auto" required value={plan.name} maxLength={120} onChange={e=>change({name:e.target.value})}/></label>
          {plan.kind!=='opening'&&!plan.all_dates&&<div className={styles.fields}><label>{t('kdFrom')}<input type="date" value={plan.from} onChange={e=>change({from:e.target.value})}/></label><label>{t('kdTo')}<input type="date" value={plan.to} onChange={e=>change({to:e.target.value})}/></label></div>}
          {plan.kind==='history'&&<>
            <div className={styles.upload}><Upload size={27}/><label>{t('kdFiles')}<input type="file" multiple accept=".csv,.xlsx,.pdf" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';importFiles(files);}}/></label><small>{t('kdError_files_too_large')}</small></div>
            <button className={styles.link} onClick={()=>download('kitchen-history.csv','date,kind,name,item_id,quantity,unit,line_total\n2026-09-24,sale,Example item,,12,unit,240\n','text/csv;charset=utf-8')}><Download size={15}/>{t('kdTemplate')}</button><p className={styles.help}>{t('kdFormat')}</p><details><summary>{t('kdKind')}</summary><p>{t('kdKinds')}</p></details>
            {skipped>0&&<p>{t('kdSkippedFiles')} : {skipped}</p>}
            {plan.rows.length>0&&<><div className={styles.toolbar}><h3>{t('kdMapping')}</h3><label className={styles.check}><input type="checkbox" checked={unlinkedOnly} onChange={e=>{setUnlinkedOnly(e.target.checked);setPage(0);}}/>{t('kdUnlinked')}</label></div><input placeholder={t('kdSearch')} aria-label={t('kdSearch')} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><div className={styles.tableWrap} role="region" tabIndex={0} aria-label={t('kdMapping')}><table><thead><tr><th scope="col">{t('kdDate')}</th><th scope="col">{t('kdProduct')}</th><th scope="col">{t('kdQuantity')}</th><th scope="col">{t('kdMapping')}</th></tr></thead><tbody>{visibleRows.slice(page*30,(page+1)*30).map((row,i)=><tr key={`${row.date}:${i}`}><td>{row.date}</td><td dir="auto">{row.name}<small>{t('kd'+row.kind)}</small></td><td><bdi dir="ltr">{number(row.quantity)} {row.unit}</bdi></td><td>{mapping(row)}</td></tr>)}</tbody></table></div>{visibleRows.length===0&&<p role="status">{t('kdNoResults')}</p>}{tablePager(visibleRows.length)}</>}
          </>}
          {plan.kind==='simulation'&&<><div className={styles.fields}><label>{t('kdVolume')}<select value={plan.volume} onChange={e=>change({volume:e.target.value as KitchenDataPlan['volume']})}>{['quiet','normal','busy'].map(v=><option key={v} value={v}>{t('kd'+v)}</option>)}</select></label><label>{t('kdSeed')}<input type="number" min="0" step="1" value={plan.seed} onChange={e=>change({seed:Number(e.target.value)})}/></label></div><div><h3>{t('kdClosedDays')}</h3><div className={styles.weekdays}>{Array.from({length:7},(_,i)=><label className={styles.check} key={i}><input type="checkbox" checked={plan.closed_weekdays.includes(i)} onChange={e=>change({closed_weekdays:e.target.checked?[...plan.closed_weekdays,i]:plan.closed_weekdays.filter(d=>d!==i)})}/>{new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2026,8,27+i))}</label>)}</div></div></>}
          {plan.kind==='reset'&&<><label className={styles.check}><input type="checkbox" checked={!!plan.all_dates} onChange={e=>change({all_dates:e.target.checked})}/>{t('kdAllDates')}</label>{plan.operation_id&&<p className={styles.label}>{t('kdScopedBatch')}</p>}<label className={styles.check}><input type="checkbox" checked={plan.reset_reports} onChange={e=>change({reset_reports:e.target.checked})}/>{t('kdResetReports')}</label>{!plan.operation_id&&<label className={styles.check}><input type="checkbox" checked={plan.reset_movements} onChange={e=>change({reset_movements:e.target.checked})}/>{t('kdResetMovements')}</label>}<p className={styles.help}>{t('kdPreserved')}</p></>}
          {plan.kind!=='history'&&stockSetup}
          <button className={styles.primary} disabled={busy||refreshPending||!plan.name.trim()||(plan.kind==='history'&&!plan.rows.length)} onClick={()=>{const invalid=Array.from(planForm.current?.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select')??[]).find(field=>!field.checkValidity());if(invalid){invalid.reportValidity();return;}void run(()=>preview(plan));}}>{t('kdPreview')}<ArrowRight size={17} className="rtl:rotate-180"/></button>
        </fieldset>:<div className={styles.form}>
          <div className={styles.toolbar}><span className={styles.label}>{t('kd'+operation.status)}</span>{operation.status==='draft'&&<button disabled={busy||refreshPending} className={styles.link} onClick={()=>{setOperation(null);setPage(0);setConfirmed(false);}}>{t('kdEdit')}</button>}</div>
          {operation.kind!=='simulation'&&<div className={styles.stats}>{[['kdReports',operation.review.reports],['kdSales',operation.review.sales],['kdMovements',operation.review.movements],['kdPreservedMovements',operation.review.preserved_movements]].map(([label,count])=><div key={label}><strong>{count}</strong><span>{t(String(label))}</span></div>)}</div>}
          <div className={styles.days} aria-label={t('kdDayDetail')}>{operation.review.days.map(d=><button key={d.date} disabled={busy||refreshPending} data-state={d.status} onClick={()=>setDetailDate(d.date)} aria-pressed={detailDate===d.date}><span>{new Date(d.date+'T12:00:00').toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short'})}</span><strong>{number(d.sales)}</strong><small>{t('kd'+d.status)}</small>{d.stockouts>0&&<small>{d.stockouts} {t('kdStockouts')}</small>}</button>)}</div>
          {operation.kind==='history'&&operation.status==='draft'&&operation.review.days.some(d=>d.status==='skip')&&<div>{operation.review.days.filter(d=>d.status==='skip').map(d=><label key={d.date} className={styles.check}><input type="checkbox" disabled={busy||refreshPending} checked={plan.replace_dates.includes(d.date)} onChange={e=>{const next={...plan,replace_dates:e.target.checked?[...plan.replace_dates,d.date]:plan.replace_dates.filter(x=>x!==d.date)};setPlan(next);setConfirmed(false);void run(()=>preview(next));}}/>{d.date} · {t('kdReplace')}</label>)}</div>}
          {operation.kind==='simulation'&&<><label>{t('kdDayDetail')}<select value={detailDate} onChange={e=>setDetailDate(e.target.value)}><option value="">{t('kdAll')}</option>{operation.review.days.map(d=><option key={d.date}>{d.date}</option>)}</select></label><div className={styles.tableWrap} role="region" tabIndex={0} aria-label={t('kdDayDetail')}><table><thead><tr>{['Date','Sales','Forecast','Receipts','Production','Waste','Stockouts'].map(v=><th scope="col" key={v}>{t('kd'+v)}</th>)}</tr></thead><tbody>{operation.review.days.filter(d=>!detailDate||d.date===detailDate).map(d=><tr key={d.date}><td>{d.date}</td><td>{number(d.sales)}</td><td>{d.samples?number(d.forecast):'—'}<small>{d.samples} {t('kdSamples')}</small></td><td>{d.receipts}</td><td>{d.production}</td><td>{d.waste}</td><td>{d.stockouts}</td></tr>)}</tbody></table></div>{detailDate&&<details open><summary>{t('kdDayDetail')}</summary><div className={styles.tableWrap} role="region" tabIndex={0} aria-label={t('kdDayDetail')}><table><tbody>{operation.review.simulation_rows?.filter(r=>r.date===detailDate).map((r,i)=><tr key={i}><td dir="auto">{r.name}</td><td>{t('kd'+r.kind)}</td><td><bdi dir="ltr">{number(r.quantity)} {r.unit}</bdi></td></tr>)}</tbody></table></div></details>}</>}
          {operation.review.quantities.length>0?<details open><summary>{t('kdQuantity')} · {operation.review.quantities.length}</summary><div className={styles.tableWrap} role="region" tabIndex={0} aria-label={t('kdQuantity')}><table className={styles.quantityTable}><thead><tr><th scope="col">{t('kdProduct')}</th><th scope="col">{t('kdBefore')}</th><th scope="col">{t('kdAfter')}</th></tr></thead><tbody>{operation.review.quantities.map(q=><tr key={`${q.kind}:${q.item_id}`}><td>{q.name}<small>{q.unit}</small></td><td>{number(q.before)}</td><td className={styles.newValue}>{number(q.after)}</td></tr>)}</tbody></table></div></details>:<p className={styles.help}>{t('kdNoQuantityChange')}</p>}
          {operation.review.unlinked>0&&<p className={styles.notice}>{operation.review.unlinked} · {t('kdUnlinked')}</p>}
          {operation.kind!=='simulation'&&<p className={styles.help}>{t('kdPreserved')}</p>}
          {operation.status==='draft'&&<div className={styles.confirm}><label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy||refreshPending} onChange={e=>setConfirmed(e.target.checked)}/>{t('kdConfirm')}</label><button className={operation.kind==='reset'?styles.danger:styles.primary} disabled={!confirmed||busy||refreshPending||dirty} onClick={()=>void mutateOperation('apply')}><Check size={17}/>{t('kdApply')}</button></div>}
          {operation.status==='applied'&&operation.kind!=='simulation'&&<><button className={styles.link} disabled={busy||refreshPending} onClick={()=>run(async()=>download(`kitchen-recovery-${operation.id}.json`,JSON.stringify(await getKitchenDataBackup(rid,operation.id),null,2)))}><Download size={16}/>{t('kdBackup')}</button><div className={styles.recovery}><label className={styles.check}><input type="checkbox" checked={restoreConfirmed} disabled={busy||refreshPending} onChange={e=>setRestoreConfirmed(e.target.checked)}/>{t('kdRestoreConfirm')}</label><button disabled={!restoreConfirmed||busy||refreshPending} onClick={()=>void mutateOperation('restore')}><RotateCcw size={16}/>{t('kdRestore')}</button></div>{operation.kind==='history'&&<button disabled={busy||refreshPending} onClick={()=>{setPlan({...initialPlan('reset',operation.name),from:operation.plan.from,to:operation.plan.to,operation_id:operation.id,reset_reports:true});setOperation(null);setConfirmed(false);}}>{t('kdResetBatch')}</button>}</>}
          {operation.kind==='simulation'&&<button disabled={busy||refreshPending} onClick={()=>{setPlan({...operation.plan,seed:operation.plan.seed+1});setOperation(null);setConfirmed(false);}}>{t('kdRestart')}</button>}
          {(operation.status==='draft'||(operation.kind==='simulation'&&operation.status==='applied'))&&<button className={styles.link} disabled={busy||refreshPending} onClick={()=>void mutateOperation('archive')}>{t('kdArchive')}</button>}
        </div>}
      </section>
      <aside className={styles.journal} aria-label={t('kdJournal')}><h2><History size={18}/>{t('kdJournal')}</h2><p>{catalog.operations.filter(op=>op.status!=='archived').length===0?t('kdEmptyJournal'):t('kdRestoreConfirm')}</p>{catalog.operations.filter(op=>op.status!=='archived').map(op=><button key={op.id} disabled={busy||refreshPending} aria-current={operation?.id===op.id?'true':undefined} onClick={()=>inspect(op.id)}><span>{t('kd'+op.kind)} · {t('kd'+op.status)}</span><strong dir="auto">{op.name}</strong><small>{new Date(op.created_at).toLocaleString(locale)}</small><ArrowRight size={15} className="rtl:rotate-180"/></button>)}</aside>
    </div>}
    <ConfirmDialog open={!!pendingLeave} onOpenChange={open=>{if(!open)setPendingLeave(null);}} title={t('discardUnsavedChanges')} description={t('kdDraftLeaveHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={()=>{const next=pendingLeave;setPendingLeave(null);next?.();}}/>
  </main>;
}
