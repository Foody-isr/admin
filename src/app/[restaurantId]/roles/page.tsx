'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  Trash2,
  AlertCircle,
  Lock,
  UtensilsCrossed,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  LayoutGrid,
  ChefHat,
  CreditCard,
  Contact,
  Clock3,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  permissionDomainLabel,
  permissionLabel,
  permissionDescription,
  roleDisplayName,
  roleDisplayDescription,
} from '@/lib/permission-i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, ConfirmDialog, PageHead } from '@/components/ds';
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
  RestaurantRole,
  PermissionGroup,
} from '@/lib/api';

/** Icon per permission domain (matched by slug); falls back to a generic key. */
const DOMAIN_ICONS: Record<string, LucideIcon> = {
  menu: UtensilsCrossed,
  orders: ClipboardList,
  staff: Users,
  roles: ShieldCheck,
  analytics: BarChart3,
  settings: Settings,
  tables: LayoutGrid,
  kitchen: ChefHat,
  payments: CreditCard,
  customers: Contact,
  shifts: Clock3,
};

function domainIcon(domain: string): LucideIcon {
  return DOMAIN_ICONS[domain.toLowerCase().replace(/[^a-z0-9]+/g, '')] ?? KeyRound;
}

export default function RolesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('roles.manage');

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

  return (
    <div className="space-y-6">
      <PageHead
        title={t('rolesPermissions') || 'Rôles & permissions'}
        desc={t('manageStaffRoles')}
        actions={
          canManage && (
            <Button variant="primary" size="md" onClick={openCreate} disabled={!!loadError}>
              {t('createRole')}
            </Button>
          )
        }
      />

      {loadError && <div role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)] flex flex-wrap items-center justify-between gap-3"><span>{loadError}</span><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
      {/* Role cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <button
            key={role.id} type="button" aria-haspopup="dialog"
            className="text-start rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--line-strong)] transition-colors"
            onClick={() => openEdit(role)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-semibold break-words" style={{ color: 'var(--text-primary)' }}>
                  {roleDisplayName(t, role.name, role.is_system_default)}
                </h2>
                {role.is_system_default && (
                  <Badge tone="info" className="mt-2">
                    {t('defaultBadge')}
                  </Badge>
                )}
              </div>
            </div>
            {role.description && (
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {roleDisplayDescription(t, role.name, role.description, role.is_system_default)}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{t('permissionsCount').replace('{count}', String(role.permissions.length))}</span>
              <span>{(role.user_count === 1 ? t('userCount') : t('usersCount')).replace('{count}', String(role.user_count))}</span>
            </div>
          </button>
        ))}
      </div>

      {!loadError && roles.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-lg font-medium mb-2">{t('noRolesYet')}</p>
          <p className="text-sm">{t('defaultRolesAutoCreated')}</p>
        </div>
      )}

      {/* Role editor modal */}
      {showEditor && (
        <Modal
          size="3xl"
          icon={<ShieldCheck />}
          title={editingRole ? t('editRole').replace('{name}', roleDisplayName(t, editingRole.name, editingRole.is_system_default)) : t('createRole')}
          subtitle={t('permissionsSelectedSummary')
            .replace('{count}', String(selectedCount))
            .replace('{total}', String(availableKeys.length))}
          onClose={requestClose}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              {canManage && editingRole && !editingRole.is_system_default ? (
                <button
                  onClick={() => setDeleteTarget(editingRole)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--danger-500)] min-h-10 rounded-r-md px-2.5 py-1.5 transition-colors hover:bg-[var(--danger-50)] disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={editingRole.user_count > 0 || saving}
                  title={editingRole.user_count > 0 ? t('cannotDeleteWithUsers') : ''}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('deleteRole')}
                </button>
              ) : (
                <span />
              )}
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button variant="secondary" size="md" onClick={requestClose} disabled={saving}>
                  {t('cancel')}
                </Button>
                {canManage && (
                  <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : editingRole ? t('saveChanges') : t('createRole')}
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Name + description */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="role-name" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('name')}
                </label>
                <input
                  className="input w-full"
                  id="role-name" value={isDefault ? roleDisplayName(t, editingRole!.name, true) : name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={fieldsLocked || saving}
                  placeholder={t('roleNamePlaceholder')}
                />
                {isDefault && (
                  <p className="flex items-center gap-1 text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Lock className="w-3 h-3" />
                    {t('systemDefaultNoRename')}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="role-description" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('description')}
                </label>
                <input
                  className="input w-full"
                  id="role-description" value={isDefault ? roleDisplayDescription(t, editingRole!.name, editingRole!.description, true) : description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={fieldsLocked || saving}
                  placeholder={t('briefDescription')}
                />
              </div>
            </div>

            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('permissions')}
                  </label>
                  <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                    {selectedCount}/{availableKeys.length}
                  </span>
                </div>
                {canManage && permissionGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPerms(allOn ? new Set() : new Set(availableKeys))}
                    disabled={saving} className="text-xs font-semibold text-[var(--brand-ink)] hover:underline min-h-10 transition-colors"
                  >
                    {allOn ? t('deselectAll') : t('selectAll')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {permissionGroups.map((group) => {
                  const allKeys = group.permissions.map((p) => p.key);
                  const groupSelected = allKeys.filter((k) => selectedPerms.has(k)).length;
                  const allSelected = groupSelected === allKeys.length;
                  const someSelected = groupSelected > 0;
                  const Icon = domainIcon(group.domain);
                  return (
                    <div
                      key={group.domain}
                      className={cn(
                        'rounded-r-lg border overflow-hidden transition-colors',
                        someSelected ? 'border-brand-500/40' : 'border-[var(--line)]',
                      )}
                      style={{ background: 'var(--surface)' }}
                    >
                      {/* Domain header — toggles the whole group */}
                      <label
                        className={[cn(
                          'group/d flex items-center gap-2.5 px-3 py-2.5 border-b transition-colors',
                          canManage ? 'cursor-pointer hover:bg-[var(--surface-2)]' : 'cursor-default',
                        ), "selection-row"].filter(Boolean).join(" ")}
                        style={{ borderColor: 'var(--line)' }}
                      >
                        <input
                          type="checkbox"
                          className="peer"
                          checked={allSelected}
                          ref={element => { if (element) element.indeterminate = someSelected && !allSelected; }}
                          onChange={() => toggleDomain(group)}
                          disabled={!canManage || saving}
                        />
                        <span className="grid place-items-center w-7 h-7 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)] shrink-0">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {permissionDomainLabel(t, group.domain)}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full shrink-0',
                            allSelected
                              ? 'bg-[var(--action)] text-[var(--action-fg)]'
                              : someSelected
                                ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                                : 'bg-[var(--surface-2)] text-[var(--text-secondary)]',
                          )}
                        >
                          {groupSelected}/{allKeys.length}
                        </span>
                      </label>

                      {/* Individual permissions */}
                      <div className="p-1.5 space-y-0.5">
                        {group.permissions.map((perm) => {
                          const sel = selectedPerms.has(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={[cn(
                                'group/r flex items-start gap-2.5 min-h-11 rounded-r-md px-2 py-2.5 transition-colors',
                                canManage ? 'cursor-pointer' : 'cursor-default',
                                sel ? 'bg-[var(--brand-soft)]' : canManage && 'hover:bg-[var(--surface-2)]',
                              ), "selection-row"].filter(Boolean).join(" ")}
                            >
                              <input
                                type="checkbox"
                                className="peer"
                                checked={sel}
                                onChange={() => togglePerm(perm.key)}
                                disabled={!canManage || saving}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                                  {permissionLabel(t, perm.key, perm.label)}
                                </span>
                                <span className="block text-xs leading-snug mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                  {permissionDescription(t, perm.key, perm.description)}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 text-sm rounded-r-lg px-3 py-2.5 bg-[var(--danger-50)] text-[var(--danger-500)]">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }} title={t('deleteRole')}
        description={t('deleteRoleConfirm').replace('{name}', deleteTarget?.name ?? '')} confirmLabel={t('deleteRole')} cancelLabel={t('cancel')} danger
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget); }} />
      <ConfirmDialog open={discardOpen} onOpenChange={setDiscardOpen} title={t('discardUnsavedChanges')}
        description={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')}
        onConfirm={() => setShowEditor(false)} />
    </div>
  );
}
