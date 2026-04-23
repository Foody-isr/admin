'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
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

export default function RolesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

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
          name: editingRole.is_system_default ? undefined : name,
          description,
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

  return (
    <div>
      <PageHead
        title={t('rolesPermissions') || 'Rôles & permissions'}
        desc={t('manageStaffRoles')}
        actions={
          <Button variant="primary" size="md" onClick={openCreate}>
            {t('createRole')}
          </Button>
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
                  {role.name}
                </h3>
                {role.is_system_default && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1 bg-brand-500/10 text-brand-500">
                    Default
                  </span>
                )}
              </div>
            </div>
            {role.description && (
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {role.description}
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
        <Modal title={editingRole ? t('editRole').replace('{name}', editingRole.name) : t('createRole')} onClose={() => setShowEditor(false)}>
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('name')}</label>
              <input
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={editingRole?.is_system_default}
                placeholder={t('roleNamePlaceholder')}
              />
              {editingRole?.is_system_default && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t('systemDefaultNoRename')}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('description')}</label>
              <input
                className="input w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('briefDescription')}
              />
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('permissions')}</label>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {permissionGroups.map((group) => {
                  const allKeys = group.permissions.map((p) => p.key);
                  const allSelected = allKeys.every((k) => selectedPerms.has(k));
                  const someSelected = allKeys.some((k) => selectedPerms.has(k));
                  return (
                    <div key={group.domain} className="card p-3">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={() => toggleDomain(group)}
                          className="rounded"
                        />
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.domain}</span>
                      </label>
                      <div className="pl-6 space-y-1">
                        {group.permissions.map((perm) => (
                          <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedPerms.has(perm.key)}
                              onChange={() => togglePerm(perm.key)}
                              className="rounded"
                            />
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{perm.label}</span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>— {perm.description}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex items-center justify-between pt-2">
              {editingRole && !editingRole.is_system_default ? (
                <button
                  onClick={() => {
                    handleDelete(editingRole);
                    setShowEditor(false);
                  }}
                  className="text-sm text-red-500 hover:text-red-400"
                  disabled={editingRole.user_count > 0}
                  title={editingRole.user_count > 0 ? t('cannotDeleteWithUsers') : ''}
                >
                  {t('deleteRole')}
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowEditor(false)} className="btn-secondary px-4 py-2 rounded-lg text-sm">
                  {t('cancel')}
                </button>
                <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium">
                  {saving ? t('saving') : editingRole ? t('saveChanges') : t('createRole')}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
