'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  listStaff, inviteStaff, updateStaffRole, removeStaff,
  resendStaffInvite, listRoles, StaffMember, RestaurantRole,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { roleDisplayName, roleDisplayLabel } from '@/lib/permission-i18n';
import {
  Clock3Icon, MailIcon, MapPinnedIcon, PlusIcon,
  TabletSmartphoneIcon, TrashIcon,
} from 'lucide-react';
import { Badge, Button, ConfirmDialog, PageHead } from '@/components/ds';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

export default function StaffPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasPermission } = usePermissions();
  const { t } = useI18n();
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
    void reload();
    return () => guard.invalidate();
  }, [reload]);

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

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label={t('loading')}>
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('staff') || 'Équipe'}
        desc={pageError ? undefined : `${staff.length} ${t('staffMembersCount')}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button variant="primary" size="md" disabled={!!pageError || roles.length === 0} onClick={() => setInviteOpen(true)}>
                <PlusIcon />
                {t('inviteStaff')}
              </Button>
            )}
          </div>
        }
      />
      <nav aria-label={t('staff')} className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="secondary" size="md" asChild>
                <Link href={`/${rid}/staff/table-service`}><MapPinnedIcon />{t('floorService')}</Link>
              </Button>
            )}
            {(hasPermission('shifts.view') || hasPermission('shifts.manage')) && (
              <Button variant="secondary" size="md" asChild>
                <Link href={`/${rid}/staff/shifts`}><Clock3Icon />{t('shiftReports')}</Link>
              </Button>
            )}
            {hasPermission('shifts.manage') && (
              <Button variant="secondary" size="md" asChild>
                <Link href={`/${rid}/staff/devices`}><TabletSmartphoneIcon />{t('posAccess')}</Link>
              </Button>
            )}
      </nav>

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

      {actionError && <p role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {!pageError && staff.length === 0 && <p className="py-12 text-center text-sm text-fg-secondary">{t('noStaffYet')}</p>}
      {staff.length > 0 && <DataTable>
        <DataTableHead>
          <DataTableHeadCell>{t('name')}</DataTableHeadCell>
          <DataTableHeadCell>{t('email')}</DataTableHeadCell>
          <DataTableHeadCell>{t('role')}</DataTableHeadCell>
          <DataTableHeadCell>{t('accountStatus')}</DataTableHeadCell>
          <DataTableHeadCell>{t('posCode')}</DataTableHeadCell>
          {canManage && <DataTableHeadSpacerCell />}
        </DataTableHead>
        <DataTableBody>
          {staff.map((member, index) => (
            <DataTableRow key={member.id} index={index}>
              <DataTableCell mobilePrimary className="font-semibold text-fg-primary">{member.full_name}</DataTableCell>
              <DataTableCell mobileLabel={t('email')} className="text-fg-secondary break-all"><bdi className="min-w-0 break-all">{member.email}</bdi></DataTableCell>
              <DataTableCell mobileLabel={t('role')}>
                {canManage && member.role !== 'owner' ? (
                  <select
                    disabled={actionLoading !== null}
                    aria-label={`${t('role')} · ${member.full_name}`}
                    value={member.role_id ?? ''}
                    onChange={(e) => handleRoleChange(member, Number(e.target.value))}
                    className="min-h-10 min-w-0 w-full md:w-auto max-w-full text-sm border border-[var(--line-strong)] rounded-r-md px-3 focus:outline-none focus:ring-2 focus:ring-[var(--brand-ink)]"
                    style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{roleDisplayName(t, r.name, r.is_system_default)}</option>
                    ))}
                  </select>
                ) : (
                  <Badge tone="neutral">
                    {roleDisplayLabel(t, member.role_name || member.role)}
                  </Badge>
                )}
              </DataTableCell>
              <DataTableCell mobileLabel={t('accountStatus')}>
                <Badge tone={member.invite_status === 'active' ? 'success' : 'neutral'}>
                  {t(`staffStatus_${member.invite_status ?? 'not_invited'}`)}
                </Badge>
              </DataTableCell>
              <DataTableCell mobileLabel={t('posCode')}>
                <span className={member.pos_pin_configured ? 'text-[var(--success-500)]' : 'text-fg-muted'}>
                  {member.pos_pin_configured ? t('configured') : t('notConfigured')}
                </span>
              </DataTableCell>
              {canManage && (
                <DataTableCell align="right">
                  {member.role !== 'owner' && (
                    <div className="flex justify-end gap-1">
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => handleResendInvite(member)}
                        className="size-10 grid place-items-center rounded-r-md hover:bg-[var(--brand-soft)] disabled:opacity-50" aria-label={`${t('resendSetupInvite')} · ${member.full_name}`}
                        title={t('resendSetupInvite')}
                      >
                        <MailIcon className="w-4 h-4 text-[var(--brand-ink)]" />
                      </button>
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => setRemoveTarget(member)}
                        className="size-10 grid place-items-center rounded-r-md hover:bg-[var(--danger-50)] disabled:opacity-50" aria-label={`${t('remove')} · ${member.full_name}`}
                        title={t('remove')}
                      >
                        <TrashIcon className="w-4 h-4 text-[var(--danger-500)]" />
                      </button>
                    </div>
                  )}
                </DataTableCell>
              )}
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>}

      {/* Invite modal */}
      {inviteOpen && (
        <Modal title={t('inviteStaffMember')} onClose={() => { if (!formLoading) setInviteOpen(false); }}>
          {formError && (
            <div role="alert" className="mb-3 p-3 bg-[var(--danger-50)] rounded-r-lg text-sm text-[var(--danger-500)]">{formError}</div>
          )}

          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label htmlFor="invite-full_name" className="block text-sm font-medium text-fg-secondary mb-1">{t('fullName')}</label>
              <input required className="input" id="invite-full_name" autoComplete="name" value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-fg-secondary mb-1">{t('email')}</label>
              <input required type="email" className="input" id="invite-email" autoComplete="email" dir="ltr" value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="invite-phone" className="block text-sm font-medium text-fg-secondary mb-1">{t('phoneOptional')}</label>
              <input className="input" id="invite-phone" autoComplete="tel" type="tel" dir="ltr" value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="invite-role_id" className="block text-sm font-medium text-fg-secondary mb-1">{t('role')}</label>
              <select className="input" id="invite-role_id" value={form.role_id}
                onChange={(e) => setForm((p) => ({ ...p, role_id: Number(e.target.value) }))}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{roleDisplayName(t, r.name, r.is_system_default)}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" disabled={formLoading} onClick={() => setInviteOpen(false)}>{t('cancel')}</button>
              <button type="submit" disabled={formLoading} className="btn-primary disabled:opacity-50">
                {formLoading ? t('inviting') : t('invite')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null); }}
        title={t('remove')} description={t('removeStaffConfirm').replace('{name}', removeTarget?.full_name ?? '')}
        confirmLabel={t('remove')} cancelLabel={t('cancel')} danger
        onConfirm={() => { if (removeTarget) void handleRemove(removeTarget); }} />
    </div>
  );
}
