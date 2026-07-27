'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHead, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  getChainBranches,
  createChainBranch,
  inviteStaff,
  ChainOverview,
} from '@/lib/api';
import { PlusIcon, ChevronRightIcon } from 'lucide-react';

/**
 * Branch management — the top-level "Succursales" surface (moved out of catering).
 * Lists every branch of the chain and lets the chain owner create a new branch
 * (its own restaurant), optionally seeding a branch manager via the existing
 * staff-invite flow against the freshly created branch.
 */
export default function ChainBranchesPage() {
  const { restaurantId: ridParam } = useParams();
  const restaurantId = Number(ridParam);
  const router = useRouter();
  const { t } = useI18n();
  const { isOwner, hasPermission } = usePermissions();
  const canManage = isOwner || hasPermission('chain.manage');

  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getChainBranches(restaurantId)
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const branches = overview?.branches ?? [];

  return (
    <div className="space-y-6">
      <PageHead
        title={t('chain_branches')}
        desc={t('chain_branches_desc')}
        actions={
          canManage && (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {t('chain_create_branch')}
            </Button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : branches.length === 0 ? (
        <div className="card p-8 text-center text-fg-secondary">{t('chain_no_branches')}</div>
      ) : (
        <DataTable
          style={{ ['--cols' as string]: '2fr 1.4fr 0.8fr 32px' } as React.CSSProperties}
        >
          <DataTableHead>
            <DataTableHeadCell>{t('chain_col_name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('chain_col_slug')}</DataTableHeadCell>
            <DataTableHeadCell>{t('chain_col_status')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {branches.map((b, index) => (
              <DataTableRow
                key={b.id}
                index={index}
                onClick={() => router.push(`/${b.id}/dashboard`)}
                className="cursor-pointer hover:bg-fg-tertiary/5"
              >
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {b.name}
                  {b.is_current && (
                    <span className="ms-2 inline-flex items-center px-2 py-0.5 rounded-full text-fs-xs font-medium bg-brand-500/15 text-brand-500">
                      {t('chain_current_badge')}
                    </span>
                  )}
                </DataTableCell>
                <DataTableCell mobileLabel={t('chain_col_slug')} className="text-fg-secondary">
                  {b.slug}
                </DataTableCell>
                <DataTableCell mobileLabel={t('chain_col_status')}>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-fs-xs font-medium ${
                      b.is_active
                        ? 'bg-brand-500/15 text-brand-500'
                        : 'bg-fg-tertiary/10 text-fg-tertiary'
                    }`}
                  >
                    {b.is_active ? t('chain_active_badge') : t('chain_inactive_badge')}
                  </span>
                </DataTableCell>
                <DataTableCell align="right">
                  <ChevronRightIcon className="w-4 h-4 text-fg-tertiary" />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {addOpen && (
        <CreateBranchModal
          restaurantId={restaurantId}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateBranchModal({
  restaurantId,
  onClose,
  onCreated,
}: {
  restaurantId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { branch_id } = await createChainBranch(restaurantId, {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      // Optionally seed a branch manager on the freshly created branch, reusing
      // the existing staff-invite flow (sends the account-setup email).
      if (managerEmail.trim()) {
        await inviteStaff(branch_id, {
          full_name: managerName.trim() || managerEmail.trim(),
          email: managerEmail.trim(),
          role: 'manager',
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chain_create_error'));
      setSaving(false);
    }
  }

  return (
    <Modal title={t('chain_create_branch')} onClose={onClose}>
      {error && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_name')}</label>
          <input
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_address')}</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('chain_branch_phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="pt-2 border-t border-fg-tertiary/10">
          <p className="text-sm font-medium text-fg-secondary">{t('chain_manager_optional')}</p>
          <p className="text-fs-xs text-fg-tertiary mb-2">{t('chain_manager_hint')}</p>
          <div className="space-y-3">
            <input
              className="input"
              placeholder={t('chain_manager_name')}
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />
            <input
              type="email"
              className="input"
              placeholder={t('chain_manager_email')}
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary disabled:opacity-50">
            {saving ? t('chain_creating') : t('chain_create_branch')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
