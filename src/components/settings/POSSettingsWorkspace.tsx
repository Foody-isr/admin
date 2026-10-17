 'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus, Trash2, X, ArrowLeft } from 'lucide-react';
import { getAllCategories, listDevices, type FullServiceSettings, type MenuCategory, type POSMode, type POSFulfillment, type POSFulfillmentMethod, type POSCheckBehavior, type RestaurantDevice } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, ConfirmDialog, Drawer, Input } from '@/components/ds';
import { ChoiceRow } from '@/components/ds/Selection';
import { usePOSSettings } from './usePOSSettings';
import './pos-settings.css';
import { fulfillmentCatalog, withFulfillmentCatalog, validFulfillment } from '@/lib/pos-fulfillment';

type View = 'services' | 'menu-behavior' | 'fulfillment' | 'modes' | 'mode' | 'adjustments';
type Policy = ReturnType<typeof usePOSSettings>;

/** Restaurant settings arranged by the Square service, fulfillment and POS-mode responsibilities. */
export function POSSettingsWorkspace({ view, modeId = 'default', section = '' }: { view: View; modeId?: string; section?: string }) {
 const {restaurantId}=useParams();
 return <Workspace key={`${restaurantId}/${view}/${modeId}`} rid={Number(restaurantId)} view={view} modeId={modeId} section={section}/>;
}
/** Native accessible toggle using Square's switch dimensions in this workspace. */
function BooleanInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
 return <input {...props} type="checkbox" role="switch" className="pos-toggle"/>;
}
function Workspace({rid,view,modeId,section}:{rid:number;view:View;modeId:string;section:string}) {
 const editorRef=useRef<HTMLDivElement>(null);
 const {t}=useI18n(), policy=usePOSSettings(rid, view==='mode'?`/${rid}/settings/modes/${modeId}`:undefined), router=useRouter();
 const titles:Record<View,string>={services:'posServices', 'menu-behavior':'posMenuBehavior',fulfillment:'posFulfillmentTitle',modes:'posModes',mode:'posFullServiceMode',adjustments:'posAdjustmentReasons'};
 const title = view==='mode' ? policy.draft?.modes?.find(m=>m.id===modeId)?.name??t(modeId==='default'?'posRestaurantDefaults':'posFullServiceMode') : t(titles[view]);
 const exit=()=>{if(policy.saving)return;const path=`/${rid}/settings/modes`;if(policy.dirty)policy.setLeaving(path);else router.push(path);};
 const content=<>
  {!policy.draft ? <div role={policy.error?'alert':'status'}><p>{policy.error||t('loading')}</p>{policy.error&&<Button type="button" onClick={policy.reload}>{t('retry')}</Button>}</div> : <form id="pos-settings-form" onSubmit={e=>{e.preventDefault();void policy.save();}}>
   <fieldset disabled={!policy.editable||policy.saving} className="min-w-0">
    {view==='services'&&<Services policy={policy} rid={rid}/>}
    {view==='menu-behavior'&&<MenuBehavior policy={policy}/>}
    {view==='fulfillment'&&<Fulfillment policy={policy}/>}
    {view==='modes'&&<Modes policy={policy} rid={rid}/>}
    {view==='mode'&&<ModeEditor policy={policy} rid={rid} id={modeId} section={section}/>}
    {view==='adjustments'&&<Reasons policy={policy}/>}
   </fieldset>
  </form>}
  {policy.error&&policy.draft&&<p role="alert" className="pos-error">{policy.error}</p>}
 </>;
 const save=<Button form="pos-settings-form" type="submit" disabled={!policy.editable||!policy.dirty||policy.saving}>{t(policy.saving?'saving':'save')}</Button>;
 return <>
  {view==='mode'?<Dialog.Root open onOpenChange={open=>{if(!open)exit();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]"/><Dialog.Content ref={editorRef} onOpenAutoFocus={e=>{e.preventDefault();editorRef.current?.focus();}} aria-describedby={undefined} className="pos-settings pos-mode-editor" data-pos-settings="mode">
   <header className="pos-editor-head"><Button type="button" variant="secondary" icon aria-label={t('close')} disabled={policy.saving} onClick={exit}><X/></Button><div><p>{t(modeId==='default'?'posDefaultsHint':'posModeSharedHint')}</p><Dialog.Title>{title}</Dialog.Title></div>{save}</header>
   <div className="pos-editor-layout"><aside><h2>{t('settings')}</h2><Link href={`/${rid}/settings/modes/${modeId}`} aria-current={section!=='open-checks'?'page':undefined}>{t('posCheckout')}</Link><Link href={`/${rid}/settings/modes/${modeId}/open-checks`} aria-current={section==='open-checks'?'page':undefined}>{t('posOpenChecks')}</Link></aside><main>{content}</main></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>:<div className="pos-settings" data-pos-settings={view}>
   <header className="pos-settings-header"><h1>{title}</h1>{view!=='modes'&&view!=='fulfillment'&&save}</header>{content}
  </div>}
  <ConfirmDialog open={policy.leaving!==null} onOpenChange={open=>{if(!open)policy.setLeaving(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={policy.discard}/>
 </>;
}
function SettingSection({title,children,hint}:{title:string;children:ReactNode;hint?:string}) {
 return <section className="pos-setting-section"><h2>{title}</h2>{hint&&<p className="pos-setting-hint">{hint}</p>}{children}</section>;
}
function SettingLink({href,label,detail}:{href:string;label:string;detail?:string}) {
 return <Link className="pos-setting-row" href={href}><strong>{label}</strong><span className="pos-row-detail">{detail}<ChevronRight aria-hidden className="size-5 rtl:rotate-180"/></span></Link>;
}
function Services({policy,rid}:{policy:Policy;rid:number}) {
 const {t}=useI18n(),draft=policy.draft!;
 const [editing,setEditing]=useState<number|null>(null),[name,setName]=useState(''),[dragged,setDragged]=useState<number|null>(null);
 const [categories,setCategories]=useState<MenuCategory[]|null>(null),[picker,setPicker]=useState(false),[categoryError,setCategoryError]=useState(''),[categorySelection,setCategorySelection]=useState<number[]>([]);
 const [confirmDelete,setConfirmDelete]=useState(false);
 const move=(from:number,to:number)=>{if(from===to||to<0||to>=draft.courses.length)return;const courses=[...draft.courses];courses.splice(to,0,courses.splice(from,1)[0]);policy.patch({courses});};
 const openCategoryPicker=()=>{setPicker(true);setCategorySelection(draft.immediate_category_ids??[]);setCategoryError('');getAllCategories(rid).then(setCategories).catch(()=>setCategoryError(t('tableSettingsLoadFailed')));};
 const applyName=()=>{const value=name.trim();if(!value||Array.from(value).length>80||draft.courses.some((n,i)=>i!==editing&&n.toLowerCase()===value.toLowerCase())){policy.setError(t('fullServiceInvalid'));return;}const courses=[...draft.courses];if(editing===draft.courses.length)courses.push(value);else courses[editing!]=value;policy.patch({courses});setEditing(null);};
 return <>
  <p className="pos-setting-hint">{t('posServicesIntro')}</p>
  <section className="pos-course-list"><h2>{t('name')}</h2>
   <button className="pos-setting-row" type="button" onClick={openCategoryPicker}><strong>{t('posImmediateSend')}</strong><span className="pos-row-detail">{t('posAssignedCategories').replace('{n}',String(draft.immediate_category_ids?.length??0))}<ChevronRight aria-hidden className="size-5 rtl:rotate-180"/></span></button>
   {draft.courses.map((course,index)=><div key={course} className="pos-setting-row pos-course-row" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(dragged!==null)move(dragged,index);setDragged(null);}}>
    <button type="button" className="pos-course-name" onClick={()=>{setEditing(index);setName(course);}}>{course}</button>
    <div className="pos-course-controls"><Button type="button" variant="ghost" icon aria-label={`${t('posMoveUp')} ${course}`} disabled={index===0||!policy.editable||policy.saving} onClick={()=>move(index,index-1)}><ArrowUp/></Button><Button type="button" variant="ghost" icon aria-label={`${t('posMoveDown')} ${course}`} disabled={index===draft.courses.length-1||!policy.editable||policy.saving} onClick={()=>move(index,index+1)}><ArrowDown/></Button>
    <button type="button" className="pos-drag-handle" aria-label={`${t('posReorder')} ${course}`} draggable={policy.editable&&!policy.saving} onDragStart={()=>setDragged(index)} onDragEnd={()=>setDragged(null)}><GripVertical aria-hidden/></button></div>
   </div>)}
   <Button type="button" variant="secondary" className="pos-add-course" disabled={draft.courses.length>=12||!policy.editable||policy.saving} onClick={()=>{setEditing(draft.courses.length);setName('');}}><Plus/>{t('posAddCourse')}</Button>
   <p className="pos-setting-hint">{t('posCourseOrderHint')}</p>
  </section>
  <SettingSection title={t('posPrintedCourseTickets')}>
   <ChoiceRow type="radio" name="course-ticket-policy" label={t('posPrintFiredHeld')} description={t('posPrintFiredHeldHint')} checked={draft.course_ticket_policy==='fired_and_held'} onChange={()=>policy.patch({course_ticket_policy:'fired_and_held'})}/>
   <ChoiceRow type="radio" name="course-ticket-policy" label={t('posPrintFiredOnly')} description={t('posPrintFiredOnlyHint')} checked={(draft.course_ticket_policy??'fired_only')==='fired_only'} onChange={()=>policy.patch({course_ticket_policy:'fired_only'})}/>
  </SettingSection>
  <Drawer open={editing!==null} onOpenChange={open=>{if(!open)setEditing(null);}} title={t(editing===draft.courses.length?'posAddCourse':'posEditCourse')} onSave={applyName} saveLabel={t('apply')} saveDisabled={!policy.editable||policy.saving||!name.trim()}>
   <label className="pos-inset-field">{t('name')}<Input disabled={!policy.editable||policy.saving} aria-label={t('name')} value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
   {editing!==null&&editing<draft.courses.length&&<Button type="button" variant="danger" className="mt-8" disabled={!policy.editable||draft.courses.length<=1||policy.saving} onClick={()=>setConfirmDelete(true)}><Trash2/>{t('delete')}</Button>}
  </Drawer>
  <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t('posDeleteCourse')} confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={()=>{policy.patch({courses:draft.courses.filter((_,i)=>i!==editing)});setConfirmDelete(false);setEditing(null);}}/>
  <Drawer open={picker} onOpenChange={setPicker} title={t('posImmediateSend')} subtitle={t('posImmediateHint')} onSave={()=>{policy.patch({immediate_category_ids:categorySelection});setPicker(false);}} saveLabel={t('apply')} saveDisabled={!categories||!!categoryError||!policy.editable||policy.saving}>
   {categoryError?<div role="alert">{categoryError}<Button type="button" onClick={openCategoryPicker}>{t('retry')}</Button></div>:!categories?<p role="status">{t('loading')}</p>:categories.map(c=><ChoiceRow key={c.id} label={c.name} checked={categorySelection.includes(c.id)} disabled={!policy.editable||policy.saving} onChange={e=>setCategorySelection(e.target.checked?[...categorySelection,c.id]:categorySelection.filter(id=>id!==c.id))}/>)}
  </Drawer>
 </>;
}
function MenuBehavior({policy}:{policy:Policy}) {
 const {t}=useI18n(),entry=policy.draft!.order_entry??{tile_size:'tall',return_to_menu:'home'};
 return <SettingSection title={t('posAfterAddingItem')}>
  {(['home','previous'] as const).map(value=><ChoiceRow key={value} type="radio" name="return-menu" label={t(value==='home'?'posReturnHome':'posStayPrevious')} checked={entry.return_to_menu===value} onChange={()=>policy.patch({order_entry:{...entry,return_to_menu:value}})}/>)}
 </SettingSection>;
}
function Fulfillment({policy}:{policy:Policy}) {
 const {t}=useI18n(),draft=policy.draft!;
 const [open,setOpen]=useState(false),[discard,setDiscard]=useState(false),[editing,setEditing]=useState<POSFulfillmentMethod|null>(null),[methodError,setMethodError]=useState(''),[dragged,setDragged]=useState<number|null>(null);
 const snapshot=useRef(draft.fulfillment);
 const value:POSFulfillment=draft.fulfillment??{prompt:'never',default:'pickup',enabled:['dine_in','pickup','delivery']};
 const methods=fulfillmentCatalog(value);
 const label=(method:POSFulfillmentMethod)=>method.name||t(method.id==='dine_in'?'dineIn':method.id==='collect'?'posDiningCollect':['pickup','delivery'].includes(method.id)?method.id:'posDiningNamePlaceholder');
 const patch=(next:Partial<POSFulfillment>)=>policy.patch({fulfillment:{...withFulfillmentCatalog(value,methods),...next}});
 const commit=(next:POSFulfillmentMethod[],enabled=value.enabled)=>policy.patch({fulfillment:withFulfillmentCatalog(value,next,enabled)});
 const close=()=>{if(policy.saving)return;if(JSON.stringify(snapshot.current)!==JSON.stringify(policy.draft?.fulfillment))setDiscard(true);else setOpen(false);};
 const move=(from:number,to:number)=>{if(from===to||to<0||to>=methods.length||!policy.editable||policy.saving)return;const next=[...methods];next.splice(to,0,next.splice(from,1)[0]);commit(next);};
 const edit=(method:POSFulfillmentMethod)=>{setMethodError('');setEditing({...method});};
 const apply=()=>{if(!editing)return;const method={...editing,name:editing.name.trim()};const exists=methods.some(m=>m.id===method.id);const next=exists?methods.map(m=>m.id===method.id?method:m):[...methods,method];const nextPolicy=withFulfillmentCatalog(value,next,exists?value.enabled:[...value.enabled,method.id]);if(!validFulfillment(nextPolicy)){setMethodError(t('fullServiceInvalid'));return;}policy.patch({fulfillment:nextPolicy});setEditing(null);};
 const remove=()=>{if(!editing)return;const next=methods.filter(m=>m.id!==editing.id);const nextPolicy=withFulfillmentCatalog(value,next);if(!validFulfillment(nextPolicy)){setMethodError(t('posDiningKeepOne'));return;}policy.patch({fulfillment:nextPolicy});setEditing(null);};
 return <>
  <p className="pos-setting-hint">{t('posFulfillmentIntro')}</p>
  <Button type="button" className="my-8" onClick={()=>{snapshot.current=draft.fulfillment;setOpen(true);}}>{t('posManageLocation')}</Button>
  {!open&&<div>{value.enabled.map(id=>{const method=methods.find(m=>m.id===id);return method&&<div className="pos-setting-row" key={id}><strong>{label(method)}</strong><span className="pos-row-detail">{value.default===id?t('posDefault'):''}</span></div>;})}</div>}
  <Dialog.Root open={open} onOpenChange={next=>{if(!next)close();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]"/><Dialog.Content aria-describedby={undefined} className="pos-settings pos-fulfillment-editor">
   <header className="pos-editor-head"><Button type="button" variant="secondary" icon aria-label={t('close')} disabled={policy.saving} onClick={close}><X/></Button><Dialog.Title>{t('posFulfillmentLocation')}</Dialog.Title><Button type="button" disabled={!policy.editable||!policy.dirty||policy.saving} onClick={async()=>{if(await policy.save())setOpen(false);}}>{t(policy.saving?'saving':'save')}</Button></header>
   <main><p className="pos-setting-hint">{t('posDiningFirstDefault')}</p><fieldset disabled={!policy.editable||policy.saving}>
    <SettingSection title={t('posFulfillmentLocation')}>
     <label className="pos-setting-row"><span><strong>{t('posFulfillmentPrompt')}</strong></span><BooleanInput aria-label={t('posFulfillmentPrompt')} checked={value.prompt!=='never'} onChange={e=>patch({prompt:e.target.checked?'start':'never'})}/></label>
     {value.prompt!=='never'&&(['start','checkout'] as const).map(when=><ChoiceRow key={when} name="fulfillment-prompt" type="radio" label={t(when==='start'?'posPromptStart':'posPromptCheckout')} checked={value.prompt===when} onChange={()=>patch({prompt:when})}/>)}
    </SettingSection>
    <SettingSection title={t('posFulfillmentMethods')} hint={t('posDiningFirstDefault')}>
     {methods.map((method,index)=><div key={method.id} className="pos-setting-row pos-course-row" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged!==null)move(dragged,index);setDragged(null);}}>
      <button type="button" className="pos-course-name" onClick={()=>edit(method)}>{label(method)}{value.default===method.id&&<span className="pos-default-badge">{t('posDefault')}</span>}</button>
      <span className="pos-course-controls">
       <Button type="button" variant="ghost" icon aria-label={`${t('posMoveUp')} ${label(method)}`} disabled={index===0} onClick={()=>move(index,index-1)}><ArrowUp/></Button>
       <Button type="button" variant="ghost" icon aria-label={`${t('posMoveDown')} ${label(method)}`} disabled={index===methods.length-1} onClick={()=>move(index,index+1)}><ArrowDown/></Button>
       <span draggable={!policy.saving&&policy.editable} onDragStart={()=>setDragged(index)} onDragEnd={()=>setDragged(null)} className="pos-grip" aria-hidden><GripVertical/></span>
       <BooleanInput aria-label={label(method)} checked={value.enabled.includes(method.id)} disabled={value.enabled.length===1&&value.enabled.includes(method.id)} onChange={e=>commit(methods,e.target.checked?[...value.enabled,method.id]:value.enabled.filter(id=>id!==method.id))}/>
      </span>
     </div>)}
     <Button type="button" variant="secondary" disabled={methods.length>=10} onClick={()=>edit({id:crypto.randomUUID(),name:'',order_type:'pickup'})}><Plus/>{t('posDiningAdd')}</Button>
    </SettingSection>
   </fieldset>{policy.error&&<p role="alert" className="pos-error">{policy.error}</p>}</main>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
  <Drawer open={editing!==null} onOpenChange={next=>{if(!next)setEditing(null);}} title={t('posDiningEdit')} footer={<><Button type="button" variant="secondary" onClick={()=>setEditing(null)}>{t('cancel')}</Button><Button type="button" disabled={!policy.editable||policy.saving} onClick={apply}>{t('done')}</Button></>}>
   {editing&&<fieldset disabled={!policy.editable||policy.saving} className="space-y-6">
    <label className="block"><span className="block mb-2 font-semibold">{t('posDiningDisplayText')}</span><Input value={editing.name} maxLength={80} placeholder={label({...editing,name:''})} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
    <fieldset><legend className="font-semibold mb-2">{t('orderType')}</legend>{(['dine_in','pickup','delivery'] as const).map(type=><ChoiceRow key={type} name="dining-order-type" type="radio" label={t(type==='dine_in'?'dineIn':type)} checked={editing.order_type===type} onChange={()=>setEditing({...editing,order_type:type})}/>)}</fieldset>
    {methodError&&<p role="alert" className="pos-error">{methodError}</p>}
    {methods.some(m=>m.id===editing.id)&&<Button type="button" variant="ghost" onClick={remove}>{t('delete')}</Button>}
   </fieldset>}
  </Drawer>
  <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{policy.patch({fulfillment:snapshot.current});setDiscard(false);setOpen(false);}}/>
 </>;
}
function modeDefaults(draft:FullServiceSettings):Omit<POSMode,'id'|'name'|'device_ids'> {
 return {check_behavior:draft.check_behavior,seating_mode:draft.seating_mode,send_and_stay:draft.send_and_stay,coursing_enabled:draft.coursing_enabled,auto_progression:draft.auto_progression??false,tile_size:draft.order_entry?.tile_size??'tall',sort_cart:draft.sort_cart};
}
function Modes({policy,rid}:{policy:Policy;rid:number}) {
 const {t}=useI18n(),draft=policy.draft!;
 const [search,setSearch]=useState(''),[creating,setCreating]=useState(false),[name,setName]=useState('');
 const modes=(draft.modes??[]).filter(mode=>mode.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <>
  <div className="pos-modes-toolbar"><Input aria-label={t('search')} placeholder={t('posSearchModes')} value={search} onChange={e=>setSearch(e.target.value)}/><Button type="button" disabled={!policy.editable||policy.saving||(draft.modes?.length??0)>=20} onClick={()=>{setName('');setCreating(true);}}><Plus/>{t('posAddMode')}</Button></div>
  <div className="pos-modes-table"><div className="pos-modes-table-head"><strong>{t('name')}</strong><strong>{t('posAssignedDevices')}</strong></div>
   {modes.map(mode=><Link key={mode.id} className="pos-setting-row" href={`/${rid}/settings/modes/${mode.id}`}><span><strong>{mode.name}</strong><span className="pos-setting-hint block">{t('posFullServiceMode')}</span></span><span className="pos-row-detail">{mode.device_ids.length}<ChevronRight aria-hidden className="size-5 rtl:rotate-180"/></span></Link>)}
   {!modes.length&&<p className="py-6 text-[var(--fg-muted)]">{t('posNoModes')}</p>}
  </div>
  <SettingLink href={`/${rid}/settings/modes/default`} label={t('posRestaurantDefaults')} detail={t('posUnassignedDevices')}/>
  {policy.dirty&&<div className="pos-settings-footer"><Button type="submit" disabled={!policy.editable||policy.saving}>{t('save')}</Button></div>}
  <Drawer open={creating} onOpenChange={setCreating} title={t('posAddMode')} onSave={()=>{const value=name.trim();if(!value||(draft.modes??[]).some(m=>m.name.toLowerCase()===value.toLowerCase())){policy.setError(t('fullServiceInvalid'));return;}policy.patch({modes:[...(draft.modes??[]),{...modeDefaults(draft),id:crypto.randomUUID(),name:value,device_ids:[]}]});setCreating(false);}} saveLabel={t('apply')} saveDisabled={!name.trim()||!policy.editable||policy.saving}><label className="pos-inset-field">{t('name')}<Input disabled={!policy.editable||policy.saving} aria-label={t('name')} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label></Drawer>
 </>;
}
function ModeEditor({policy,rid,id,section}:{policy:Policy;rid:number;id:string;section:string}) {
 const {t}=useI18n(),draft=policy.draft!;
 const mode=draft.modes?.find(mode=>mode.id===id),isDefault=id==='default';
 const value=isDefault?modeDefaults(draft):mode;
 const [devices,setDevices]=useState<RestaurantDevice[]|null>(null),[deviceError,setDeviceError]=useState(''),[selecting,setSelecting]=useState(false),[selected,setSelected]=useState<string[]>([]);
 const [remove,setRemove]=useState(false);
 const patch=(next:Partial<POSMode>)=>{if(isDefault){const {tile_size,...rest}=next;policy.patch({...rest,...(tile_size?{order_entry:{...(draft.order_entry??{return_to_menu:'home'}),tile_size}}:{})});}else policy.patch({modes:(draft.modes??[]).map(m=>m.id===id?{...m,...next}:m)});};
 if(!value)return <p role="alert">{t('posModeNotFound')}</p>;
 const behavior:POSCheckBehavior=value?.check_behavior??draft.check_behavior??{allow_hold_fire:true,collapse_sent:true,open_checks_enabled:true,open_checks_home:false,predefined_tickets:false};
 const patchBehavior=(next:Partial<POSCheckBehavior>)=>patch({check_behavior:{...behavior,...next}});
 const base=`/${rid}/settings/modes/${id}`;
 const links=[['order-entry','posOrderEntry'],['covers','fullServiceSeating'],['courses','posCourseManagement'],['cart','posCart'],['open-checks','posOpenChecks']] as const;
 const heading=links.find(([key])=>key===section)?.[1];
 const openDevices=()=>{setSelecting(true);setSelected(mode?.device_ids??[]);setDeviceError('');listDevices(rid).then(rows=>{if(rows.some(row=>row.restaurant_id!==rid))throw new Error('Incorrect restaurant');setDevices(rows.filter(d=>['tablet','phone','computer','payment_terminal'].includes(d.kind)));}).catch(()=>setDeviceError(t('tableSettingsLoadFailed')));};
 return <>
  <div className="pos-editor-subhead">{section&&<Link href={base} aria-label={t('back')}><ArrowLeft className="rtl:rotate-180"/></Link>}<h2>{t(heading??'posCheckout')}</h2></div>
  {!section&&<>
   <p className="pos-setting-hint">{t(isDefault?'posDefaultsHint':'posModeSharedHint')}</p>
   {mode&&<label className="pos-inset-field mt-6">{t('name')}<Input aria-label={t('name')} maxLength={80} value={mode.name} onChange={e=>patch({name:e.target.value})}/></label>}
   {mode&&<button type="button" className="pos-setting-row mt-8" onClick={openDevices}><strong>{t('posAssignedDevices')}</strong><span className="pos-row-detail">{mode.device_ids.length}<ChevronRight aria-hidden className="size-5 rtl:rotate-180"/></span></button>}
   <SettingSection title={t('posCheckout')}>{links.map(([key,label])=><SettingLink key={key} href={`${base}/${key}`} label={t(label)}/>)}<SettingLink href={`/${rid}/settings/fulfillment`} label={t('posFulfillment')}/></SettingSection>
   {mode&&<Button type="button" variant="danger" disabled={!policy.editable||policy.saving} onClick={()=>setRemove(true)}>{t('posDeleteMode')}</Button>}
  </>}
  {section==='order-entry'&&<>
   <p className="pos-entry-intro">{t('posTileSizeHint')}</p>
   <SettingSection title={t('posTileSize')}><div className="pos-tile-options">{(['tall','wide'] as const).map(size=><label className="pos-tile-option" key={size} data-selected={value.tile_size===size}><input className="sr-only" type="radio" name="tile-size" checked={value.tile_size===size} onChange={()=>patch({tile_size:size})}/><span className={`pos-tile-preview ${size}`} aria-hidden><span/><span/></span><strong>{t(size==='tall'?'posTallTiles':'posWideTiles')}</strong><span>{t(size==='tall'?'posTallHint':'posWideHint')}</span></label>)}</div></SettingSection>
   <section className="pos-entry-progression"><label className="pos-setting-row"><span><strong>{t('fullServiceAutoProgression')}</strong><span className="pos-setting-hint block">{t('posProgressionHint')}</span></span><BooleanInput aria-label={t('fullServiceAutoProgression')} checked={value.auto_progression} onChange={e=>patch({auto_progression:e.target.checked})}/></label></section>
   <SettingSection title={t('posItemDetail')} hint={t('posItemDetailHint')}><SettingLink href={`/${rid}/menu/items`} label={t('posManageItemDetails')}/></SettingSection>
  </>}
  {section==='covers'&&<SettingSection title={t('fullServiceSeating')}>
   {(['disabled','coversOnly','optionalSeats','requiredSeats'] as const).map((key,index)=><ChoiceRow type="radio" name="seating" key={key} label={t(['disabled','fullServiceCoversOnly','fullServiceOptionalSeats','fullServiceRequiredSeats'][index])} checked={value.seating_mode===key} onChange={()=>patch({seating_mode:key})}/>)}
  </SettingSection>}
  {section==='courses'&&<>
   <SettingSection title=""><label className="pos-setting-row"><span><strong>{t('fullServiceCoursing')}</strong><span className="pos-setting-hint block">{t('posCoursingHint')}</span></span><BooleanInput aria-label={t('fullServiceCoursing')} checked={value.coursing_enabled} onChange={e=>patch({coursing_enabled:e.target.checked})}/></label>
   <label className="pos-setting-row pos-course-hold"><span><strong>{t('posAllowHoldFire')}</strong><span className="pos-setting-hint block">{t('posAllowHoldFireHint')}</span></span><BooleanInput aria-label={t('posAllowHoldFire')} checked={behavior.allow_hold_fire} disabled={!value.coursing_enabled} onChange={e=>patchBehavior({allow_hold_fire:e.target.checked})}/></label></SettingSection>
   <SettingSection title={t('posSentItemsSection')}><ChoiceRow type="radio" name="sent-items" label={t('posCollapseSent')} description={t('posCollapseSentHint')} checked={behavior.collapse_sent} onChange={()=>patchBehavior({collapse_sent:true})}/><ChoiceRow type="radio" name="sent-items" label={t('posExpandSent')} description={t('posExpandSentHint')} checked={!behavior.collapse_sent} onChange={()=>patchBehavior({collapse_sent:false})}/></SettingSection>
  </>}
  {section==='cart'&&<SettingSection title={t('fullServiceSort')}>{(['course','seat','entry'] as const).map((key,index)=><ChoiceRow key={key} type="radio" name="sort-cart" label={t(['fullServiceSortCourse','fullServiceSortSeat','fullServiceSortEntry'][index])} checked={value.sort_cart===key} onChange={()=>patch({sort_cart:key})}/>)}</SettingSection>}
  {section==='open-checks'&&<>
   <SettingSection title={t('posManageAddon')}><label className="pos-setting-row"><strong>{t('posUseOnMode')}</strong><BooleanInput aria-label={t('posUseOnMode')} checked={behavior.open_checks_enabled} onChange={e=>patchBehavior({open_checks_enabled:e.target.checked})}/></label></SettingSection>
   <p className="pos-open-notice"><span aria-hidden>ⓘ</span>{t('posOpenStatusNotice')}</p>
   <SettingSection title={t('posGeneralChecks')}><label className="pos-setting-row"><span><strong>{t('posOpenChecksHome')}</strong><span className="pos-setting-hint block">{t('posOpenChecksHomeHint')}</span></span><BooleanInput aria-label={t('posOpenChecksHome')} checked={behavior.open_checks_home} disabled={!behavior.open_checks_enabled} onChange={e=>patchBehavior({open_checks_home:e.target.checked})}/></label>
   <label className="pos-setting-row"><span><strong>{t('posContinueButton')}</strong><span className="pos-setting-hint block">{t('posContinueButtonHint')}</span></span><BooleanInput aria-label={t('posContinueButton')} checked={value.send_and_stay} disabled={!behavior.open_checks_enabled} onChange={e=>patch({send_and_stay:e.target.checked})}/></label>
   <label className="pos-setting-row"><strong>{t('posPredefinedTickets')}</strong><BooleanInput aria-label={t('posPredefinedTickets')} checked={behavior.predefined_tickets} disabled={!behavior.open_checks_enabled} onChange={e=>patchBehavior({predefined_tickets:e.target.checked})}/></label></SettingSection>
   <SettingSection title={t('posTicketGroups')} hint={t('posManageGroupsHint')}>{null}</SettingSection>
  </>}
  <Drawer open={selecting} onOpenChange={setSelecting} title={t('posAssignedDevices')} subtitle={t('posDeviceAssignmentHint')} onSave={()=>{policy.patch({modes:(draft.modes??[]).map(m=>({...m,device_ids:m.id===id?selected:m.device_ids.filter(d=>!selected.includes(d))}))});setSelecting(false);}} saveLabel={t('apply')} saveDisabled={!devices||!!deviceError||!policy.editable||policy.saving}>
   {deviceError?<div role="alert">{deviceError}<Button type="button" onClick={openDevices}>{t('retry')}</Button></div>:!devices?<p role="status">{t('loading')}</p>:devices.length?devices.map(device=><ChoiceRow key={device.id} label={device.display_name||device.system_name} checked={selected.includes(device.id)} description={draft.modes?.find(m=>m.id!==id&&m.device_ids.includes(device.id))?.name} disabled={!policy.editable||policy.saving} onChange={e=>setSelected(e.target.checked?[...selected,device.id]:selected.filter(d=>d!==device.id))}/>):<p>{t('posNoDevices')}</p>}
  </Drawer>
  <ConfirmDialog open={remove} onOpenChange={setRemove} title={t('posDeleteMode')} description={t('posDeleteModeHint')} confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={()=>{policy.patch({modes:(draft.modes??[]).filter(m=>m.id!==id)});setRemove(false);}}/>
 </>;
}
function Reasons({policy}:{policy:Policy}) {
 const {t}=useI18n(),draft=policy.draft!;
 return <>{(['comp_reasons','void_reasons'] as const).map(key=><SettingSection key={key} title={t(key==='comp_reasons'?'fullServiceCompReasons':'fullServiceVoidReasons')}><textarea className="pos-reasons" aria-label={t(key==='comp_reasons'?'fullServiceCompReasons':'fullServiceVoidReasons')} rows={Math.max(3,draft[key].length)} value={draft[key].join('\n')} onChange={e=>policy.patch({[key]:e.target.value.split('\n')})}/></SettingSection>)}</>;
}
