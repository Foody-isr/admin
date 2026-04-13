'use client';

import { useState, useEffect } from 'react';
import {
  importDelivery, confirmDelivery, listSuppliers, getRestaurantSettings,
  getImportDraft, createImportDraft, deleteImportDraft,
  DeliveryExtraction, ConfirmDeliveryItemInput, StockItem, Supplier, StockUnit,
} from '@/lib/api';

import { SparklesIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import SearchableSelect from '@/components/SearchableSelect';
import StockQuantityForm, {
  StockInput, BaseUnit, PackagingUnit, deriveTotals,
} from '@/components/stock/StockQuantityForm';

const PACKAGING_UNITS: Set<string> = new Set([
  'carton', 'pack', 'box', 'bag', 'bottle',
  'can', 'jar', 'sachet', 'tub', 'brick', 'packet',
  'crate', 'sack', 'case',
]);

function coercePackagingUnit(value: string | undefined, fallback: PackagingUnit): PackagingUnit {
  return value && PACKAGING_UNITS.has(value) ? (value as PackagingUnit) : fallback;
}

const BASE_SET: Set<string> = new Set(['g', 'kg', 'ml', 'l', 'unit']);

/** Map the AI-extracted delivery line into our union.
 *  Strategy: if pack/units-per-pack/unit-size suggest multi-level packaging,
 *  produce packaged-nested. If only a single packaging level is present,
 *  packaged-direct. Otherwise fall back to simple. */
function lineToStockInput(item: ConfirmDeliveryItemInput): StockInput {
  const packs = item.pack_count ?? 0;
  const upp = item.units_per_pack ?? 0;
  const us = item.unit_size ?? 0;
  const unit = (item.unit || 'kg') as StockUnit;
  const isBase = BASE_SET.has(unit);

  // Nested: outer × inner × content
  // Present when we have inner-layer hints: either units_per_pack > 1, or
  // the saved packaging carries a unit_type (e.g. "can" in "cartons of 12 cans").
  const hasInnerLayer = upp > 1 || (item.unit_type ?? '') !== '';
  if (packs > 0 && hasInnerLayer && us > 0 && isBase) {
    return {
      type: 'packaged-nested',
      outerUnit: coercePackagingUnit(item.container_type, 'carton'),
      outerQuantity: packs,
      innerUnit: coercePackagingUnit(item.unit_type, 'can'),
      innerQuantity: upp,
      contentQuantity: us,
      contentUnit: unit as BaseUnit,
      totalPrice: item.total_price ?? 0,
    };
  }
  // Direct: outer × content (no inner layer)
  if (packs > 0 && us > 0 && isBase) {
    return {
      type: 'packaged-direct',
      outerUnit: coercePackagingUnit(item.container_type, 'carton'),
      outerQuantity: packs,
      contentQuantity: us,
      contentUnit: unit as BaseUnit,
      totalPrice: item.total_price ?? 0,
    };
  }
  // Simple
  return {
    type: 'simple',
    unit: (isBase ? unit : 'kg') as BaseUnit,
    quantity: item.quantity,
    totalPrice: item.total_price ?? (item.cost_per_unit * item.quantity),
  };
}

/** Map our union back into DB-facing line fields. */
function stockInputToLinePatch(i: StockInput): Partial<ConfirmDeliveryItemInput> {
  const d = deriveTotals(i);
  if (i.type === 'simple') {
    return {
      unit: i.unit,
      quantity: i.quantity,
      cost_per_unit: d.costPerBase,
      pack_count: 0,
      units_per_pack: 0,
      unit_size: 0,
      unit_size_unit: '',
      container_type: '',
      unit_type: '',
      price_per_pack: 0,
      total_price: i.totalPrice,
    };
  }
  if (i.type === 'packaged-direct') {
    return {
      unit: i.contentUnit,
      quantity: d.totalBase,
      cost_per_unit: d.costPerBase,
      pack_count: i.outerQuantity,
      units_per_pack: 0,
      unit_size: i.contentQuantity,
      unit_size_unit: i.contentUnit,
      container_type: i.outerUnit,
      unit_type: '',
      price_per_pack: d.pricePerOuter,
      total_price: i.totalPrice,
    };
  }
  return {
    unit: i.contentUnit,
    quantity: d.totalBase,
    cost_per_unit: d.costPerBase,
    pack_count: i.outerQuantity,
    units_per_pack: i.innerQuantity,
    unit_size: i.contentQuantity,
    unit_size_unit: i.contentUnit,
    container_type: i.outerUnit,
    unit_type: i.innerUnit,
    price_per_pack: d.pricePerOuter,
    total_price: i.totalPrice,
  };
}

interface DeliveryImportModalProps {
  rid: number;
  stockItems: StockItem[];
  draftId?: number; // If provided, resume this draft on open
  onClose: () => void;
  onImported: () => void;
}

export default function DeliveryImportModal({ rid, stockItems, draftId, onClose, onImported }: DeliveryImportModalProps) {
  const { t, locale, direction } = useI18n();
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extraction, setExtraction] = useState<DeliveryExtraction | null>(null);
  const [editedItems, setEditedItems] = useState<ConfirmDeliveryItemInput[]>([]);
  // Per-line form state. Stored alongside editedItems so mode+packaging fields
  // persist across renders (the line item alone can't represent mode when all
  // packaging fields are zero — that's why toggling Basic→Advanced on an empty
  // line used to snap back).
  const [formStates, setFormStates] = useState<StockInput[]>([]);
  // Indexes of flagged rows (`needs_review === true`) that the user has
  // acknowledged — either by clicking "Mark as checked" or by editing any
  // field on the row. Used to gate the "Confirm import" button.
  const [reviewedItems, setReviewedItems] = useState<Set<number>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>(''); // MIME type for preview (from file or draft)
  const [reviewTab, setReviewTab] = useState<'document' | 'items'>('items');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [vatRate, setVatRate] = useState(18);
  const [currentDraftId, setCurrentDraftId] = useState<number | undefined>(draftId);
  const [savingDraft, setSavingDraft] = useState(false);

  // Load restaurant suppliers + VAT rate, and resume draft if draftId provided
  useEffect(() => {
    listSuppliers(rid).then(setSuppliers).catch(() => {});
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
    if (draftId) {
      getImportDraft(rid, draftId).then((detail) => {
        setExtraction(detail.extraction);
        setEditedItems(detail.edited_items);
        setFormStates(detail.edited_items.map(lineToStockInput));
        setReviewedItems(new Set());
        setSelectedSupplierId(detail.draft.supplier_id ?? 0);
        setNewSupplierName('');
        // Use the S3 document URL for preview
        if (detail.draft.document_url) {
          setPreviewUrl(detail.draft.document_url);
          setPreviewType(detail.draft.document_type || '');
        }
        setStep('review');
      }).catch(() => {});
    }
  }, [rid, draftId]);

  const handleSaveDraft = async () => {
    if (!extraction) return;
    setSavingDraft(true);
    try {
      const supplierName = selectedSupplierId === -1
        ? newSupplierName.trim()
        : (selectedSupplierId > 0
          ? suppliers.find((s) => s.id === selectedSupplierId)?.name
          : extraction.supplier_name) ?? '';
      const draft = await createImportDraft(rid, file, {
        supplier_id: selectedSupplierId > 0 ? selectedSupplierId : undefined,
        supplier_name: supplierName,
        extraction,
        edited_items: editedItems,
      });
      setCurrentDraftId(draft.id);
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Cleanup blob URL on unmount (only for locally created blob URLs, not S3 URLs)
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
      const newItems: ConfirmDeliveryItemInput[] = result.items.map((i) => {
        const matched = i.matched_item_id ? stockItems.find((s) => s.id === i.matched_item_id) : null;
        return {
          stock_item_id: i.matched_item_id ?? undefined,
          name: i.translated_name || i.original_name,
          original_name: i.original_name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          cost_per_unit: i.estimated_cost,
          pack_count: i.pack_count ?? 0,
          units_per_pack: i.units_per_pack ?? 0,
          price_per_pack: i.price_per_pack || 0,
          total_price: i.total_price || (i.estimated_cost * i.quantity),
          unit_size: i.unit_size || 0,
          unit_size_unit: i.unit_size_unit || '',
          container_type: i.container_type || '',
          unit_type: i.unit_type || '',
          price_includes_vat: matched?.price_includes_vat ?? false,
          row_index: i.row_index,
          needs_review: i.needs_review,
          review_reason: i.review_reason,
        };
      });
      setEditedItems(newItems);
      setFormStates(newItems.map(lineToStockInput));
      setReviewedItems(new Set());
      setPreviewUrl(URL.createObjectURL(file));
      setPreviewType(file.type);
      setStep('review');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Count of flagged rows that haven't been edited/acknowledged and aren't skipped.
  const unreviewedFlaggedCount = editedItems.reduce((n, it, idx) => (
    it.needs_review && !it.skipped && !reviewedItems.has(idx) ? n + 1 : n
  ), 0);

  const markReviewed = (idx: number) => {
    setReviewedItems((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleConfirm = async () => {
    const itemsToImport = editedItems.filter((i) => !i.skipped);
    if (itemsToImport.length === 0) {
      alert(t('nothingToImport'));
      return;
    }
    if (unreviewedFlaggedCount > 0) {
      alert(t('reviewBlockedBanner').replace('{n}', String(unreviewedFlaggedCount)));
      return;
    }
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
        items: itemsToImport,
      });
      // Delete draft if this was resumed from one
      if (currentDraftId) {
        deleteImportDraft(rid, currentDraftId).catch(() => {});
      }
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
    // Editing any field implicitly acknowledges the warning.
    markReviewed(idx);
  };

  const updateFormState = (idx: number, v: StockInput) => {
    setFormStates((prev) => {
      if (prev[idx] === v) return prev;
      const next = prev.slice();
      next[idx] = v;
      return next;
    });
    updateItem(idx, stockInputToLinePatch(v));
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
          {(() => {
            const displaySupplier = selectedSupplierId === -1
              ? newSupplierName
              : selectedSupplierId > 0
                ? suppliers.find((s) => s.id === selectedSupplierId)?.name
                : extraction?.supplier_name;
            return displaySupplier ? <span className="text-sm text-fg-secondary">— {displaySupplier}</span> : null;
          })()}
          {(() => {
            const skipped = editedItems.filter((i) => i.skipped).length;
            const active = editedItems.length - skipped;
            return (
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
                {active} {t('items')}
                {skipped > 0 && <> · {skipped} {t('skipped').toLowerCase()}</>}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setStep('upload'); }} className="btn-secondary text-sm">{t('back')}</button>
          <button onClick={handleSaveDraft} disabled={savingDraft} className="btn-secondary text-sm">
            {savingDraft ? t('saving') : t('saveDraft')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || unreviewedFlaggedCount > 0}
            title={unreviewedFlaggedCount > 0 ? t('reviewBlockedBanner').replace('{n}', String(unreviewedFlaggedCount)) : undefined}
            className="btn-primary text-sm"
          >
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
            {previewUrl && previewType.startsWith('image/') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
            )}
            {previewUrl && previewType === 'application/pdf' && (
              <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
            )}
          </div>
        </div>

        {/* ─ Mobile document view ─ */}
        {reviewTab === 'document' && (
          <div className="flex-1 overflow-auto p-4 lg:hidden">
            <div className="rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
              {previewUrl && previewType.startsWith('image/') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
              )}
              {previewUrl && previewType === 'application/pdf' && (
                <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
              )}
            </div>
          </div>
        )}

        {/* ─ Items editor (right on LTR, left on RTL) ─ */}
        <div className={`w-1/2 overflow-y-auto p-4 hidden lg:block`}>
          <ItemsList
            editedItems={editedItems}
            formStates={formStates}
            stockItems={stockItems}
            stockOptions={stockOptions}
            existingCategories={existingCategories}
            updateItem={updateItem}
            updateFormState={updateFormState}
            vatRate={vatRate}
            t={t}
            reviewedItems={reviewedItems}
            markReviewed={markReviewed}
          />
        </div>

        {/* ─ Mobile items view ─ */}
        {reviewTab === 'items' && (
          <div className="flex-1 overflow-y-auto p-4 lg:hidden">
            <ItemsList
              editedItems={editedItems}
              formStates={formStates}
              stockItems={stockItems}
              stockOptions={stockOptions}
              existingCategories={existingCategories}
              updateItem={updateItem}
              updateFormState={updateFormState}
              vatRate={vatRate}
              t={t}
              reviewedItems={reviewedItems}
              markReviewed={markReviewed}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Items List (shared between desktop and mobile) ───────────────────────

function ItemsList({
  editedItems, formStates, stockItems, stockOptions, existingCategories, updateItem, updateFormState, vatRate, t, reviewedItems, markReviewed,
}: {
  editedItems: ConfirmDeliveryItemInput[];
  formStates: StockInput[];
  stockItems: StockItem[];
  stockOptions: { value: string; label: string; sublabel?: string }[];
  existingCategories: string[];
  updateItem: (idx: number, patch: Partial<ConfirmDeliveryItemInput>) => void;
  updateFormState: (idx: number, v: StockInput) => void;
  vatRate: number;
  t: (key: string) => string;
  reviewedItems: Set<number>;
  markReviewed: (idx: number) => void;
}) {
  return (
    <div className="space-y-3">
      {editedItems.map((item, idx) => {
        const isExisting = !!item.stock_item_id;
        const isSkipped = !!item.skipped;
        const isFlagged = !!item.needs_review && !isSkipped && !reviewedItems.has(idx);
        const reasonKey = (() => {
          switch (item.review_reason) {
            case 'math_mismatch':       return 'reviewReasonMathMismatch';
            case 'missing_size':        return 'reviewReasonMissingSize';
            case 'missing_pack_count':  return 'reviewReasonMissingPackCount';
            case 'low_confidence':      return 'reviewReasonLowConfidence';
            case 'duplicate_row':       return 'reviewReasonDuplicateRow';
            default:                    return 'reviewNeededBanner';
          }
        })();
        return (
          <div
            key={idx}
            className={`p-4 rounded-lg space-y-3 ${isFlagged ? 'border-l-4 border-amber-500' : ''}`}
            style={{ background: 'var(--surface-subtle)', opacity: isSkipped ? 0.5 : 1 }}
          >
            {isFlagged && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 text-amber-600 text-xs">
                <span aria-hidden className="mt-0.5">⚠</span>
                <span className="flex-1">{t(reasonKey)}</span>
                <button
                  type="button"
                  onClick={() => markReviewed(idx)}
                  className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-amber-500/40 hover:bg-amber-500/20"
                >
                  {t('reviewAcknowledge')}
                </button>
              </div>
            )}
            {/* Row 1: Stock item match */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0" style={{ pointerEvents: isSkipped ? 'none' : undefined }} aria-disabled={isSkipped}>
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
              {isSkipped ? (
                <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap self-end mb-1 bg-fg-tertiary/10 text-fg-secondary">
                  {t('skipped')}
                </span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap self-end mb-1 ${isExisting ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  {isExisting ? t('existing') : t('new')}
                </span>
              )}
              <button
                type="button"
                onClick={() => updateItem(idx, { skipped: !isSkipped })}
                className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap self-end mb-1 border border-[var(--divider)] hover:bg-[var(--surface)] text-fg-secondary"
                style={{ opacity: 1 }}
              >
                {isSkipped ? t('unskip') : t('skip')}
              </button>
            </div>

            {/* Original name (supplier language) */}
            {item.original_name && item.original_name !== item.name && (
              <p className="text-xs text-fg-secondary" dir="auto" style={{ textDecoration: isSkipped ? 'line-through' : undefined }}>
                <span className="text-fg-tertiary">{t('originalName')}:</span> {item.original_name}
              </p>
            )}

            {/* Row 2: Name + Category (new items only) */}
            {!isExisting && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                  <input className="input w-full py-1.5 text-sm" value={item.name}
                    disabled={isSkipped}
                    onChange={(e) => updateItem(idx, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('category')}</label>
                  <select className="input w-full py-1.5 text-sm" value={item.category}
                    disabled={isSkipped}
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

            {/* Shared quantity / packaging / price form.
                Reads from persisted per-line formStates so mode + packaging
                fields stick across renders (e.g. empty Advanced mode). */}
            <div style={{ pointerEvents: isSkipped ? 'none' : undefined }} aria-disabled={isSkipped}>
              <StockQuantityForm
                value={formStates[idx] ?? lineToStockInput(item)}
                onChange={(v) => updateFormState(idx, v)}
                vatRate={vatRate}
                compact
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
