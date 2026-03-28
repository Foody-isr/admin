'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listSupplierProducts, createSupplierProduct, updateSupplierProduct, deleteSupplierProduct,
  listPurchaseOrders, createPurchaseOrder, updatePurchaseOrderStatus, receivePurchaseOrder,
  deletePurchaseOrder, listStockItems,
  Supplier, SupplierInput, SupplierProduct, SupplierProductInput,
  PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItemInput,
  StockItem, StockUnit,
} from '@/lib/api';
import Modal from '@/components/Modal';
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon, PencilIcon,
  TruckIcon, CheckCircleIcon, PaperAirplaneIcon, XCircleIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
type Tab = 'suppliers' | 'orders' | 'history';

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

// ─── Main ──────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [tab, setTab] = useState<Tab>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; editing?: Supplier }>({ open: false });
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);
  const [productModal, setProductModal] = useState<{ open: boolean; supplierId: number; editing?: SupplierProduct }>({ open: false, supplierId: 0 });
  const [orderModal, setOrderModal] = useState(false);
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, o, si] = await Promise.all([
        listSuppliers(rid),
        listPurchaseOrders(rid),
        listStockItems(rid),
      ]);
      setSuppliers(s);
      setOrders(o);
      setStockItems(si);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const filteredSuppliers = suppliers.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.contact_name.toLowerCase().includes(search.toLowerCase())
  );

  const activeOrders = orders.filter((o) => o.status === 'draft' || o.status === 'sent');
  const historyOrders = orders.filter((o) => o.status === 'received' || o.status === 'cancelled');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
        {(['suppliers', 'orders', 'history'] as Tab[]).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t2 ? 'shadow text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
            }`}
            style={tab === t2 ? { background: 'var(--surface)' } : {}}
          >
            {t2 === 'suppliers' ? t('suppliers') : t2 === 'orders' ? t('purchaseOrders') : t('orderHistory')}
          </button>
        ))}
      </div>

      {tab === 'suppliers' && (
        <SuppliersTab
          suppliers={filteredSuppliers}
          search={search}
          onSearchChange={setSearch}
          onAdd={() => setSupplierModal({ open: true })}
          onEdit={(s) => setSupplierModal({ open: true, editing: s })}
          onDelete={async (id) => { await deleteSupplier(rid, id); reload(); }}
          onDetail={setDetailSupplier}
          t={t}
        />
      )}

      {tab === 'orders' && (
        <OrdersTab
          orders={activeOrders}
          suppliers={suppliers}
          onNewOrder={() => setOrderModal(true)}
          onSend={async (id) => { await updatePurchaseOrderStatus(rid, id, 'sent'); reload(); }}
          onReceive={(o) => setReceiveModal(o)}
          onCancel={async (id) => { await updatePurchaseOrderStatus(rid, id, 'cancelled'); reload(); }}
          onDelete={async (id) => { await deletePurchaseOrder(rid, id); reload(); }}
          t={t}
        />
      )}

      {tab === 'history' && (
        <HistoryTab orders={historyOrders} t={t} />
      )}

      {/* Supplier Create/Edit Modal */}
      {supplierModal.open && (
        <SupplierFormModal
          editing={supplierModal.editing}
          onClose={() => setSupplierModal({ open: false })}
          onSave={async (input) => {
            if (supplierModal.editing) {
              await updateSupplier(rid, supplierModal.editing.id, input);
            } else {
              await createSupplier(rid, input);
            }
            setSupplierModal({ open: false });
            reload();
          }}
          t={t}
        />
      )}

      {/* Supplier Detail / Products */}
      {detailSupplier && (
        <SupplierDetailModal
          supplier={detailSupplier}
          rid={rid}
          stockItems={stockItems}
          onClose={() => { setDetailSupplier(null); reload(); }}
          onAddProduct={(sid) => setProductModal({ open: true, supplierId: sid })}
          onEditProduct={(sid, p) => setProductModal({ open: true, supplierId: sid, editing: p })}
          t={t}
        />
      )}

      {/* Product Create/Edit Modal */}
      {productModal.open && (
        <ProductFormModal
          editing={productModal.editing}
          stockItems={stockItems}
          onClose={() => setProductModal({ open: false, supplierId: 0 })}
          onSave={async (input) => {
            if (productModal.editing) {
              await updateSupplierProduct(rid, productModal.supplierId, productModal.editing.id, input);
            } else {
              await createSupplierProduct(rid, productModal.supplierId, input);
            }
            setProductModal({ open: false, supplierId: 0 });
            // Refresh detail supplier
            const updated = await listSuppliers(rid);
            setSuppliers(updated);
            const s = updated.find((x) => x.id === productModal.supplierId);
            if (s) setDetailSupplier(s);
          }}
          t={t}
        />
      )}

      {/* New Order Modal */}
      {orderModal && (
        <NewOrderModal
          suppliers={suppliers}
          rid={rid}
          onClose={() => setOrderModal(false)}
          onCreated={() => { setOrderModal(false); reload(); }}
          t={t}
        />
      )}

      {/* Receive Modal */}
      {receiveModal && (
        <ReceiveOrderModal
          order={receiveModal}
          rid={rid}
          onClose={() => setReceiveModal(null)}
          onReceived={() => { setReceiveModal(null); reload(); }}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Suppliers Tab ──────────────────────────────────────────────────

function SuppliersTab({ suppliers, search, onSearchChange, onAdd, onEdit, onDelete, onDetail, t }: {
  suppliers: Supplier[];
  search: string;
  onSearchChange: (v: string) => void;
  onAdd: () => void;
  onEdit: (s: Supplier) => void;
  onDelete: (id: number) => void;
  onDetail: (s: Supplier) => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchItems')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={onAdd} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <PlusIcon className="w-4 h-4" /> {t('addSupplier')}
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="text-center py-12 text-fg-secondary">{t('noSuppliers')}</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('supplierName')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('contactName')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('phone')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('supplierProducts')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="border-t cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderColor: 'var(--divider)' }}
                  onClick={() => onDetail(s)}
                >
                  <td className="px-4 py-3 font-medium text-fg-primary">{s.name}</td>
                  <td className="px-4 py-3 text-fg-secondary">{s.contact_name}</td>
                  <td className="px-4 py-3 text-fg-secondary">{s.phone}</td>
                  <td className="px-4 py-3 text-fg-secondary">{s.products?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onEdit(s)} className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)]">
                        <PencilIcon className="w-4 h-4 text-fg-secondary" />
                      </button>
                      <button onClick={() => { if (confirm('Delete this supplier?')) onDelete(s.id); }} className="p-1.5 rounded-md hover:bg-red-50">
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Orders Tab ─────────────────────────────────────────────────────

function OrdersTab({ orders, suppliers, onNewOrder, onSend, onReceive, onCancel, onDelete, t }: {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  onNewOrder: () => void;
  onSend: (id: number) => void;
  onReceive: (o: PurchaseOrder) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  t: (k: string) => string;
}) {
  const supplierName = (id: number) => suppliers.find((s) => s.id === id)?.name ?? '—';

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg-primary">{t('purchaseOrders')}</h3>
        <button onClick={onNewOrder} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <PlusIcon className="w-4 h-4" /> {t('newOrder')}
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-fg-secondary">{t('noOrders')}</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">#</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('suppliers')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('orderDate')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('status')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('totalAmount')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('items')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                  <td className="px-4 py-3 font-medium text-fg-primary">PO-{o.id}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.supplier?.name ?? supplierName(o.supplier_id)}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.order_date ? new Date(o.order_date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status]}`}>
                      {t(o.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">₪{o.total_amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.items?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {o.status === 'draft' && (
                        <>
                          <button onClick={() => onSend(o.id)} title={t('markAsSent')} className="p-1.5 rounded-md hover:bg-blue-50">
                            <PaperAirplaneIcon className="w-4 h-4 text-blue-500" />
                          </button>
                          <button onClick={() => { if (confirm('Delete this order?')) onDelete(o.id); }} className="p-1.5 rounded-md hover:bg-red-50">
                            <TrashIcon className="w-4 h-4 text-red-500" />
                          </button>
                        </>
                      )}
                      {o.status === 'sent' && (
                        <>
                          <button onClick={() => onReceive(o)} title={t('receiveOrder')} className="p-1.5 rounded-md hover:bg-green-50">
                            <CheckCircleIcon className="w-4 h-4 text-green-500" />
                          </button>
                          <button onClick={() => { if (confirm('Cancel this order?')) onCancel(o.id); }} title={t('cancelled')} className="p-1.5 rounded-md hover:bg-red-50">
                            <XCircleIcon className="w-4 h-4 text-red-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── History Tab ────────────────────────────────────────────────────

function HistoryTab({ orders, t }: { orders: PurchaseOrder[]; t: (k: string) => string }) {
  return (
    <>
      <h3 className="font-semibold text-fg-primary">{t('orderHistory')}</h3>
      {orders.length === 0 ? (
        <div className="text-center py-12 text-fg-secondary">{t('noOrders')}</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">#</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('suppliers')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('orderDate')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('status')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('totalAmount')}</th>
                <th className="text-start px-4 py-3 font-medium text-fg-secondary">{t('items')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                  <td className="px-4 py-3 font-medium text-fg-primary">PO-{o.id}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.order_date ? new Date(o.order_date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status]}`}>
                      {t(o.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">₪{o.total_amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-fg-secondary">{o.items?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Supplier Form Modal ────────────────────────────────────────────

function SupplierFormModal({ editing, onClose, onSave, t }: {
  editing?: Supplier;
  onClose: () => void;
  onSave: (input: SupplierInput) => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [contactName, setContactName] = useState(editing?.contact_name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');

  return (
    <Modal title={editing ? t('editSupplier') : t('addSupplier')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('supplierName')} *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('contactName')}</label>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('phone')}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('email')}</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('address')}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('notes')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => onSave({ name, contact_name: contactName, phone, email, address, notes })}
          className="w-full py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {editing ? t('save') : t('addSupplier')}
        </button>
      </div>
    </Modal>
  );
}

// ─── Supplier Detail Modal ──────────────────────────────────────────

function SupplierDetailModal({ supplier, rid, stockItems, onClose, onAddProduct, onEditProduct, t }: {
  supplier: Supplier;
  rid: number;
  stockItems: StockItem[];
  onClose: () => void;
  onAddProduct: (supplierId: number) => void;
  onEditProduct: (supplierId: number, product: SupplierProduct) => void;
  t: (k: string) => string;
}) {
  const [products, setProducts] = useState<SupplierProduct[]>(supplier.products ?? []);

  useEffect(() => {
    listSupplierProducts(rid, supplier.id).then(setProducts);
  }, [rid, supplier.id]);

  const handleDelete = async (productId: number) => {
    if (!confirm('Delete this product?')) return;
    await deleteSupplierProduct(rid, supplier.id, productId);
    const updated = await listSupplierProducts(rid, supplier.id);
    setProducts(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--divider)' }}>
          <div>
            <h3 className="font-semibold text-fg-primary text-lg">{supplier.name}</h3>
            <p className="text-sm text-fg-secondary">{supplier.contact_name} {supplier.phone && `· ${supplier.phone}`}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-fg-secondary hover:text-fg-primary">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-fg-primary">{t('supplierProducts')}</h4>
            <button onClick={() => onAddProduct(supplier.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">
              <PlusIcon className="w-3 h-3" /> {t('addProduct')}
            </button>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-fg-secondary py-4 text-center">{t('noSuppliers')}</p>
          ) : (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--surface-subtle)' }}>
                    <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('name')}</th>
                    <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('sku')}</th>
                    <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('unit')}</th>
                    <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('pricePerUnit')}</th>
                    <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('linkedStockItem')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                      <td className="px-3 py-2 text-fg-primary">{p.name}</td>
                      <td className="px-3 py-2 text-fg-secondary">{p.sku || '—'}</td>
                      <td className="px-3 py-2 text-fg-secondary">{p.unit}</td>
                      <td className="px-3 py-2 text-fg-secondary">₪{p.price_per_unit.toFixed(2)}</td>
                      <td className="px-3 py-2 text-fg-secondary">
                        {p.stock_item ? p.stock_item.name : stockItems.find((si) => si.id === p.stock_item_id)?.name ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => onEditProduct(supplier.id, p)} className="p-1 rounded-md hover:bg-[var(--surface-subtle)]">
                            <PencilIcon className="w-3.5 h-3.5 text-fg-secondary" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="p-1 rounded-md hover:bg-red-50">
                            <TrashIcon className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product Form Modal ─────────────────────────────────────────────

function ProductFormModal({ editing, stockItems, onClose, onSave, t }: {
  editing?: SupplierProduct;
  stockItems: StockItem[];
  onClose: () => void;
  onSave: (input: SupplierProductInput) => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [unit, setUnit] = useState<StockUnit>(editing?.unit ?? 'unit');
  const [price, setPrice] = useState(editing?.price_per_unit ?? 0);
  const [stockItemId, setStockItemId] = useState<number | null>(editing?.stock_item_id ?? null);

  return (
    <Modal title={editing ? t('editSupplier') : t('addProduct')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('name')} *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('sku')}</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unit')}</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('pricePerUnit')}</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('linkedStockItem')}</label>
          <select value={stockItemId ?? ''} onChange={(e) => setStockItemId(e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}>
            <option value="">—</option>
            {stockItems.map((si) => <option key={si.id} value={si.id}>{si.name} ({si.unit})</option>)}
          </select>
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => onSave({ name, sku, unit, price_per_unit: price, stock_item_id: stockItemId })}
          className="w-full py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}

// ─── New Order Modal ────────────────────────────────────────────────

function NewOrderModal({ suppliers, rid, onClose, onCreated, t }: {
  suppliers: Supplier[];
  rid: number;
  onClose: () => void;
  onCreated: () => void;
  t: (k: string) => string;
}) {
  const [supplierId, setSupplierId] = useState<number>(suppliers[0]?.id ?? 0);
  const [notes, setNotes] = useState('');
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [items, setItems] = useState<(PurchaseOrderItemInput & { _key: number })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    listSupplierProducts(rid, supplierId).then((p) => {
      setProducts(p);
      setItems(p.map((sp, i) => ({
        _key: i,
        supplier_product_id: sp.id,
        stock_item_id: sp.stock_item_id,
        name: sp.name,
        unit: sp.unit,
        quantity: 0,
        price_per_unit: sp.price_per_unit,
      })));
    });
  }, [rid, supplierId]);

  const handleSave = async () => {
    const validItems = items.filter((i) => i.quantity > 0);
    if (validItems.length === 0) return;
    setSaving(true);
    try {
      await createPurchaseOrder(rid, {
        supplier_id: supplierId,
        notes,
        items: validItems.map(({ _key, ...rest }) => rest),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--divider)' }}>
          <h3 className="font-semibold text-fg-primary">{t('newOrder')}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-fg-secondary hover:text-fg-primary">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('suppliers')}</label>
            <select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }} />
          </div>

          {/* Items table */}
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-subtle)' }}>
                  <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('name')}</th>
                  <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('unit')}</th>
                  <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('pricePerUnit')}</th>
                  <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('quantity')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item._key} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                    <td className="px-3 py-2 text-fg-primary">{item.name}</td>
                    <td className="px-3 py-2 text-fg-secondary">{item.unit}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.01" value={item.price_per_unit}
                        onChange={(e) => { const n = [...items]; n[idx] = { ...item, price_per_unit: Number(e.target.value) }; setItems(n); }}
                        className="w-20 px-2 py-1 rounded border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.1" min="0" value={item.quantity}
                        onChange={(e) => { const n = [...items]; n[idx] = { ...item, quantity: Number(e.target.value) }; setItems(n); }}
                        className="w-20 px-2 py-1 rounded border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add manual item */}
          <button
            onClick={() => setItems([...items, { _key: Date.now(), name: '', unit: 'unit' as StockUnit, quantity: 1, price_per_unit: 0 }])}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium"
          >
            + {t('addItem')}
          </button>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--divider)', color: 'var(--text-primary)' }}>{t('cancel')}</button>
            <button
              disabled={saving || items.every((i) => i.quantity <= 0)}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Receive Order Modal ────────────────────────────────────────────

function ReceiveOrderModal({ order, rid, onClose, onReceived, t }: {
  order: PurchaseOrder;
  rid: number;
  onClose: () => void;
  onReceived: () => void;
  t: (k: string) => string;
}) {
  const [receivedItems, setReceivedItems] = useState(
    (order.items ?? []).map((item) => ({ item_id: item.id, received_qty: item.quantity }))
  );
  const [saving, setSaving] = useState(false);

  const handleReceive = async () => {
    setSaving(true);
    try {
      await receivePurchaseOrder(rid, order.id, receivedItems);
      onReceived();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('receiveOrder')} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">PO-{order.id} — {order.supplier?.name}</p>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-subtle)' }}>
                <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('name')}</th>
                <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('quantity')}</th>
                <th className="text-start px-3 py-2 font-medium text-fg-secondary">{t('receivedQty')}</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((item, idx) => (
                <tr key={item.id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                  <td className="px-3 py-2 text-fg-primary">{item.name}</td>
                  <td className="px-3 py-2 text-fg-secondary">{item.quantity} {item.unit}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number" step="0.1" min="0"
                      value={receivedItems[idx]?.received_qty ?? item.quantity}
                      onChange={(e) => {
                        const n = [...receivedItems];
                        n[idx] = { item_id: item.id, received_qty: Number(e.target.value) };
                        setReceivedItems(n);
                      }}
                      className="w-20 px-2 py-1 rounded border text-sm"
                      style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          disabled={saving}
          onClick={handleReceive}
          className="w-full py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <TruckIcon className="w-4 h-4 inline mr-1" /> {t('markAsReceived')}
        </button>
      </div>
    </Modal>
  );
}
