'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  Check,
  Minus,
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
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import Modal from '@/components/Modal';
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
import { Button, PageHead } from '@/components/ds';
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
};

function domainIcon(domain: string): LucideIcon {
  return DOMAIN_ICONS[domain.toLowerCase().replace(/[^a-z0-9]+/g, '')] ?? KeyRound;
}

/** Brand-styled tri-state checkbox (visual only; pair with an sr-only input). */
function PermCheck({
  checked,
  indeterminate,
  disabled,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <span
      aria-hidden
      className={cn(
        'grid place-items-center w-[18px] h-[18px] rounded-[6px] border shrink-0 transition-all duration-150',
        on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-[var(--surface)] border-[var(--line-strong)]',
        !disabled && !on && 'group-hover/r:border-brand-400 group-hover/d:border-brand-400',
        disabled && 'opacity-40',
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="w-3 h-3" strokeWidth={3.5} />
      ) : checked ? (
        <Check className="w-3 h-3" strokeWidth={3.5} />
      ) : null}
    </span>
  );
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

  useEffect(() => {
    Promise.all([listRoles(rid), listPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissionGroups(p);
      })
      .finally(() => setLoading(false));
  }, [rid]);

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
    if (!confirm(t('deleteRoleConfirm').replace('{name}', role.name))) return;
    try {
      await deleteRole(rid, role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t('failedToDeleteRole'));
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
      <div className="flex items-center justify-center py-20">
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
    <div>
      <PageHead
        title={t('rolesPermissions') || 'Rôles & permissions'}
        desc={t('manageStaffRoles')}
        actions={
          canManage && (
            <Button variant="primary" size="md" onClick={openCreate}>
              {t('createRole')}
            </Button>
          )
        }
      />

      {/* Role cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="card p-5 cursor-pointer hover:border-brand-500/50 transition-colors"
            onClick={() => openEdit(role)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {roleDisplayName(t, role.name, role.is_system_default)}
                </h3>
                {role.is_system_default && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1 bg-brand-500/10 text-brand-500">
                    {t('defaultBadge')}
                  </span>
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
          </div>
        ))}
      </div>

      {roles.length === 0 && (
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
          onClose={() => setShowEditor(false)}
          footer={
            <div className="flex items-center justify-between gap-3">
              {canManage && editingRole && !editingRole.is_system_default ? (
                <button
                  onClick={() => {
                    handleDelete(editingRole);
                    setShowEditor(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--danger-500)] rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[var(--danger-500)]/10 disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={editingRole.user_count > 0}
                  title={editingRole.user_count > 0 ? t('cannotDeleteWithUsers') : ''}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('deleteRole')}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="md" onClick={() => setShowEditor(false)}>
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
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('name')}
                </label>
                <input
                  className="input w-full"
                  value={isDefault ? roleDisplayName(t, editingRole!.name, true) : name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={fieldsLocked}
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
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('description')}
                </label>
                <input
                  className="input w-full"
                  value={isDefault ? roleDisplayDescription(t, editingRole!.name, editingRole!.description, true) : description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={fieldsLocked}
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
                  <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600">
                    {selectedCount}/{availableKeys.length}
                  </span>
                </div>
                {canManage && permissionGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPerms(allOn ? new Set() : new Set(availableKeys))}
                    className="text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors"
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
                        'rounded-xl border overflow-hidden transition-colors',
                        someSelected ? 'border-brand-500/40' : 'border-[var(--line)]',
                      )}
                      style={{ background: 'var(--surface)' }}
                    >
                      {/* Domain header — toggles the whole group */}
                      <label
                        className={cn(
                          'group/d flex items-center gap-2.5 px-3 py-2.5 border-b transition-colors',
                          canManage ? 'cursor-pointer hover:bg-[var(--surface-2)]' : 'cursor-default',
                        )}
                        style={{ borderColor: 'var(--line)' }}
                      >
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={allSelected}
                          onChange={() => toggleDomain(group)}
                          disabled={!canManage}
                        />
                        <PermCheck
                          checked={allSelected}
                          indeterminate={someSelected && !allSelected}
                          disabled={!canManage}
                          className="peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-brand-500/50"
                        />
                        <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 shrink-0">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {permissionDomainLabel(t, group.domain)}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full shrink-0',
                            allSelected
                              ? 'bg-brand-500 text-white'
                              : someSelected
                                ? 'bg-brand-500/15 text-brand-600'
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
                              className={cn(
                                'group/r flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                                canManage ? 'cursor-pointer' : 'cursor-default',
                                sel ? 'bg-brand-500/[0.06]' : canManage && 'hover:bg-[var(--surface-2)]',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={sel}
                                onChange={() => togglePerm(perm.key)}
                                disabled={!canManage}
                              />
                              <PermCheck
                                checked={sel}
                                disabled={!canManage}
                                className="mt-0.5 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-brand-500/50"
                              />
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                                  {permissionLabel(t, perm.key, perm.label)}
                                </span>
                                <span className="block text-[11.5px] leading-snug mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
              <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 bg-[var(--danger-500)]/10 text-[var(--danger-500)]">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
