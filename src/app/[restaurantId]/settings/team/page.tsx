'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Users, Star, Pencil } from 'lucide-react';
import { listStaff, listRoles, isCourier, setDefaultCourier, type StaffMember, type RestaurantRole } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { roleDisplayName, roleDisplayLabel, roleDisplayDescription } from '@/lib/permission-i18n';
import { Badge, Button, PageHead, Section } from '@/components/ds';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';

/** Show the team and its roles within the current restaurant's settings. */
export default function TeamSettingsPage() {
 const {restaurantId}=useParams();const rid=Number(restaurantId);return <TeamWorkspace key={rid} rid={rid}/>;
}

function TeamWorkspace({rid}:{rid:number}) {
 const {t,locale}=useI18n();const {hasAnyPermission}=usePermissions();
 const canViewStaff=hasAnyPermission('staff.view','staff.manage');const canViewRoles=hasAnyPermission('staff.view','staff.manage','roles.manage');
 const canManageStaff=hasAnyPermission('staff.manage');const canManageRoles=hasAnyPermission('roles.manage');
 const [staff,setStaff]=useState<StaffMember[]>([]);const [roles,setRoles]=useState<RestaurantRole[]>([]);const [loading,setLoading]=useState(true);
 const [staffError,setStaffError]=useState('');const [rolesError,setRolesError]=useState('');const [actionError,setActionError]=useState('');const [busy,setBusy]=useState(false);
 const translations=useRef(t);translations.current=t;
 const request=useRef({value:0});const lock=useRef(false);
 const load=useCallback(async()=>{
  const sequence=++request.current.value;setLoading(true);setStaffError('');setRolesError('');
  const [members,availableRoles]=await Promise.allSettled([canViewStaff?listStaff(rid):Promise.resolve([]),canViewRoles?listRoles(rid):Promise.resolve([])]);
  if(sequence!==request.current.value)return;
  if(members.status==='fulfilled')setStaff(members.value);else setStaffError(members.reason instanceof Error?members.reason.message:translations.current('staffLoadError'));
  if(availableRoles.status==='fulfilled')setRoles(availableRoles.value);else setRolesError(availableRoles.reason instanceof Error?availableRoles.reason.message:translations.current('loadFailed'));
  setLoading(false);
 },[rid,canViewStaff,canViewRoles]);
 useEffect(()=>{const scope=request.current;void load();return()=>{scope.value+=1;};},[load]);
 const toggleCourier=async(member:StaffMember)=>{
  if(lock.current||!canManageStaff||!isCourier(member))return;lock.current=true;setBusy(true);setActionError('');const next=!member.is_default_courier;
  try{await setDefaultCourier(rid,member.id,next);setStaff(current=>current.map(row=>row.id===member.id?{...row,is_default_courier:next}:next?{...row,is_default_courier:false}:row));}
  catch(cause){setActionError(cause instanceof Error?cause.message:t('staffActionError'));}finally{lock.current=false;setBusy(false);}
 };
 const errorPanel=(message:string)=><div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{message}</p><Button variant="secondary" onClick={()=>void load()} disabled={loading||busy}>{t('retry')}</Button></div>;
 const lastActivity=(value?:string)=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(date);};
 return <div className="space-y-6">
  <PageHead title={t('staffAndRoles')} desc={t('staffAndRolesDesc')} actions={<>{canViewRoles&&<Button variant="secondary" asChild><Link href={`/${rid}/roles`}><Users/>{t(canManageRoles?'manageRoles':'roles')}</Link></Button>}{canViewStaff&&<Button asChild><Link href={`/${rid}/staff`}><Plus/>{t(canManageStaff?'inviteMember':'staff')}</Link></Button>}</>}/>
  {!canViewStaff&&!canViewRoles&&<p className="text-sm text-[var(--fg-muted)]">{t('accessDeniedBody')}</p>}
  {canViewStaff&&<Section title={t('members')} desc={!loading&&!staffError?`${staff.length} ${t('staffMembersCount')}`:undefined}>
   {loading?<p role="status" className="py-6 text-sm">{t('loading')}</p>:staffError?errorPanel(staffError):!staff.length?<p className="text-sm text-[var(--fg-muted)]">{t('noStaffYet')}</p>:<>
    {actionError&&<p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
    <DataTable><DataTableHead>{['name','role','accountStatus','lastActivity','defaultCourier'].map(key=><DataTableHeadCell key={key}>{t(key)}</DataTableHeadCell>)}</DataTableHead><DataTableBody>{staff.map((member,index)=><DataTableRow key={member.id} index={index}>
     <DataTableCell mobilePrimary><div className="min-w-0"><p dir="auto" className="break-words font-semibold">{member.full_name}</p><bdi dir="ltr" className="mt-1 block break-all text-sm font-normal text-[var(--fg-muted)]">{member.email}</bdi></div></DataTableCell>
     <DataTableCell mobileLabel={t('role')}><span dir="auto">{roleDisplayLabel(t,member.role_name||member.role)}</span></DataTableCell>
     <DataTableCell mobileLabel={t('accountStatus')}><Badge tone={member.invite_status==='active'?'success':'neutral'}>{t(`staffStatus_${member.invite_status??'not_invited'}`)}</Badge></DataTableCell>
     <DataTableCell mobileLabel={t('lastActivity')} className="text-sm text-[var(--fg-muted)]">{lastActivity(member.last_login_at)}</DataTableCell>
     <DataTableCell mobileLabel={t('defaultCourier')}>{isCourier(member)&&canManageStaff?<Button variant="ghost" disabled={busy} aria-pressed={!!member.is_default_courier} aria-label={`${t(member.is_default_courier?'clearDefaultCourier':'setAsDefaultCourier')} · ${member.full_name}`} onClick={()=>void toggleCourier(member)}><Star className={member.is_default_courier?'fill-current text-[var(--brand-ink)]':''}/><span className="md:sr-only">{t(member.is_default_courier?'yes':'no')}</span></Button>:member.is_default_courier?<Badge tone="neutral">{t('yes')}</Badge>:'—'}</DataTableCell>
    </DataTableRow>)}</DataTableBody></DataTable>
   </>}
  </Section>}
  {canViewRoles&&<Section title={t('roles')} desc={t('rolesDesc')}>
   {loading?<p role="status" className="py-6 text-sm">{t('loading')}</p>:rolesError?errorPanel(rolesError):!roles.length?<p className="text-sm text-[var(--fg-muted)]">{t('noRolesYet')}</p>:<div className="grid gap-3 sm:grid-cols-2">{roles.map(role=><article key={role.id} className="rounded-xl border border-[var(--line)] p-4"><div className="flex items-start justify-between gap-3"><h3 dir="auto" className="min-w-0 break-words font-semibold">{roleDisplayName(t,role.name,role.is_system_default)}</h3>{canManageRoles&&<Button variant="ghost" asChild><Link href={`/${rid}/roles`} aria-label={`${t('edit')} · ${role.name}`}><Pencil/></Link></Button>}</div><p dir="auto" className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{role.description?roleDisplayDescription(t,role.name,role.description,role.is_system_default):t('permissionsCount').replace('{count}',String(role.permissions?.length??0))}</p></article>)}</div>}
  </Section>}
 </div>;
}
