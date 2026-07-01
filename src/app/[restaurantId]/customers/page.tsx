'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  getAnalyticsCustomers,
  listTrustedCustomers,
  addTrustedCustomer,
  removeTrustedCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  CustomerListResult,
  CustomerProfile,
  TrustedCustomer,
} from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, SearchIcon, ChevronRightIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import { Switch } from '@/components/ui/switch';
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

const PER_PAGE = 25;

// Canonical key so a phone matches across the analytics list (order-derived)
// and the trusted list, regardless of how it was stored (+972…, 0…, …).
function phoneKey(p: string): string {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

// A unified row: every customer who has ordered (from analytics) plus any
// trusted/cash customer that was added manually and hasn't ordered yet.
type CustomerRow = {
  phone: string;
  name: string;
  orders: number;
  lastOrderAt: string | null;
  trusted: TrustedCustomer | null;
  // Last known delivery address (from the customer's most recent delivery
  // order). Absent for customers who never ordered delivery.
  address?: string;
  city?: string;
  floor?: string;
  apt?: string;
};

// Merge a row's delivery address into two display lines: street + city on top,
// floor + apartment underneath. Returns null when we have no address at all.
function addressLines(
  row: CustomerRow,
  t: (key: string) => string
): { primary: string; secondary: string } | null {
  const primary = [row.address, row.city].filter(Boolean).join(', ');
  const unit: string[] = [];
  if (row.floor) unit.push(`${t('floor')} ${row.floor}`);
  if (row.apt) unit.push(`${t('apartment')} ${row.apt}`);
  const secondary = unit.join(', ');
  if (!primary && !secondary) return null;
  // Guard against an empty first line if only unit info somehow exists.
  if (!primary) return { primary: secondary, secondary: '' };
  return { primary, secondary };
}

export default function CustomersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasAnyPermission } = usePermissions();
  const { t } = useI18n();

  const [data, setData] = useState<CustomerListResult | null>(null);
  const [trusted, setTrusted] = useState<TrustedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Add modal (manually whitelist a phone for cash)
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Edit modal (toggle cash + edit profile for an existing customer)
  const [editRow, setEditRow] = useState<CustomerRow | null>(null);
  const [editCash, setEditCash] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  // Profile (address/apartment/floor) lives on the customer's account.
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editApt, setEditApt] = useState('');
  const [editDeliveryNotes, setEditDeliveryNotes] = useState('');

  const canManage = hasAnyPermission('customers.manage');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [res, tc] = await Promise.all([
        getAnalyticsCustomers(rid, {
          search: search || undefined,
          page,
          per_page: PER_PAGE,
          sort_by: 'total_spent',
          sort_dir: 'desc',
        }),
        listTrustedCustomers(rid),
      ]);
      setData(res);
      setTrusted(tc);
    } catch {
      setData(null);
      setTrusted([]);
    } finally {
      setLoading(false);
    }
  }, [rid, search, page]);

  useEffect(() => { reload(); }, [reload]);

  // Debounce the search box and reset to the first page on a new query.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const trustedByKey = useMemo(() => {
    const m = new Map<string, TrustedCustomer>();
    for (const tc of trusted) m.set(phoneKey(tc.phone), tc);
    return m;
  }, [trusted]);

  const rows = useMemo<CustomerRow[]>(() => {
    const analyticsRows: CustomerRow[] = (data?.customers ?? []).map((c) => ({
      phone: c.customer_phone,
      name: c.customer_name,
      orders: c.total_orders,
      lastOrderAt: c.last_order_date,
      trusted: trustedByKey.get(phoneKey(c.customer_phone)) ?? null,
      address: c.address,
      city: c.city,
      floor: c.floor,
      apt: c.apt,
    }));
    // On the unfiltered first page, surface trusted customers who have no
    // orders yet (so manually added cash customers stay visible).
    const seen = new Set(analyticsRows.map((r) => phoneKey(r.phone)));
    const extraTrusted: CustomerRow[] =
      page === 1 && !search
        ? trusted
            .filter((tc) => !seen.has(phoneKey(tc.phone)))
            .map((tc) => ({ phone: tc.phone, name: tc.name, orders: 0, lastOrderAt: null, trusted: tc }))
        : [];
    return [...extraTrusted, ...analyticsRows];
  }, [data, trusted, trustedByKey, page, search]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PER_PAGE));

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : t('never'));

  const openEdit = async (row: CustomerRow) => {
    if (!canManage) return;
    setEditRow(row);
    setEditCash(!!row.trusted);
    setEditName(row.name || row.trusted?.name || '');
    setEditNotes(row.trusted?.notes || '');
    setEditError('');
    // Reset profile fields, then load the saved account profile (falling back to
    // the customer's latest delivery order to pre-fill anything not yet saved).
    setProfile(null);
    setEditAddress('');
    setEditCity('');
    setEditFloor('');
    setEditApt('');
    setEditDeliveryNotes('');
    setProfileLoading(true);
    try {
      const p = await getCustomerProfile(rid, row.phone);
      setProfile(p);
      const seed = p.last_delivery;
      setEditName(p.name || row.name || row.trusted?.name || '');
      setEditAddress(p.address || seed?.address || '');
      setEditCity(p.city || seed?.city || '');
      setEditFloor(p.floor || seed?.floor || '');
      setEditApt(p.apt || seed?.apt || '');
      setEditDeliveryNotes(p.delivery_notes || seed?.delivery_notes || '');
    } catch {
      // Non-fatal: the cash toggle still works even if the profile can't load.
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    setEditError('');
    try {
      // Persist the profile (name + address) onto the account when one exists.
      if (profile?.has_account) {
        await updateCustomerProfile(rid, editRow.phone, {
          name: editName,
          address: editAddress,
          city: editCity,
          floor: editFloor,
          apt: editApt,
          delivery_notes: editDeliveryNotes,
        });
      }

      const tc = editRow.trusted;
      const wasTrusted = !!tc;
      if (editCash && !wasTrusted) {
        await addTrustedCustomer(rid, {
          phone: editRow.phone,
          name: editName || editRow.name || '',
          notes: editNotes || undefined,
        });
      } else if (!editCash && wasTrusted) {
        await removeTrustedCustomer(rid, tc!.id);
      } else if (editCash && wasTrusted) {
        // No PATCH endpoint exists — re-create only if name/notes changed.
        const nameChanged = (editName || '') !== (tc!.name || '');
        const notesChanged = (editNotes || '') !== (tc!.notes || '');
        if (nameChanged || notesChanged) {
          await removeTrustedCustomer(rid, tc!.id);
          await addTrustedCustomer(rid, {
            phone: tc!.phone,
            name: editName || tc!.name || '',
            notes: editNotes || undefined,
          });
        }
      }
      setEditRow(null);
      await reload();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : t('failedToUpdateCustomer'));
    } finally {
      setSaving(false);
    }
  };

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
      await reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t('failedToAddCustomer'));
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('customers') || 'Clients'}
        desc={t('allCustomersDesc')}
        actions={
          canManage && (
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {t('addCustomer')}
            </Button>
          )
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-tertiary pointer-events-none" />
        <input
          className="input pl-9"
          placeholder={t('searchCustomers')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-fg-secondary">{t('noCustomers')}</div>
      ) : (
        <>
          <DataTable
            style={{ ['--cols' as string]: '1.3fr 1.2fr 1.8fr 0.6fr 0.9fr 0.8fr 32px' } as React.CSSProperties}
          >
            <DataTableHead>
              <DataTableHeadCell>{t('phone')}</DataTableHeadCell>
              <DataTableHeadCell>{t('name')}</DataTableHeadCell>
              <DataTableHeadCell>{t('address')}</DataTableHeadCell>
              <DataTableHeadCell>{t('orders')}</DataTableHeadCell>
              <DataTableHeadCell>{t('lastOrder')}</DataTableHeadCell>
              <DataTableHeadCell>{t('canPayCash')}</DataTableHeadCell>
              <DataTableHeadSpacerCell />
            </DataTableHead>
            <DataTableBody>
              {rows.map((row, index) => {
                const addr = addressLines(row, t);
                return (
                <DataTableRow
                  key={phoneKey(row.phone) || index}
                  index={index}
                  onClick={() => openEdit(row)}
                  className={canManage ? 'cursor-pointer hover:bg-fg-tertiary/5' : ''}
                >
                  <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                    {row.phone}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('name')} className="text-fg-primary">
                    {row.name || '—'}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('address')}>
                    {addr ? (
                      <div className="flex flex-col leading-tight">
                        <span className="text-fg-primary">{addr.primary}</span>
                        {addr.secondary && (
                          <span className="text-fs-xs text-fg-tertiary">{addr.secondary}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('orders')} className="text-fg-secondary">
                    {row.orders}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('lastOrder')} className="text-fg-secondary">
                    {fmtDate(row.lastOrderAt)}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('canPayCash')}>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-fs-xs font-medium ${
                        row.trusted
                          ? 'bg-brand-500/15 text-brand-500'
                          : 'bg-fg-tertiary/10 text-fg-tertiary'
                      }`}
                    >
                      {row.trusted ? t('yes') : t('no')}
                    </span>
                  </DataTableCell>
                  <DataTableCell align="right">
                    {canManage && (
                      <ChevronRightIcon className="w-4 h-4 text-fg-tertiary" />
                    )}
                  </DataTableCell>
                </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                className="btn-secondary disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('previous')}
              </button>
              <span className="text-fs-sm text-fg-secondary">
                {page} / {totalPages}
              </span>
              <button
                className="btn-secondary disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t('next')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Edit customer modal — toggle cash payment */}
      {editRow && (
        <Modal title={t('editCustomer')} onClose={() => setEditRow(null)}>
          {editError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {editError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('phone')}</label>
              <div className="input bg-fg-tertiary/5 text-fg-secondary">{editRow.phone}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">{t('nameOptional')}</label>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            {/* Delivery details — stored on the customer's account. */}
            <div className="space-y-3 pt-1 border-t border-fg-tertiary/10">
              <div className="flex items-center justify-between pt-3">
                <span className="block text-sm font-medium text-fg-primary">{t('deliveryDetails')}</span>
                {profileLoading && (
                  <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {!profileLoading && profile && !profile.has_account && (
                <div className="text-fs-xs text-fg-secondary">{t('customerNoAccountHint')}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">{t('address')}</label>
                <input
                  className="input"
                  value={editAddress}
                  disabled={!profile?.has_account}
                  onChange={(e) => setEditAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">{t('city')}</label>
                <input
                  className="input"
                  value={editCity}
                  disabled={!profile?.has_account}
                  onChange={(e) => setEditCity(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">{t('floor')}</label>
                  <input
                    className="input"
                    value={editFloor}
                    disabled={!profile?.has_account}
                    onChange={(e) => setEditFloor(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-1">{t('apartment')}</label>
                  <input
                    className="input"
                    value={editApt}
                    disabled={!profile?.has_account}
                    onChange={(e) => setEditApt(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">{t('deliveryNotesOptional')}</label>
                <input
                  className="input"
                  value={editDeliveryNotes}
                  disabled={!profile?.has_account}
                  onChange={(e) => setEditDeliveryNotes(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-start justify-between gap-3 cursor-pointer pt-1 border-t border-fg-tertiary/10">
              <span>
                <span className="block text-sm font-medium text-fg-primary">{t('allowCashPayment')}</span>
                <span className="block text-fs-xs text-fg-secondary mt-0.5">{t('allowCashPaymentDesc')}</span>
              </span>
              <Switch checked={editCash} onCheckedChange={setEditCash} />
            </label>

            {editCash && (
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">{t('notesOptional')}</label>
                <input
                  className="input"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditRow(null)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveEdit}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </Modal>
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
              <button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>
                {t('cancel')}
              </button>
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
