'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ListFilter, Star } from 'lucide-react';
import { listStaff, isCourier, setDefaultCourier, type StaffMember } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { roleDisplayLabel } from '@/lib/permission-i18n';
import { Badge, Button } from '@/components/ds';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';

/** Show the team and its roles within the current restaurant's settings. */
export default function TeamSettingsPage() {
 const {restaurantId}=useParams();const rid=Number(restaurantId);return <TeamWorkspace key={rid} rid={rid}/>;
}

function TeamWorkspace({rid}:{rid:number}) {
 const {t,locale}=useI18n();const {hasAnyPermission}=usePermissions();
 const canViewStaff=hasAnyPermission('staff.view','staff.manage');const canViewRoles=hasAnyPermission('staff.manage','roles.manage');
 const canManageStaff=hasAnyPermission('staff.manage');const canManageRoles=hasAnyPermission('roles.manage');
 const [staff,setStaff]=useState<StaffMember[]>([]);const [loading,setLoading]=useState(true);
 const [staffError,setStaffError]=useState('');const [actionError,setActionError]=useState('');const [busy,setBusy]=useState(false);
 const router = useRouter();
 const [search, setSearch] = useState('');
 const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
 const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
 const [filterView, setFilterView] = useState<string | null>(null);
 const translations=useRef(t);translations.current=t;
 const request=useRef({value:0});const lock=useRef(false);
 const load=useCallback(async()=>{
  const sequence=++request.current.value;setLoading(true);setStaffError('');
  const [members]=await Promise.allSettled([canViewStaff?listStaff(rid):Promise.resolve([])]);
  if(sequence!==request.current.value)return;
  if(members.status==='fulfilled')setStaff(members.value);else setStaffError(members.reason instanceof Error?members.reason.message:translations.current('staffLoadError'));
  setLoading(false);
 },[rid,canViewStaff]);
 useEffect(()=>{const scope=request.current;void load();return()=>{scope.value+=1;};},[load]);
 const toggleCourier=async(member:StaffMember)=>{
  if(lock.current||!canManageStaff||!isCourier(member))return;lock.current=true;setBusy(true);setActionError('');const next=!member.is_default_courier;
  try{await setDefaultCourier(rid,member.id,next);setStaff(current=>current.map(row=>row.id===member.id?{...row,is_default_courier:next}:next?{...row,is_default_courier:false}:row));}
  catch(cause){setActionError(cause instanceof Error?cause.message:t('staffActionError'));}finally{lock.current=false;setBusy(false);}
 };
 const errorPanel=(message:string)=><div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{message}</p><Button variant="secondary" onClick={()=>void load()} disabled={loading||busy}>{t('retry')}</Button></div>;
 const lastActivity=(value?:string)=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(date);};
 const roleKey = (member: StaffMember) => String(member.role_id ?? member.role);
 const roleOptions = Array.from(new Map(staff.map(member => [roleKey(member), { value: roleKey(member), label: roleDisplayLabel(t, member.role_name || member.role) }])).values());
 const statusOptions = Array.from(new Set(staff.map(member => member.invite_status ?? 'not_invited'))).map(value => ({ value, label: t(`staffStatus_${value}`) }));
 const filteredStaff = staff.filter(member => `${member.full_name} ${member.email}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) && (!selectedRoles.size || selectedRoles.has(roleKey(member))) && (!selectedStatuses.size || selectedStatuses.has(member.invite_status ?? 'not_invited')));
 const listFilters = [{ id: 'role', label: t('role'), options: roleOptions, selected: selectedRoles }, { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses }];
 return <div className="min-w-0">
  <h1 className="sr-only">{t('staffAndRoles')}</h1>
  <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
    filters={<><ListFilterButton label={t('role')} value={selectedRoles.size || undefined} onClick={() => setFilterView('role')} /><ListStateFilter label={t('listState')} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} /><ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => setFilterView('index')} /></>}
    primaryAction={canViewStaff && <Button asChild><Link href={`/${rid}/staff`}>{t(canManageStaff ? 'inviteMember' : 'staff')}</Link></Button>}
    actions={<ActionsDropdown actions={[
      { label: t('refresh'), disabled: loading || busy, onClick: () => void load() },
      ...(canViewRoles ? [{ label: t(canManageRoles ? 'manageRoles' : 'roles'), onClick: () => router.push(`/${rid}/roles`) }] : []),
    ]} />}
  />
  <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters} onApply={values => { setSelectedRoles(values.role); setSelectedStatuses(values.status); }} />
  {!canViewStaff&&!canViewRoles&&<p className="text-sm text-[var(--fg-muted)]">{t('accessDeniedBody')}</p>}
  {canViewStaff&&<section>
   {loading?<p role="status" className="py-6 text-sm">{t('loading')}</p>:staffError?errorPanel(staffError):!staff.length?<p className="text-sm text-[var(--fg-muted)]">{t('noStaffYet')}</p>:<>
    {actionError&&<p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
    <DataTable className="list-table"><DataTableHead>{['name','role','accountStatus','lastActivity','defaultCourier'].map(key=><DataTableHeadCell key={key}>{t(key)}</DataTableHeadCell>)}</DataTableHead><DataTableBody>{filteredStaff.map((member,index)=><DataTableRow key={member.id} index={index}>
     <DataTableCell mobilePrimary><div className="min-w-0"><p dir="auto" className="break-words font-semibold">{member.full_name}</p><bdi dir="ltr" className="mt-1 block break-all text-sm font-normal text-[var(--fg-muted)]">{member.email}</bdi></div></DataTableCell>
     <DataTableCell mobileLabel={t('role')}><span dir="auto">{roleDisplayLabel(t,member.role_name||member.role)}</span></DataTableCell>
     <DataTableCell mobileLabel={t('accountStatus')}><Badge tone={member.invite_status==='active'?'success':'neutral'}>{t(`staffStatus_${member.invite_status??'not_invited'}`)}</Badge></DataTableCell>
     <DataTableCell mobileLabel={t('lastActivity')} className="text-sm text-[var(--fg-muted)]">{lastActivity(member.last_login_at)}</DataTableCell>
     <DataTableCell mobileLabel={t('defaultCourier')}>{isCourier(member)&&canManageStaff?<Button variant="ghost" disabled={busy} aria-pressed={!!member.is_default_courier} aria-label={`${t(member.is_default_courier?'clearDefaultCourier':'setAsDefaultCourier')} · ${member.full_name}`} onClick={()=>void toggleCourier(member)}><Star className={member.is_default_courier?'fill-current text-[var(--brand-ink)]':''}/><span className="md:sr-only">{t(member.is_default_courier?'yes':'no')}</span></Button>:member.is_default_courier?<Badge tone="neutral">{t('yes')}</Badge>:'—'}</DataTableCell>
    </DataTableRow>)}</DataTableBody></DataTable>
   </>}
  </section>}
  {!loading && staff.length > 0 && filteredStaff.length === 0 && <p role="status" className="py-10 text-center text-sm text-fg-secondary">{t('listNoMatches')}</p>}
 </div>;
}
