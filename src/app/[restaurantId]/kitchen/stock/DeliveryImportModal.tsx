'use client';

import { useState, useEffect } from 'react';
import {
  importDelivery, confirmDelivery, listSuppliers, getRestaurantSettings,
  DeliveryExtraction, ConfirmDeliveryItemInput, StockItem, Supplier, StockUnit,
} from '@/lib/api';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
import { SparklesIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import SearchableSelect from '@/components/SearchableSelect';

interface DeliveryImportModalProps {
  rid: number;
  stockItems: StockItem[];
  onClose: () => void;
  onImported: () => void;
}

// Draft shape stored in localStorage
interface DeliveryImportDraft {
  extraction: DeliveryExtraction;
  editedItems: ConfirmDeliveryItemInput[];
  selectedSupplierId: number;
  newSupplierName: string;
  savedAt: string; // ISO date
}

function getDraftKey(rid: number) { return `delivery-import-draft-${rid}`; }

function loadDraft(rid: number): DeliveryImportDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(rid));
    if (!raw) return null;
    const draft = JSON.parse(raw) as DeliveryImportDraft;
    // Expire drafts older than 7 days
    if (new Date().getTime() - new Date(draft.savedAt).getTime() > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getDraftKey(rid));
      return null;
    }
    return draft;
  } catch { return null; }
}

function saveDraft(rid: number, draft: DeliveryImportDraft) {
  try { localStorage.setItem(getDraftKey(rid), JSON.stringify(draft)); } catch {}
}

function clearDraft(rid: number) {
  try { localStorage.removeItem(getDraftKey(rid)); } catch {}
}

export default function DeliveryImportModal({ rid, stockItems, onClose, onImported }: DeliveryImportModalProps) {
  const { t, locale, direction } = useI18n();
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extraction, setExtraction] = useState<DeliveryExtraction | null>(null);
  const [editedItems, setEditedItems] = useState<ConfirmDeliveryItemInput[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<'document' | 'items'>('items');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [vatRate, setVatRate] = useState(18);
  const [hasDraft, setHasDraft] = useState(false);

  // Load restaurant suppliers, VAT rate, and check for existing draft
  useEffect(() => {
    listSuppliers(rid).then(setSuppliers).catch(() => {});
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
    setHasDraft(!!loadDraft(rid));
  }, [rid]);

  // Auto-save draft whenever review state changes
  useEffect(() => {
    if (step === 'review' && extraction && editedItems.length > 0) {
      saveDraft(rid, {
        extraction,
        editedItems,
        selectedSupplierId,
        newSupplierName,
        savedAt: new Date().toISOString(),
      });
    }
  }, [step, extraction, editedItems, selectedSupplierId, newSupplierName, rid]);

  const resumeDraft = () => {
    const draft = loadDraft(rid);
    if (!draft) return;
    setExtraction(draft.extraction);
    setEditedItems(draft.editedItems);
    setSelectedSupplierId(draft.selectedSupplierId);
    setNewSupplierName(draft.newSupplierName);
    setStep('review');
  };

  const discardDraft = () => {
    clearDraft(rid);
    setHasDraft(false);
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await importDelivery(rid, file, locale, 'hybrid', undefined, selectedSupplierId > 0 ? selectedSupplierId : undefined);
      setExtraction(result);
      setEditedItems(result.items.map((i) => {
        const matched = i.matched_item_id ? stockItems.find((s) => s.id === i.matched_item_id) : null;
        return {
          stock_item_id: i.matched_item_id ?? undefined,
          name: i.translated_name || i.original_name,
          original_name: i.original_name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          cost_per_unit: i.estimated_cost,
          pack_count: i.pack_count || i.quantity,
          units_per_pack: 1,
          price_per_pack: i.price_per_pack || 0,
          total_price: i.total_price || (i.estimated_cost * i.quantity),
          unit_size: i.unit_size || 0,
          unit_size_unit: i.unit_size_unit || '',
          price_includes_vat: matched?.price_includes_vat ?? true,
        };
      }));
      setPreviewUrl(URL.createObjectURL(file));
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
      // Use user-typed name for new suppliers, otherwise use AI-extracted or DB supplier name
      const supplierName = selectedSupplierId === -1
        ? newSupplierName.trim()
        : (selectedSupplierId > 0
          ? suppliers.find((s) => s.id === selectedSupplierId)?.name
          : extraction?.supplier_name) ?? '';
      await confirmDelivery(rid, {
        supplier_name: supplierName,
        items: editedItems,
      });
      clearDraft(rid);
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

  const existingCategories = Array.from(new Set(stockItems.map((s) => s.category).filter(Boolean)));

  const stockOptions = [
    { value: '', label: `— ${t('newItem')} —`, sublabel: '' },
    ...stockItems.map((s) => ({ value: String(s.id), label: s.name, sublabel: s.unit })),
  ];

  // ─── Upload Step (compact dialog) ─────────────────────────────────────────

  if (step === 'upload') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-modal shadow-xl p-6 w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-fg-primary flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-brand-500" />
              {t('aiDeliveryImport')}
            </h3>
            <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">{t('aiDeliveryDesc')}</p>

            {/* Resume draft banner */}
            {hasDraft && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-brand-500/30 bg-brand-500/5">
                <p className="text-sm text-fg-primary">{t('draftAvailable')}</p>
                <div className="flex items-center gap-2">
                  <button onClick={discardDraft} className="text-xs text-fg-secondary hover:text-fg-primary">{t('discard')}</button>
                  <button onClick={resumeDraft} className="btn-primary text-xs px-3 py-1">{t('resumeDraft')}</button>
                </div>
              </div>
            )}

            {/* Supplier selector */}
            <div>
              <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('selectSupplier')} *</label>
              <SearchableSelect
                value={selectedSupplierId === -1 ? '__new__' : selectedSupplierId ? String(selectedSupplierId) : ''}
                onChange={(val) => {
                  if (val === '__new__') {
                    setSelectedSupplierId(-1);
                    setNewSupplierName('');
                  } else {
                    setSelectedSupplierId(val ? +val : 0);
                    setNewSupplierName('');
                  }
                }}
                options={[
                  ...suppliers.map((s) => ({ value: String(s.id), label: s.name })),
                  { value: '__new__', label: `+ ${t('newSupplier')}` },
                ]}
                placeholder={t('selectSupplier')}
              />
              {selectedSupplierId === -1 && (
                <input
                  className="input w-full py-2 text-sm mt-2"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder={t('supplierName')}
                  autoFocus
                />
              )}
            </div>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input w-full py-2 text-sm"
            />
            {/* File thumbnail preview */}
            {file && file.type.startsWith('image/') && (
              <div className="rounded-lg overflow-hidden border border-[var(--divider)] max-h-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}
            {file && file.type === 'application/pdf' && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-[var(--divider)] text-sm text-fg-secondary">
                <DocumentTextIcon className="w-5 h-5" />
                {file.name}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
              <button onClick={handleUpload} disabled={!file || loading || (!selectedSupplierId && !newSupplierName.trim()) || (selectedSupplierId === -1 && !newSupplierName.trim())} className="btn-primary text-sm">
                {loading ? t('analyzing') : t('uploadAndAnalyze')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Review Step (full-screen split) ──────────────────────────────────────

  const isRtl = direction === 'rtl';

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* ─ Header ─ */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
        <div className="flex items-center gap-3">
          <SparklesIcon className="w-5 h-5 text-brand-500" />
          <h3 className="font-semibold text-fg-primary">{t('aiDeliveryImport')}</h3>
          {extraction?.supplier_name && (
            <span className="text-sm text-fg-secondary">— {extraction.supplier_name}</span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
            {editedItems.length} {t('items')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setStep('upload'); }} className="btn-secondary text-sm">{t('back')}</button>
          <button onClick={handleConfirm} disabled={loading} className="btn-primary text-sm">
            {loading ? t('confirming') : t('confirmImport')}
          </button>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none px-2">&times;</button>
        </div>
      </div>

      {/* ─ Mobile tabs (below lg) ─ */}
      <div className="flex lg:hidden border-b border-[var(--divider)]">
        <button
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${reviewTab === 'document' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-fg-secondary'}`}
          onClick={() => setReviewTab('document')}
        >
          {t('originalDocument')}
        </button>
        <button
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${reviewTab === 'items' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-fg-secondary'}`}
          onClick={() => setReviewTab('items')}
        >
          {t('items')} ({editedItems.length})
        </button>
      </div>

      {/* ─ Main content ─ */}
      <div className={`flex flex-1 min-h-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
        {/* ─ Document preview (left on LTR, right on RTL) ─ */}
        <div className={`w-1/2 border-[var(--divider)] overflow-auto p-4 hidden lg:flex flex-col ${isRtl ? 'border-l' : 'border-r'}`}>
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-3">{t('originalDocument')}</h4>
          <div className="flex-1 rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
            {previewUrl && file?.type.startsWith('image/') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
            )}
            {previewUrl && file?.type === 'application/pdf' && (
              <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
            )}
          </div>
        </div>

        {/* ─ Mobile document view ─ */}
        {reviewTab === 'document' && (
          <div className="flex-1 overflow-auto p-4 lg:hidden">
            <div className="rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
              {previewUrl && file?.type.startsWith('image/') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
              )}
              {previewUrl && file?.type === 'application/pdf' && (
                <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
              )}
            </div>
          </div>
        )}

        {/* ─ Items editor (right on LTR, left on RTL) ─ */}
        <div className={`w-1/2 overflow-y-auto p-4 hidden lg:block`}>
          <ItemsList
            editedItems={editedItems}
            stockItems={stockItems}
            stockOptions={stockOptions}
            existingCategories={existingCategories}
            updateItem={updateItem}
            vatRate={vatRate}
            t={t}
          />
        </div>

        {/* ─ Mobile items view ─ */}
        {reviewTab === 'items' && (
          <div className="flex-1 overflow-y-auto p-4 lg:hidden">
            <ItemsList
              editedItems={editedItems}
              stockItems={stockItems}
              stockOptions={stockOptions}
              existingCategories={existingCategories}
              updateItem={updateItem}
              vatRate={vatRate}
              t={t}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Items List (shared between desktop and mobile) ───────────────────────

function ItemsList({
  editedItems, stockItems, stockOptions, existingCategories, updateItem, vatRate, t,
}: {
  editedItems: ConfirmDeliveryItemInput[];
  stockItems: StockItem[];
  stockOptions: { value: string; label: string; sublabel?: string }[];
  existingCategories: string[];
  updateItem: (idx: number, patch: Partial<ConfirmDeliveryItemInput>) => void;
  vatRate: number;
  t: (key: string) => string;
}) {
  const vatMultiplier = 1 + vatRate / 100;
  return (
    <div className="space-y-3">
      {editedItems.map((item, idx) => {
        const isExisting = !!item.stock_item_id;
        return (
          <div key={idx} className="p-4 rounded-lg space-y-3" style={{ background: 'var(--surface-subtle)' }}>
            {/* Row 1: Stock item match */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('matchToStockItem')}</label>
                <SearchableSelect
                  value={item.stock_item_id ? String(item.stock_item_id) : ''}
                  onChange={(val) => {
                    if (val) {
                      const si = stockItems.find((s) => s.id === +val);
                      if (si) updateItem(idx, { stock_item_id: si.id, name: si.name, unit: si.unit, category: si.category });
                    } else {
                      updateItem(idx, { stock_item_id: undefined });
                    }
                  }}
                  options={stockOptions}
                  placeholder={t('matchToStockItem')}
                />
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap self-end mb-1 ${isExisting ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                {isExisting ? t('existing') : t('new')}
              </span>
            </div>

            {/* Original name (supplier language) */}
            {item.original_name && item.original_name !== item.name && (
              <p className="text-xs text-fg-secondary" dir="auto">
                <span className="text-fg-tertiary">{t('originalName')}:</span> {item.original_name}
              </p>
            )}

            {/* Row 2: Name + Category (new items only) */}
            {!isExisting && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                  <input className="input w-full py-1.5 text-sm" value={item.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('category')}</label>
                  <select className="input w-full py-1.5 text-sm" value={item.category}
                    onChange={(e) => updateItem(idx, { category: e.target.value })}>
                    <option value="">{t('category')}</option>
                    {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    {item.category && !existingCategories.includes(item.category) && (
                      <option value={item.category}>{item.category}</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Row 3: Packs / Units per pack / Price per pack / Total */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('packCount')}</label>
                <input type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                  value={item.pack_count ?? ''} onChange={(e) => {
                    const packs = +e.target.value;
                    const upp = item.units_per_pack ?? 1;
                    const us = item.unit_size ?? 1;
                    const qty = packs * (upp > 0 ? upp : 1) * (us > 0 ? us : 1);
                    const ppk = item.price_per_pack ?? 0;
                    const tp = packs * ppk;
                    const cpu = qty > 0 && tp > 0 ? tp / qty : item.cost_per_unit;
                    updateItem(idx, { pack_count: packs, quantity: qty, total_price: tp || item.total_price, cost_per_unit: cpu || item.cost_per_unit });
                  }} />
              </div>
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('unitsPerPack')}</label>
                <input type="number" step="1" min="1" className="input w-full py-1.5 text-sm text-right"
                  value={item.units_per_pack ?? 1} onChange={(e) => {
                    const upp = +e.target.value;
                    const packs = item.pack_count ?? 1;
                    const us = item.unit_size ?? 1;
                    const qty = packs * (upp > 0 ? upp : 1) * (us > 0 ? us : 1);
                    const tp = item.total_price ?? 0;
                    const cpu = qty > 0 && tp > 0 ? tp / qty : item.cost_per_unit;
                    updateItem(idx, { units_per_pack: upp, quantity: qty, cost_per_unit: cpu });
                  }} />
              </div>
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('pricePerPackage')} &#8362;</label>
                <input type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                  value={item.price_per_pack ?? ''} onChange={(e) => {
                    const ppk = +e.target.value;
                    const packs = item.pack_count ?? 1;
                    const tp = packs * ppk;
                    const qty = item.quantity;
                    const cpu = qty > 0 && tp > 0 ? tp / qty : 0;
                    updateItem(idx, { price_per_pack: ppk, total_price: tp, cost_per_unit: cpu });
                  }} />
              </div>
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('totalPrice')} &#8362;</label>
                <input type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                  value={item.total_price ?? ''} onChange={(e) => {
                    const tp = +e.target.value;
                    const packs = item.pack_count ?? 1;
                    const ppk = packs > 0 ? tp / packs : 0;
                    const qty = item.quantity;
                    const cpu = qty > 0 ? tp / qty : 0;
                    updateItem(idx, { total_price: tp, price_per_pack: ppk, cost_per_unit: cpu });
                  }} />
              </div>
            </div>

            {/* Row 4: Unit size / Unit / Stock quantity — all editable */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('unitSize')}</label>
                <input type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                  value={item.unit_size ?? ''} onChange={(e) => {
                    const us = +e.target.value;
                    const packs = item.pack_count ?? 1;
                    const upp = item.units_per_pack ?? 1;
                    const qty = packs * (upp > 0 ? upp : 1) * (us > 0 ? us : 1);
                    const tp = item.total_price ?? 0;
                    const cpu = qty > 0 && tp > 0 ? tp / qty : item.cost_per_unit;
                    updateItem(idx, { unit_size: us, quantity: qty, cost_per_unit: cpu });
                  }} />
              </div>
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('unit')}</label>
                <select className="input w-full py-1.5 text-sm" value={item.unit}
                  onChange={(e) => updateItem(idx, { unit: e.target.value, unit_size_unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('stockQuantity')}</label>
                <input type="number" step="any" min="0" className="input w-full py-1.5 text-sm text-right"
                  value={item.quantity} onChange={(e) => {
                    const qty = +e.target.value;
                    const tp = item.total_price ?? 0;
                    const cpu = qty > 0 && tp > 0 ? tp / qty : 0;
                    updateItem(idx, { quantity: qty, cost_per_unit: cpu });
                  }} />
              </div>
            </div>

            {/* Row 5: VAT + Stock summary */}
            <div className="pt-2 border-t border-[var(--divider)] space-y-1">
              <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer select-none">
                <input type="checkbox" checked={item.price_includes_vat ?? true}
                  onChange={(e) => updateItem(idx, { price_includes_vat: e.target.checked })}
                  className="rounded border-fg-secondary" />
                {t('priceIncludesVat')}
              </label>
              {item.quantity > 0 && (item.total_price ?? 0) > 0 && (
                <p className="text-xs text-fg-secondary">
                  &rarr; {t('stockReceives')}: {item.quantity} {item.unit} @ {((item.total_price ?? 0) / item.quantity).toFixed(2)} &#8362;/{item.unit}
                  {' '}
                  <span className="text-fg-tertiary">
                    ({item.price_includes_vat
                      ? `${t('exVat')}: ${((item.total_price ?? 0) / vatMultiplier).toFixed(2)} ₪`
                      : `${t('incVat')}: ${((item.total_price ?? 0) * vatMultiplier).toFixed(2)} ₪`
                    })
                  </span>
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
