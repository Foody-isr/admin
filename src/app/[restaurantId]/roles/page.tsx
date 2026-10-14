'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { TeamEditor, TeamPageHeader, TeamSearch } from '@/components/team/TeamWorkspace';
import { TeamPasscodesDrawer } from '@/components/team/TeamPasscodesDrawer';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { useI18n } from '@/lib/i18n';
import {
  permissionDomainLabel,
  permissionLabel,
  permissionDescription,
  roleDisplayName,
  roleDisplayDescription,
} from '@/lib/permission-i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog } from '@/components/ds';
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
  RestaurantRole,
  PermissionGroup,
} from '@/lib/api';

/** Restaurant-scoped permission sets, displayed as the Square reference list. */
export default function RolesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('roles.manage');
  const canViewStaff = hasAnyPermission('staff.view', 'staff.manage');
  const [search, setSearch] = useState('');
  const [passcodesOpen, setPasscodesOpen] = useState(false);

  const [roles, setRoles] = useState<RestaurantRole[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRole, setEditingRole] = useState<RestaurantRole | null>(null);

  // Editor state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RestaurantRole | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setLoadError('');
    try {
      const [availableRoles, groups] = await Promise.all([listRoles(rid), listPermissions()]);
      if (guard.isCurrent(token)) {
        setRoles(availableRoles);
        setPermissionGroups(groups);
      }
    } catch (reason: unknown) {
      if (guard.isCurrent(token)) setLoadError(reason instanceof Error ? reason.message : t('couldNotLoad'));
    } finally {
      if (guard.isCurrent(token)) setLoading(false);
    }
  }, [rid, t]);
  useEffect(() => {
    const guard = requestGuard.current;
    setRoles([]);
    setPermissionGroups([]);
    setShowEditor(false);
    setPasscodesOpen(false);
    void reload();
    return () => guard.invalidate();
  }, [reload]);

  function requestClose() {
    if (saving) return;
    const originalPermissions = editingRole?.permissions.map(permission => permission.permission) ?? [];
    const dirty = name !== (editingRole?.name ?? '') || description !== (editingRole?.description ?? '')
      || selectedPerms.size !== originalPermissions.length || originalPermissions.some(permission => !selectedPerms.has(permission));
    if (canManage && dirty) setDiscardOpen(true);
    else setShowEditor(false);
  }

  function openCreate() {
    setEditingRole(null);
    setName('');
    setDescription('');
    setSelectedPerms(new Set());
    setError('');
    setShowEditor(true);
  }

  function openEdit(role: RestaurantRole) {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description);
    setSelectedPerms(new Set(role.permissions.map((p) => p.permission)));
    setError('');
    setShowEditor(true);
  }

  async function handleSave() {
    if (!canManage || saving) return;
    if (!name.trim()) {
      setError(t('nameIsRequired'));
      return;
    }
    if (selectedPerms.size === 0) {
      setError(t('selectAtLeastOnePermission'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const perms = Array.from(selectedPerms);
      if (editingRole) {
        const updated = await updateRole(rid, editingRole.id, {
          // Default roles are system-managed: only their permissions are
          // editable. Name/description are display-only (translated in the UI),
          // so never persist them back — that would overwrite the canonical
          // English with a localized string.
          name: editingRole.is_system_default ? undefined : name,
          description: editingRole.is_system_default ? undefined : description,
          permissions: perms,
        });
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? { ...updated, user_count: r.user_count } : r)));
      } else {
        const created = await createRole(rid, { name, description, permissions: perms });
        setRoles((prev) => [...prev, { ...created, user_count: 0 }]);
      }
      setShowEditor(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('failedToSaveRole'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: RestaurantRole) {
    if (!canManage || saving || role.is_system_default || role.user_count > 0) return;
    setSaving(true);
    setError('');
    try {
      await deleteRole(rid, role.id);
      setRoles((prev) => prev.filter((entry) => entry.id !== role.id));
      setShowEditor(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('failedToDeleteRole'));
    } finally {
      setSaving(false);
    }
  }

  function togglePerm(perm: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  function toggleDomain(group: PermissionGroup) {
    const allKeys = group.permissions.map((p) => p.key);
    const allSelected = allKeys.every((k) => selectedPerms.has(k));
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      allKeys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label={t('loading')}>
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isDefault = !!editingRole?.is_system_default;
  const fieldsLocked = !canManage || isDefault;

  // Selected-vs-available counts (only counts permissions that still exist).
  const availableKeys = permissionGroups.flatMap((g) => g.permissions.map((p) => p.key));
  const selectedCount = availableKeys.filter((k) => selectedPerms.has(k)).length;
  const allOn = availableKeys.length > 0 && availableKeys.every((k) => selectedPerms.has(k));

  const filteredRoles = roles.filter(role => roleDisplayName(t, role.name, role.is_system_default).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
    .sort((a, b) => roleDisplayName(t, a.name, a.is_system_default).localeCompare(roleDisplayName(t, b.name, b.is_system_default), locale));
  const accessLabel = (role: RestaurantRole) => Array.from(new Set(role.permissions.map(permission => permissionDomainLabel(t, permission.permission.split('.')[0])))).join(', ') || '—';

  return (
    <div className="team-surface team-permissions">
      <TeamPageHeader title={t('teamPermissions')}>
        {canManage && <Button onClick={openCreate} disabled={!!loadError}>{t('teamCreatePermissions')}</Button>}
      </TeamPageHeader>
      <section className="team-passcodes" aria-labelledby="team-passcodes-heading">
        <span className="team-passcodes-icon"><Lock aria-hidden /></span>
        <div className="team-passcodes-copy"><h2 id="team-passcodes-heading">{t('teamPasscodes')}</h2><p>{t('teamPasscodesDescription')}</p></div>
        {canViewStaff && <Button variant="secondary" className="team-secondary" onClick={() => setPasscodesOpen(true)}>{t('teamManagePasscodes')}</Button>}
      </section>
      <section className="team-toolbar" aria-label={t('listTools')}><TeamSearch label={t('teamFilterPermissions')} value={search} onChange={setSearch} /></section>
      {loadError && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--danger-50)] p-4 text-[var(--danger-500)]"><span>{loadError}</span><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
      {!loadError && <DataTable className="team-table team-roles-table">
        <DataTableHead><DataTableHeadCell>{t('name')}</DataTableHeadCell><DataTableHeadCell>{t('teamAccess')}</DataTableHeadCell><DataTableHeadCell align="right">{t('teamMembers')}</DataTableHeadCell></DataTableHead>
        <DataTableBody>{filteredRoles.map((role, index) => <DataTableRow key={role.id} index={index}>
          <DataTableCell mobilePrimary><button type="button" className="team-role-name" aria-haspopup="dialog" onClick={() => openEdit(role)}>{roleDisplayName(t, role.name, role.is_system_default)}</button></DataTableCell>
          <DataTableCell mobileLabel={t('teamAccess')}><span className="team-role-access" title={accessLabel(role)}>{accessLabel(role)}</span></DataTableCell>
          <DataTableCell mobileLabel={t('teamMembers')} align="right" className="tabular-nums">{role.user_count}</DataTableCell>
        </DataTableRow>)}</DataTableBody>
      </DataTable>}
      {!loadError && !filteredRoles.length && <p role="status" className="team-empty">{t(roles.length ? 'listNoMatches' : 'noRolesYet')}</p>}
      {passcodesOpen && canViewStaff && <TeamPasscodesDrawer key={rid} restaurantId={rid} onClose={() => setPasscodesOpen(false)} />}

      {showEditor && <TeamEditor
        title={editingRole ? roleDisplayName(t, editingRole.name, editingRole.is_system_default) : t('teamCreatePermissions')}
        onClose={requestClose} busy={saving}
        actions={canManage && <Button onClick={() => void handleSave()} disabled={saving}>{t(saving ? 'saving' : 'save')}</Button>}
      >
        <div className="team-form">
          <label className="team-field"><span>{t('teamPermissionsName')}</span><input id="role-name" aria-label={t('name')} value={isDefault ? roleDisplayName(t, editingRole!.name, true) : name} onChange={event => setName(event.target.value)} disabled={fieldsLocked || saving} placeholder={t('teamPermissionsName')} /></label>
          {isDefault && <p className="text-xs text-[var(--fg-muted)]">{t('systemDefaultNoRename')}</p>}
          <label className="team-field"><span>{t('description')}</span><input id="role-description" aria-label={t('description')} value={isDefault ? roleDisplayDescription(t, editingRole!.name, editingRole!.description, true) : description} onChange={event => setDescription(event.target.value)} disabled={fieldsLocked || saving} /></label>
          <div className="mt-6 flex items-center justify-between gap-4"><h2 className="text-lg font-bold">{t('teamPermissions')}</h2><span className="text-sm text-[var(--fg-muted)]">{selectedCount}/{availableKeys.length}</span></div>
          {canManage && <label className="team-permission-row"><span><strong>{t('selectAll')}</strong></span><input type="checkbox" checked={allOn} disabled={saving} onChange={() => setSelectedPerms(allOn ? new Set() : new Set(availableKeys))} /></label>}
          <div className="team-permission-groups">
            {permissionGroups.map(group => {
              const keys = group.permissions.map(permission => permission.key);
              const count = keys.filter(key => selectedPerms.has(key)).length;
              return <section key={group.domain} className="team-permission-group">
                <label className="team-permission-row"><span><h3>{permissionDomainLabel(t, group.domain)}</h3><small>{count}/{keys.length}</small></span><input type="checkbox" aria-label={permissionDomainLabel(t, group.domain)} checked={count === keys.length} ref={element => { if (element) element.indeterminate = count > 0 && count < keys.length; }} disabled={!canManage || saving} onChange={() => toggleDomain(group)} /></label>
                {group.permissions.map(permission => <label key={permission.key} className="team-permission-row"><span><strong>{permissionLabel(t, permission.key, permission.label)}</strong><small>{permissionDescription(t, permission.key, permission.description)}</small></span><input type="checkbox" aria-label={permissionLabel(t, permission.key, permission.label)} checked={selectedPerms.has(permission.key)} disabled={!canManage || saving} onChange={() => togglePerm(permission.key)} /></label>)}
              </section>;
            })}
          </div>
          {error && <p role="alert" className="rounded-lg bg-[var(--danger-50)] p-4 text-[var(--danger-500)]">{error}</p>}
          {canManage && editingRole && !isDefault && <Button variant="danger" className="mt-6 justify-self-start" disabled={editingRole.user_count > 0 || saving} title={editingRole.user_count > 0 ? t('cannotDeleteWithUsers') : undefined} onClick={() => setDeleteTarget(editingRole)}>{t('deleteRole')}</Button>}
        </div>
      </TeamEditor>}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }} title={t('deleteRole')}
        description={t('deleteRoleConfirm').replace('{name}', deleteTarget?.name ?? '')} confirmLabel={t('deleteRole')} cancelLabel={t('cancel')} danger
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget); }} />
      <ConfirmDialog open={discardOpen} onOpenChange={setDiscardOpen} title={t('discardUnsavedChanges')}
        description={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')}
        onConfirm={() => setShowEditor(false)} />
    </div>
  );
}
