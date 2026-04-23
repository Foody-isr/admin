'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listTrustedCustomers, addTrustedCustomer, removeTrustedCustomer, TrustedCustomer } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, TrashIcon } from 'lucide-react';
import Modal from '@/components/Modal';

export default function CustomersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { user } = useAuth();
  const { t } = useI18n();

  const [customers, setCustomers] = useState<TrustedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [form, setForm] = useState({ phone: '', name: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const reload = () => listTrustedCustomers(rid).then(setCustomers).finally(() => setLoading(false));
  useEffect(() => { reload(); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const canManage = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'superadmin';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await addTrustedCustomer(rid, {
        phone: form.phone,
        name: form.name,
        notes: form.notes || undefined,
      });
      setAddOpen(false);
      setForm({ phone: '', name: '', notes: '' });
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t('failedToAddCustomer'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleRemove = async (customer: TrustedCustomer) => {
    if (!confirm(t('removeCustomerConfirm').replace('{name}', customer.name || customer.phone))) return;
    setActionLoading(customer.id);
    try {
      await removeTrustedCustomer(rid, customer.id);
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
        <p className="text-sm text-fg-secondary">
          {t('trustedCustomersDesc')}
        </p>
        {canManage && (
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            {t('addCustomer')}
          </button>
        )}
      </div>

      {customers.length === 0 ? (
        <div className="card p-8 text-center text-fg-secondary">
          {t('noTrustedCustomers')}
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-divider" style={{ background: 'var(--surface-subtle)' }}>
              <tr>
                <th className="text-left px-5 py-3 font-normal text-fg-secondary">{t('phone')}</th>
                <th className="text-left px-5 py-3 font-normal text-fg-secondary">{t('name')}</th>
                <th className="text-left px-5 py-3 font-normal text-fg-secondary">{t('notes')}</th>
                <th className="text-left px-5 py-3 font-normal text-fg-secondary">{t('added')}</th>
                {canManage && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-surface-subtle">
                  <td className="px-5 py-3 font-medium text-fg-primary">{c.phone}</td>
                  <td className="px-5 py-3 text-fg-primary">{c.name || '—'}</td>
                  <td className="px-5 py-3 text-fg-secondary">{c.notes || '—'}</td>
                  <td className="px-5 py-3 text-fg-secondary">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <button
                        disabled={actionLoading === c.id}
                        onClick={() => handleRemove(c)}
                        className="p-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <TrashIcon className="w-4 h-4 text-red-400" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add customer modal */}
      {addOpen && (
        <Modal title={t('addTrustedCustomer')} onClose={() => setAddOpen(false)}>
          {formError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {formError}
            </div>
          )}

          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('phoneNumber')}</label>
              <input
                required
                className="input"
                placeholder="+972..."
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('nameOptional')}</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('notesOptional')}</label>
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>{t('cancel')}</button>
              <button type="submit" disabled={formLoading} className="btn-primary disabled:opacity-50">
                {formLoading ? t('adding') : t('addCustomer')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
