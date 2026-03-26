'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  listStaff, inviteStaff, updateStaffRole, removeStaff,
  listRoles, StaffMember, RestaurantRole,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

export default function StaffPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasPermission, isOwner } = usePermissions();
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
    password: '',
    role_id: 0,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const reload = () => {
    Promise.all([listStaff(rid), listRoles(rid)])
      .then(([s, r]) => { setStaff(s); setRoles(r); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set default role_id once roles load
  useEffect(() => {
    if (roles.length > 0 && form.role_id === 0) {
      setForm((p) => ({ ...p, role_id: roles[0].id }));
    }
  }, [roles, form.role_id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await inviteStaff(rid, {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        role_id: form.role_id,
      });
      setInviteOpen(false);
      setForm({ full_name: '', email: '', phone: '', password: '', role_id: roles[0]?.id || 0 });
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRoleChange = async (member: StaffMember, newRoleId: number) => {
    if (member.role === 'owner') return;
    setActionLoading(member.id);
    try {
      await updateStaffRole(rid, member.id, { role_id: newRoleId });
      reload();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (member: StaffMember) => {
    if (member.role === 'owner') return;
    if (!confirm(`Remove ${member.full_name} from this restaurant?`)) return;
    setActionLoading(member.id);
    try {
      await removeStaff(rid, member.id);
      reload();
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg-primary">Staff</h1>
        {canManage && (
          <button onClick={() => setInviteOpen(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Invite Staff
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-divider" style={{ background: 'var(--surface-subtle)' }}>
            <tr>
              <th className="text-left px-5 py-3 font-medium text-fg-secondary">Name</th>
              <th className="text-left px-5 py-3 font-medium text-fg-secondary">Email</th>
              <th className="text-left px-5 py-3 font-medium text-fg-secondary">Role</th>
              {canManage && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-surface-subtle">
                <td className="px-5 py-3 font-medium text-fg-primary">{member.full_name}</td>
                <td className="px-5 py-3 text-fg-secondary">{member.email}</td>
                <td className="px-5 py-3">
                  {canManage && member.role !== 'owner' ? (
                    <select
                      disabled={actionLoading === member.id}
                      value={member.role_id ?? ''}
                      onChange={(e) => handleRoleChange(member, Number(e.target.value))}
                      className="text-xs border border-divider rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="badge badge-neutral">
                      {member.role_name || member.role}
                    </span>
                  )}
                </td>
                {canManage && (
                  <td className="px-5 py-3 text-right">
                    {member.role !== 'owner' && (
                      <button
                        disabled={actionLoading === member.id}
                        onClick={() => handleRemove(member)}
                        className="p-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <TrashIcon className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <Modal title="Invite Staff Member" onClose={() => setInviteOpen(false)}>
          {formError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">{formError}</div>
          )}

          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Full Name</label>
              <input required className="input" value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Email</label>
              <input required type="email" className="input" value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Phone (optional)</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Temporary Password</label>
              <input required type="password" className="input" value={form.password} minLength={8}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">Role</label>
              <select className="input" value={form.role_id}
                onChange={(e) => setForm((p) => ({ ...p, role_id: Number(e.target.value) }))}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="submit" disabled={formLoading} className="btn-primary disabled:opacity-50">
                {formLoading ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
