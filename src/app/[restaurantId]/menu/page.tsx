'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getMenu, createCategory, updateCategory, deleteCategory,
  createMenuItem, updateMenuItem, deleteMenuItem,
  MenuCategory, MenuItem,
} from '@/lib/api';
import { PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export default function MenuPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Category form state
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });
  const [categoryName, setCategoryName] = useState('');

  // Item form state
  const [itemModal, setItemModal] = useState<{ open: boolean; categoryId?: number; editing?: MenuItem }>({ open: false });
  const [itemForm, setItemForm] = useState({ name: '', description: '', price: '', is_active: true });

  const reload = () => getMenu(rid).then(setCategories).finally(() => setLoading(false));
  useEffect(() => { reload(); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Category actions ──────────────────────────────────────────────

  const openAddCategory = () => { setCategoryName(''); setCategoryModal({ open: true }); };
  const openEditCategory = (cat: MenuCategory) => { setCategoryName(cat.name); setCategoryModal({ open: true, editing: cat }); };

  const saveCategory = async () => {
    if (!categoryName.trim()) return;
    if (categoryModal.editing) {
      await updateCategory(rid, categoryModal.editing.id, { name: categoryName });
    } else {
      await createCategory(rid, { name: categoryName });
    }
    setCategoryModal({ open: false });
    reload();
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Delete this category and all its items?')) return;
    await deleteCategory(rid, id);
    reload();
  };

  // ── Item actions ──────────────────────────────────────────────────

  const openAddItem = (categoryId: number) => {
    setItemForm({ name: '', description: '', price: '', is_active: true });
    setItemModal({ open: true, categoryId });
  };
  const openEditItem = (item: MenuItem) => {
    setItemForm({ name: item.name, description: item.description, price: String(item.price), is_active: item.is_active });
    setItemModal({ open: true, editing: item });
  };

  const saveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const payload = {
      name: itemForm.name,
      description: itemForm.description,
      price: parseFloat(itemForm.price),
      is_active: itemForm.is_active,
    };
    if (itemModal.editing) {
      await updateMenuItem(rid, itemModal.editing.id, payload);
    } else if (itemModal.categoryId) {
      await createMenuItem(rid, { ...payload, category_id: itemModal.categoryId });
    }
    setItemModal({ open: false });
    reload();
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Delete this item?')) return;
    await deleteMenuItem(rid, id);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
        <button onClick={openAddCategory} className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          No menu categories yet. Add your first category to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.id} className="card p-0 overflow-hidden">
              {/* Category header */}
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(cat.id)}
              >
                <div className="flex items-center gap-3">
                  {expanded.has(cat.id) ? (
                    <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="font-semibold text-gray-900">{cat.name}</span>
                  <span className="text-xs text-gray-400">({(cat.items ?? []).length} items)</span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { toggleExpand(cat.id); openAddItem(cat.id); }}
                    className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                  >
                    <PlusIcon className="w-3 h-3" /> Add Item
                  </button>
                  <button onClick={() => openEditCategory(cat)} className="p-1.5 rounded hover:bg-gray-100">
                    <PencilIcon className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 rounded hover:bg-red-50">
                    <TrashIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Items list */}
              {expanded.has(cat.id) && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {(cat.items ?? []).length === 0 ? (
                    <p className="px-6 py-4 text-sm text-gray-400">No items in this category</p>
                  ) : (
                    (cat.items ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-4">
                          {item.image_url && (
                            <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          )}
                          <div>
                            <div className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                              {item.name}
                            </div>
                            {item.description && (
                              <div className="text-xs text-gray-400 truncate max-w-xs">{item.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-gray-900">₪{item.price.toFixed(2)}</span>
                          <button onClick={() => openEditItem(item)} className="p-1.5 rounded hover:bg-gray-100">
                            <PencilIcon className="w-4 h-4 text-gray-500" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded hover:bg-red-50">
                            <TrashIcon className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category modal */}
      {categoryModal.open && (
        <Modal title={categoryModal.editing ? 'Edit Category' : 'New Category'} onClose={() => setCategoryModal({ open: false })}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category name</label>
          <input
            autoFocus
            className="input"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCategory()}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-secondary" onClick={() => setCategoryModal({ open: false })}>Cancel</button>
            <button className="btn-primary" onClick={saveCategory}>Save</button>
          </div>
        </Modal>
      )}

      {/* Item modal */}
      {itemModal.open && (
        <Modal title={itemModal.editing ? 'Edit Item' : 'New Item'} onClose={() => setItemModal({ open: false })}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input autoFocus className="input" value={itemForm.name}
                onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input className="input" value={itemForm.description}
                onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (₪)</label>
              <input type="number" min="0" step="0.01" className="input" value={itemForm.price}
                onChange={(e) => setItemForm((p) => ({ ...p, price: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={itemForm.is_active}
                onChange={(e) => setItemForm((p) => ({ ...p, is_active: e.target.checked }))} />
              <span className="text-sm text-gray-700">Active (visible to customers)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-secondary" onClick={() => setItemModal({ open: false })}>Cancel</button>
            <button className="btn-primary" onClick={saveItem}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
