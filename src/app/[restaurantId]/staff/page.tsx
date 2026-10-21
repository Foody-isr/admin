'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListFilterButton, ListFiltersDrawer } from '@/components/data-table/ListFilters';

import {
  listStaff, inviteStaff, updateStaffRole, removeStaff, isCourier,
  resendStaffInvite, listRoles, StaffMember, RestaurantRole,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { roleDisplayName, roleDisplayLabel } from '@/lib/permission-i18n';
import {
  ArrowDown, ArrowUp, UserRound,
} from 'lucide-react';
import { Button, ConfirmDialog, Drawer } from '@/components/ds';
import { TeamEditor, TeamPageHeader, TeamSearch } from '@/components/team/TeamWorkspace';
import { downloadCsv } from '@/lib/csv/export';
import { StaffProfileEditor } from '@/components/staff/StaffProfileEditor';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

/** Manage the active restaurant's team through the Square reference workspace. */
export default function StaffPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingProfile, setEditingProfile] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [sortAscending, setSortAscending] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);
  const { hasPermission } = usePermissions();
  const { t, locale } = useI18n();
  const canManage = hasPermission('staff.manage');

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<RestaurantRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_id: 0,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [successTone, setSuccessTone] = useState<'success' | 'warning'>('success');
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setPageError('');
    try {
      const [members, availableRoles] = await Promise.all([listStaff(rid), listRoles(rid)]);
      if (guard.isCurrent(token)) {
        setStaff(members);
        setRoles(availableRoles);
      }
    } catch (reason: unknown) {
      if (guard.isCurrent(token)) setPageError(reason instanceof Error ? reason.message : t('staffLoadError'));
    } finally {
      if (guard.isCurrent(token)) setLoading(false);
    }
  }, [rid, t]);
  useEffect(() => {
    const guard = requestGuard.current;
    setLoading(true);
    setStaff([]);
    setRoles([]);
    setInviteOpen(false);
    setRemoveTarget(null);
    setSelectedMemberId(null);
    setEditingProfile(false);
    void reload();
    return () => guard.invalidate();
  }, [reload]);

  useEffect(() => {
    const memberId = Number(searchParams.get('member'));
    if (memberId && staff.some(member => member.id === memberId)) setSelectedMemberId(memberId);
  }, [searchParams, staff]);

  // Set default role_id once roles load
  useEffect(() => {
    if (roles.length > 0 && form.role_id === 0) {
      setForm((p) => ({ ...p, role_id: roles[0].id }));
    }
  }, [roles, form.role_id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || formLoading) return;
    setFormError('');
    setFormLoading(true);
    try {
      const { emailStatus } = await inviteStaff(rid, {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        role_id: form.role_id,
      });
      setInviteOpen(false);
      // Report the real email outcome, not just API success.
      const email = form.email;
      const msgKey =
        emailStatus === 'sent' ? 'invitationSent'
        : emailStatus === 'not_configured' ? 'invitationEmailNotConfigured'
        : emailStatus === 'failed' ? 'invitationEmailFailed'
        : 'memberAdded';
      setSuccessTone(emailStatus === 'failed' || emailStatus === 'not_configured' ? 'warning' : 'success');
      setSuccessMsg(t(msgKey).replace('{email}', email));
      setForm({ full_name: '', email: '', phone: '', role_id: roles[0]?.id || 0 });
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t('failedToInvite'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleRoleChange = async (member: StaffMember, newRoleId: number) => {
    if (!canManage || member.role === 'owner' || actionLoading !== null) return;
    setActionLoading(member.id);
    setActionError('');
    try {
      await updateStaffRole(rid, member.id, { role_id: newRoleId });
      reload();
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : t('staffActionError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (member: StaffMember) => {
    if (!canManage || member.role === 'owner' || actionLoading !== null) return;
    setActionLoading(member.id);
    setActionError('');
    try {
      await removeStaff(rid, member.id);
      setSelectedMemberId(null);
      reload();
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : t('staffActionError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (member: StaffMember) => {
    if (!canManage || actionLoading !== null) return;
    setActionLoading(member.id);
    setActionError('');
    try {
      const emailStatus = await resendStaffInvite(rid, member.id);
      const msgKey =
        emailStatus === 'sent' ? 'invitationSent'
        : emailStatus === 'not_configured' ? 'invitationEmailNotConfigured'
        : 'invitationEmailFailed';
      setSuccessTone(emailStatus === 'failed' || emailStatus === 'not_configured' ? 'warning' : 'success');
      setSuccessMsg(t(msgKey).replace('{email}', member.email));
      reload();
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : t('staffActionError'));
    } finally {
      setActionLoading(null);
    }
  };

  const roleKey = (member: StaffMember) => String(member.role_id ?? member.role);
  const roleOptions = Array.from(new Map(staff.map(member => [roleKey(member), { value: roleKey(member), label: roleDisplayLabel(t, member.role_name || member.role) }])).values());
  const statusOptions = Array.from(new Set(staff.map(member => member.invite_status ?? 'not_invited'))).map(value => ({ value, label: t(`staffStatus_${value}`) }));
  const filteredStaff = staff.filter(member => `${member.full_name} ${member.email}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) && (!selectedRoles.size || selectedRoles.has(roleKey(member))) && (!selectedStatuses.size || selectedStatuses.has(member.invite_status ?? 'not_invited'))).sort((a, b) => a.full_name.localeCompare(b.full_name, locale) * (sortAscending ? 1 : -1));
  const selectedMember = staff.find(member => member.id === selectedMemberId);
  const listFilters = [
    { id: 'role', label: t('teamJob'), options: roleOptions, selected: selectedRoles },
    { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label={t('loading')}>
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const exportStaff = () => downloadCsv(`foody-team-${rid}`, [
    [t('name'), t('email'), t('phone'), t('teamJob'), t('status'), t('posCode')],
    ...filteredStaff.map(member => [member.full_name, member.email, member.phone,
      roleDisplayLabel(t, member.role_name || member.role),
      t(`staffStatus_${member.invite_status ?? 'not_invited'}`),
      t(member.pos_pin_configured ? 'configured' : 'notConfigured')].map(value => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value)),
  ]);

  return (
    <div className="team-surface team-members">
      <TeamPageHeader title={t('teamEmployees')}>
        <Button className="team-secondary" variant="secondary" onClick={exportStaff} disabled={!!pageError || !filteredStaff.length}>{t('export')}</Button>
        {canManage && <Button disabled={!!pageError || roles.length === 0} onClick={() => { setFormError(''); setInviteOpen(true); }}>{t('teamAddEmployee')}</Button>}
      </TeamPageHeader>
      <section className="team-toolbar" aria-label={t('listTools')}>
        <TeamSearch value={search} onChange={setSearch} label={t('search')} />
        <ListFilterButton label={t('teamJob')} value={selectedRoles.size || undefined} onClick={() => setFilterView('role')} />
      </section>
      <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters} onApply={values => { setSelectedRoles(values.role); setSelectedStatuses(values.status); }} />
      {successMsg && (
        <div
          className={`rounded-r-lg px-4 py-3 text-sm flex items-center justify-between gap-4 ${successTone === 'success' ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--warning-50)] text-[var(--warning-500)]'}`}
          role="status"
        >
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg('')}
            className="size-10 shrink-0 rounded-r-md hover:bg-[var(--surface)] font-medium"
            aria-label={t('close')}
          >
            ×
          </button>
        </div>
      )}

      {pageError && (
        <div className="rounded-r-lg bg-[var(--danger-50)] px-4 py-3 text-sm text-[var(--danger-500)] flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{pageError}</span><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button>
        </div>
      )}

      {actionError && !selectedMember && <p role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {!pageError && staff.length === 0 && <p className="py-12 text-center text-sm text-fg-secondary">{t('noStaffYet')}</p>}
      {staff.length > 0 && filteredStaff.length === 0 && <p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('listNoMatches')}</p>}
      {!pageError && <DataTable className="team-table team-members-table">
        <DataTableHead>
          <DataTableHeadCell aria-sort={sortAscending ? 'ascending' : 'descending'}>
            <button type="button" className="team-sort" onClick={() => setSortAscending(value => !value)}>{t('name')}{sortAscending ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}</button>
          </DataTableHeadCell>
          <DataTableHeadCell>{t('teamJob')}</DataTableHeadCell>
          <DataTableHeadCell>{t('status')}</DataTableHeadCell>
        </DataTableHead>
        <DataTableBody>
          {filteredStaff.map((member, index) => <DataTableRow key={member.id} index={index}>
            <DataTableCell mobilePrimary>
              <button type="button" className="team-member-name" aria-haspopup="dialog" onClick={() => { setActionError(''); setSuccessMsg(''); setSelectedMemberId(member.id); }}>
                <span className="team-avatar"><UserRound aria-hidden /></span><span dir="auto">{member.full_name}</span>
              </button>
            </DataTableCell>
            <DataTableCell mobileLabel={t('teamJob')}>{roleDisplayLabel(t, member.role_name || member.role)}</DataTableCell>
            <DataTableCell mobileLabel={t('status')}><span className="team-status" data-active={member.invite_status === 'active'}>{t(`staffStatus_${member.invite_status ?? 'not_invited'}`)}</span></DataTableCell>
          </DataTableRow>)}
        </DataTableBody>
      </DataTable>}
      <div className="team-list-footer">
        <p role="status">{t(filteredStaff.length === 1 ? 'teamEmployeeCount' : 'teamEmployeesCount').replace('{count}', String(filteredStaff.length))}</p>
        <ActionsDropdown compactOnMobile actions={[
          { label: t('refresh'), onClick: () => void reload(), disabled: actionLoading !== null },
          { label: t('allFilters'), onClick: () => setFilterView('index') },
          ...(canManage ? [{ label: t('floorService'), onClick: () => router.push(`/${rid}/staff/table-service`) }] : []),
          ...(hasPermission('shifts.view') || hasPermission('shifts.manage') ? [{ label: t('shiftReports'), onClick: () => router.push(`/${rid}/staff/shifts`) }] : []),
          ...(hasPermission('shifts.manage') ? [{ label: t('posAccess'), onClick: () => router.push(`/${rid}/staff/devices`) }] : []),
        ]} />
      </div>

      {selectedMember && !editingProfile && <Drawer open onOpenChange={open => { if (!open) setSelectedMemberId(null); }} title={selectedMember.full_name} closeDisabled={actionLoading !== null} className="team-surface" width={560}>
        {canManage && <Button variant="secondary" className="mb-6" disabled={actionLoading !== null} onClick={() => setEditingProfile(true)}>{t('staffProfileEdit')}</Button>}
        <dl className="team-detail-fields">
          <div><dt>{t('email')}</dt><dd><bdi>{selectedMember.email}</bdi></dd></div>
          <div><dt>{t('phone')}</dt><dd><bdi>{selectedMember.phone || '—'}</bdi></dd></div>
          <div><dt>{t('staffProfileAddress')}</dt><dd><bdi>{selectedMember.address || '—'}</bdi></dd></div>
          {isCourier(selectedMember) && <div><dt>{t('staffProfileDestination')}</dt><dd><bdi>{selectedMember.courier_default_end_address || (selectedMember.courier_final_same_as_address ? selectedMember.address : selectedMember.courier_final_address) || '—'}</bdi></dd></div>}
          <div><dt>{t('teamJob')}</dt><dd>{canManage && selectedMember.role !== 'owner' ? <select className="input" aria-label={`${t('role')} · ${selectedMember.full_name}`} disabled={actionLoading !== null} value={selectedMember.role_id ?? ''} onChange={event => void handleRoleChange(selectedMember, Number(event.target.value))}>
            {roles.map(role => <option key={role.id} value={role.id}>{roleDisplayName(t, role.name, role.is_system_default)}</option>)}
          </select> : roleDisplayLabel(t, selectedMember.role_name || selectedMember.role)}</dd></div>
          <div><dt>{t('accountStatus')}</dt><dd><span className="team-status" data-active={selectedMember.invite_status === 'active'}>{t(`staffStatus_${selectedMember.invite_status ?? 'not_invited'}`)}</span></dd></div>
          <div><dt>{t('posCode')}</dt><dd>{t(selectedMember.pos_pin_configured ? 'configured' : 'notConfigured')}</dd></div>
        </dl>
        {successMsg && <p role="status" className={`mt-6 rounded-lg p-4 ${successTone === 'success' ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--warning-50)] text-[var(--warning-500)]'}`}>{successMsg}</p>}
        {actionError && <p role="alert" className="mt-6 text-[var(--danger-500)]">{actionError}</p>}
        {canManage && selectedMember.role !== 'owner' && <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" disabled={actionLoading !== null} onClick={() => void handleResendInvite(selectedMember)}>{t('resendSetupInvite')}</Button>
          <Button variant="danger" disabled={actionLoading !== null} onClick={() => setRemoveTarget(selectedMember)}>{t('remove')}</Button>
        </div>}
      </Drawer>}

      {selectedMember && editingProfile && <StaffProfileEditor key={`${rid}:${selectedMember.id}`} restaurantId={rid} member={selectedMember} onClose={() => setEditingProfile(false)} onSaved={profile => {
        setStaff(current => current.map(member => member.id === selectedMember.id ? {
          ...member, full_name: profile.full_name, phone: profile.phone, address: profile.address,
          courier_final_address: profile.courier_final_address, courier_final_same_as_address: profile.courier_final_same_as_address,
          courier_default_end_address: profile.courier_final_same_as_address ? profile.address : profile.courier_final_address,
        } : member));
        setEditingProfile(false); setSuccessTone('success'); setSuccessMsg(t('staffProfileSaved')); void reload();
      }} />}

      {inviteOpen && <TeamEditor title={t('teamProfile')} description={t('teamInviteDescription')} busy={formLoading} onClose={() => setInviteOpen(false)} actions={<Button type="submit" form="invite-team-member" disabled={formLoading}>{t(formLoading ? 'inviting' : 'invite')}</Button>}>
        <form id="invite-team-member" onSubmit={handleInvite} className="team-form">
          <div className="team-form-fields">
            <label className="team-field"><span>{t('fullName')}</span><input required aria-label={t('fullName')} autoComplete="name" value={form.full_name} disabled={formLoading} onChange={event => setForm(previous => ({ ...previous, full_name: event.target.value }))} /></label>
            <label className="team-field"><span>{t('email')}</span><input required aria-label={t('email')} type="email" autoComplete="email" dir="ltr" value={form.email} disabled={formLoading} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} /></label>
            <label className="team-field"><span>{t('phoneOptional')}</span><input aria-label={t('phoneOptional')} type="tel" autoComplete="tel" dir="ltr" value={form.phone} disabled={formLoading} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} /></label>
            <label className="team-field"><span>{t('teamJob')}</span><select aria-label={t('role')} value={form.role_id} disabled={formLoading} onChange={event => setForm(previous => ({ ...previous, role_id: Number(event.target.value) }))}>
              {roles.map(role => <option key={role.id} value={role.id}>{roleDisplayName(t, role.name, role.is_system_default)}</option>)}
            </select></label>
          </div>
          {formError && <p role="alert" className="rounded-lg bg-[var(--danger-50)] p-4 text-[var(--danger-500)]">{formError}</p>}
        </form>
      </TeamEditor>}

      <ConfirmDialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null); }}
        title={t('remove')} description={t('removeStaffConfirm').replace('{name}', removeTarget?.full_name ?? '')}
        confirmLabel={t('remove')} cancelLabel={t('cancel')} danger
        onConfirm={() => { if (removeTarget) void handleRemove(removeTarget); }} />
    </div>
  );
}
