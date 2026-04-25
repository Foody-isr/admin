'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listTrustedCustomers, addTrustedCustomer, removeTrustedCustomer, TrustedCustomer } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, TrashIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

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
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('customerDirectory') || 'Clients'}
        desc={t('trustedCustomersDesc')}
        actions={
          canManage && (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {t('addCustomer')}
            </Button>
          )
        }
      />

      {customers.length === 0 ? (
        <div className="card p-8 text-center text-fg-secondary">
          {t('noTrustedCustomers')}
        </div>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('phone')}</DataTableHeadCell>
            <DataTableHeadCell>{t('name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('notes')}</DataTableHeadCell>
            <DataTableHeadCell>{t('added')}</DataTableHeadCell>
            {canManage && <DataTableHeadSpacerCell />}
          </DataTableHead>
          <DataTableBody>
            {customers.map((c, index) => (
              <DataTableRow key={c.id} index={index}>
                <DataTableCell className="font-medium text-fg-primary">{c.phone}</DataTableCell>
                <DataTableCell className="text-fg-primary">{c.name || '—'}</DataTableCell>
                <DataTableCell className="text-fg-secondary">{c.notes || '—'}</DataTableCell>
                <DataTableCell className="text-fg-secondary">
                  {new Date(c.created_at).toLocaleDateString()}
                </DataTableCell>
                {canManage && (
                  <DataTableCell align="right">
                    <button
                      disabled={actionLoading === c.id}
                      onClick={() => handleRemove(c)}
                      className="p-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </DataTableCell>
                )}
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
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
