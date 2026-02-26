'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listStaff, inviteStaff, updateStaffRole, removeStaff, StaffMember, Role } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  chef: 'Chef',
  superadmin: 'Super Admin',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-brand-100 text-brand-700',
  manager: 'bg-blue-100 text-blue-700',
  cashier: 'bg-purple-100 text-purple-700',
  waiter: 'bg-green-100 text-green-700',
  chef: 'bg-orange-100 text-orange-700',
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
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        {isOwner && (
          <button onClick={() => setInviteOpen(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Invite Staff
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Email</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Role</th>
              {isOwner && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{member.full_name}</td>
                <td className="px-5 py-3 text-gray-500">{member.email}</td>
                <td className="px-5 py-3">
                  {isOwner && member.role !== 'owner' ? (
                    <select
                      disabled={actionLoading === member.id}
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
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
                        className="p-1.5 rounded hover:bg-red-50 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Invite Staff Member</h3>
              <button onClick={() => setInviteOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            {formError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{formError}</div>
            )}

            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input required className="input" value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input required type="email" className="input" value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input className="input" value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                <input required type="password" className="input" value={form.password} minLength={8}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
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
          </div>
        </div>
      )}
    </div>
  );
}
