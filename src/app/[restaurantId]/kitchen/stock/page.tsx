'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, importDelivery, confirmDelivery,
  StockItem, StockCategory, StockItemInput, StockUnit, StockTransactionType,
  DeliveryExtraction, ConfirmDeliveryItemInput,
} from '@/lib/api';
import Modal from '@/components/Modal';
import {
  MagnifyingGlassIcon, PlusIcon, ArrowDownTrayIcon,
  ExclamationTriangleIcon, TrashIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowsRightLeftIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];

// ─── Main ──────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: StockItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: StockItem; type?: StockTransactionType }>({ open: false });
  const [importModal, setImportModal] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [stockItems, stockCats] = await Promise.all([
        listStockItems(rid),
        getStockCategories(rid),
      ]);
      setItems(stockItems);
      setCategories(stockCats);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Derived
  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (lowStockOnly && item.quantity > item.reorder_threshold) return false;
    return true;
  });

  const lowStockCount = items.filter((i) => i.quantity <= i.reorder_threshold && i.reorder_threshold > 0).length;
  const totalValue = items.reduce((sum, i) => sum + i.quantity * i.cost_per_unit, 0);
  const categoryNames = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this stock item?')) return;
    await deleteStockItem(rid, id);
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">Total Items</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{items.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">Low Stock</p>
          <p className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-500' : 'text-fg-primary'}`}>
            {lowStockCount}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">Inventory Value</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{totalValue.toFixed(2)} &#8362;</p>
        </div>
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-2 text-sm w-full"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input py-2 text-sm"
        >
          <option value="">All Categories</option>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded"
          />
          Low stock only
        </label>

        <div className="flex-1" />

        <button onClick={() => setImportModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <SparklesIcon className="w-4 h-4" /> Import Delivery
        </button>
        <button onClick={() => setItemModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
          <PlusIcon className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16 space-y-3">
          <p className="text-lg font-semibold text-fg-primary">No stock items found</p>
          <p className="text-sm text-fg-secondary">
            {items.length === 0 ? 'Add your first stock item to get started.' : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-medium">Item</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium text-right">Quantity</th>
                <th className="py-3 px-4 font-medium text-right">Cost/Unit</th>
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;
                const catColor = categories.find((c) => c.name === item.category)?.color;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[var(--surface-subtle)] transition-colors"
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-fg-primary">{item.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {catColor && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColor }} />}
                        <span className="text-fg-secondary">{item.category || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-fg-primary">
                      {item.quantity} <span className="text-fg-secondary text-xs">{item.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-fg-primary">
                      {item.cost_per_unit > 0 ? `${item.cost_per_unit.toFixed(2)} ₪` : '—'}
                    </td>
                    <td className="py-3 px-4 text-fg-secondary">{item.supplier || '—'}</td>
                    <td className="py-3 px-4">
                      {isLow ? (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <ExclamationTriangleIcon className="w-4 h-4" /> Low Stock
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">OK</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setTxModal({ open: true, item, type: 'receive' })}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title="Receive stock"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button
                          onClick={() => setItemModal({ open: true, editing: item })}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Item Modal */}
      {itemModal.open && (
        <StockItemModal
          rid={rid}
          editing={itemModal.editing}
          categories={categoryNames}
          onClose={() => setItemModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* Transaction Modal */}
      {txModal.open && txModal.item && (
        <TransactionModal
          rid={rid}
          item={txModal.item}
          defaultType={txModal.type}
          onClose={() => setTxModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* AI Delivery Import Modal */}
      {importModal && (
        <DeliveryImportModal
          rid={rid}
          onClose={() => setImportModal(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}

// ─── Stock Item Create/Edit Modal ───────────────────────────────────────────

function StockItemModal({
  rid, editing, categories, onClose, onSaved,
}: {
  rid: number;
  editing?: StockItem;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<StockItemInput>({
    name: editing?.name ?? '',
    unit: editing?.unit ?? 'unit',
    quantity: editing?.quantity ?? 0,
    reorder_threshold: editing?.reorder_threshold ?? 0,
    cost_per_unit: editing?.cost_per_unit ?? 0,
    supplier: editing?.supplier ?? '',
    category: editing?.category ?? '',
    notes: editing?.notes ?? '',
    is_active: editing?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateStockItem(rid, editing.id, form);
      } else {
        await createStockItem(rid, form);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? 'Edit Stock Item' : 'Add Stock Item'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-fg-secondary block mb-1">Name *</label>
          <input className="input w-full py-2 text-sm" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Unit *</label>
            <select className="input w-full py-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as StockUnit })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Quantity</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Cost per Unit</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Reorder Threshold</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.reorder_threshold} onChange={(e) => setForm({ ...form, reorder_threshold: +e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Supplier</label>
            <input className="input w-full py-2 text-sm" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">Category</label>
            <input
              className="input w-full py-2 text-sm"
              list="stock-cats"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <datalist id="stock-cats">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">Notes</label>
          <textarea className="input w-full py-2 text-sm" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            Active
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Transaction Modal ──────────────────────────────────────────────────────

function TransactionModal({
  rid, item, defaultType, onClose, onSaved,
}: {
  rid: number;
  item: StockItem;
  defaultType?: StockTransactionType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<StockTransactionType>(defaultType ?? 'receive');
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) return alert('Quantity must be positive');
    setSaving(true);
    try {
      const delta = type === 'receive' ? qty : -qty;
      await createStockTransaction(rid, {
        stock_item_id: item.id,
        type,
        quantity_delta: delta,
        notes,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const typeOptions: { value: StockTransactionType; label: string; icon: typeof ArrowDownIcon }[] = [
    { value: 'receive', label: 'Receive', icon: ArrowDownIcon },
    { value: 'waste', label: 'Waste', icon: TrashIcon },
    { value: 'adjust', label: 'Adjust', icon: ArrowsRightLeftIcon },
  ];

  return (
    <Modal title={`Stock Transaction — ${item.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === opt.value ? 'bg-brand-500 text-white' : 'bg-[var(--surface-subtle)] text-fg-secondary'
              }`}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">Quantity ({item.unit})</label>
          <input type="number" step="any" min="0" required className="input w-full py-2 text-sm" value={qty || ''} onChange={(e) => setQty(+e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">Notes</label>
          <input className="input w-full py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="text-xs text-fg-secondary">
          Current: <span className="font-mono">{item.quantity} {item.unit}</span>
          &rarr; After: <span className="font-mono font-bold">
            {type === 'receive' ? item.quantity + qty : item.quantity - qty} {item.unit}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Confirm'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── AI Delivery Import Modal ───────────────────────────────────────────────

function DeliveryImportModal({
  rid, onClose, onImported,
}: {
  rid: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extraction, setExtraction] = useState<DeliveryExtraction | null>(null);
  const [editedItems, setEditedItems] = useState<ConfirmDeliveryItemInput[]>([]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await importDelivery(rid, file);
      setExtraction(result);
      setEditedItems(result.items.map((i) => ({
        stock_item_id: i.matched_item_id ?? undefined,
        name: i.translated_name || i.original_name,
        original_name: i.original_name,
        quantity: i.quantity,
        unit: i.unit,
        category: i.category,
        cost_per_unit: i.estimated_cost,
      })));
      setStep('review');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await confirmDelivery(rid, {
        supplier_name: extraction?.supplier_name ?? '',
        items: editedItems,
      });
      onImported();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<ConfirmDeliveryItemInput>) => {
    setEditedItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-brand-500" />
            AI Delivery Import
          </h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">Upload a photo or PDF of a delivery voucher. Our AI will extract the items automatically.</p>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input w-full py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleUpload} disabled={!file || loading} className="btn-primary text-sm">
                {loading ? 'Analyzing...' : 'Upload & Analyze'}
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">
              Found {editedItems.length} items from {extraction?.supplier_name || 'supplier'}. Review and confirm.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-secondary uppercase" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <th className="py-2 px-2 font-medium">Name</th>
                    <th className="py-2 px-2 font-medium text-right">Qty</th>
                    <th className="py-2 px-2 font-medium">Unit</th>
                    <th className="py-2 px-2 font-medium text-right">Cost/Unit</th>
                    <th className="py-2 px-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {editedItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td className="py-2 px-2">
                        <input className="input w-full py-1 text-sm" value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" step="any" className="input w-20 py-1 text-sm text-right" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: +e.target.value })} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="input w-16 py-1 text-sm" value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" step="any" className="input w-20 py-1 text-sm text-right" value={item.cost_per_unit} onChange={(e) => updateItem(idx, { cost_per_unit: +e.target.value })} />
                      </td>
                      <td className="py-2 px-2">
                        <input className="input w-24 py-1 text-sm" value={item.category} onChange={(e) => updateItem(idx, { category: e.target.value })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setStep('upload')} className="btn-secondary text-sm">Back</button>
              <button onClick={handleConfirm} disabled={loading} className="btn-primary text-sm">
                {loading ? 'Confirming...' : 'Confirm Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
