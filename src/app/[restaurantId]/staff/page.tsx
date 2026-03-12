'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listStaff, inviteStaff, updateStaffRole, removeStaff, StaffMember, Role } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  chef: 'Chef',
  superadmin: 'Super Admin',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'badge-pending',
  manager: 'badge-accepted',
  cashier: 'badge bg-purple-500/15 text-purple-400',
  waiter: 'badge-ready',
  chef: 'badge-in-kitchen',
};

const ASSIGNABLE_ROLES: Role[] = ['manager', 'cashier', 'waiter', 'chef'];

export default function StaffPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { user } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'waiter' as Role,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const reload = () => listStaff(rid).then(setStaff).finally(() => setLoading(false));
  useEffect(() => { reload(); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = user?.role === 'owner' || user?.role === 'superadmin';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await inviteStaff(rid, form);
      setInviteOpen(false);
      setForm({ full_name: '', email: '', phone: '', password: '', role: 'waiter' });
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRoleChange = async (member: StaffMember, newRole: Role) => {
    if (member.role === 'owner') return;
    setActionLoading(member.id);
    try {
      await updateStaffRole(rid, member.id, newRole);
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
        {isOwner && (
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
              {isOwner && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-surface-subtle">
                <td className="px-5 py-3 font-medium text-fg-primary">{member.full_name}</td>
                <td className="px-5 py-3 text-fg-secondary">{member.email}</td>
                <td className="px-5 py-3">
                  {isOwner && member.role !== 'owner' ? (
                    <select
                      disabled={actionLoading === member.id}
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                      className="text-xs border border-divider rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${ROLE_COLORS[member.role] ?? 'badge-neutral'}`}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  )}
                </td>
                {isOwner && (
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
              <select className="input" value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="submit" disabled={formLoading} className="btn-primary disabled:opacity-50">
                {formLoading ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
