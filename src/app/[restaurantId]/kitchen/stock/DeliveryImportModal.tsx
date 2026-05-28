'use client';

import { useState, useEffect, useRef } from 'react';
import {
  importDeliveryStream, importDeliveryVoice, confirmDelivery, listSuppliers, getRestaurantSettings,
  getImportDraft, createImportDraft, deleteImportDraft, chatDeliveryEdit,
  DeliveryExtraction, ConfirmDeliveryItemInput, StockItem, Supplier, StockUnit,
  DeliveryStreamDone, ChatItemSnapshot, ChatTurn, ChatPatch,
} from '@/lib/api';

import { SparklesIcon, FileTextIcon, SendHorizonalIcon, MicIcon, ScanIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import SearchableSelect from '@/components/SearchableSelect';
import { FoodySpinner } from '@/components/FoodySpinner';
import VoiceRecorder from '@/components/VoiceRecorder';
import StockQuantityForm, {
  StockInput, BaseUnit, PackagingUnit, deriveTotals,
} from '@/components/stock/StockQuantityForm';

// Maps the AI's canonical English category labels (from the extraction prompt)
// to i18n keys, so we can render and persist them in the user's locale rather
// than forcing English category names into a French/Hebrew admin.
const AI_CATEGORY_KEYS: Record<string, string> = {
  'meat':       'catMeat',
  'dairy':      'catDairy',
  'produce':    'catProduce',
  'dry goods':  'catDryGoods',
  'beverages':  'catBeverages',
  'frozen':     'catFrozen',
  'oils':       'catOils',
  'spices':     'catSpices',
  'cleaning':   'catCleaning',
  'other':      'catOther',
};

function localizeAiCategory(raw: string, t: (key: string) => string): string {
  if (!raw) return '';
  const key = AI_CATEGORY_KEYS[raw.trim().toLowerCase()];
  return key ? t(key) : raw;
}

const PACKAGING_UNITS: Set<string> = new Set([
  'carton', 'pack', 'box', 'bag', 'bottle',
  'can', 'jar', 'sachet', 'tub', 'brick', 'packet',
  'crate', 'sack', 'case', 'pot', 'jug',
  'plaquette', 'tray',
]);

function coercePackagingUnit(value: string | undefined, fallback: PackagingUnit): PackagingUnit {
  return value && PACKAGING_UNITS.has(value) ? (value as PackagingUnit) : fallback;
}

const BASE_SET: Set<string> = new Set(['g', 'kg', 'ml', 'l', 'unit']);
// Weight/volume base units only — used to defensively prefer item.unit_size_unit
// over item.unit when the extracted item gives a real weight/volume for the
// inner content (e.g. "240 g") but the top-level unit field was emitted as
// "unit" — a common AI mistake the prompt cannot fully prevent.
const WEIGHT_VOLUME_UNITS: Set<string> = new Set(['g', 'kg', 'ml', 'l']);

/** Map the AI-extracted delivery line into our union.
 *  Strategy: if pack/units-per-pack/unit-size suggest multi-level packaging,
 *  produce packaged-nested. If only a single packaging level is present,
 *  packaged-direct. Otherwise fall back to simple. */
function lineToStockInput(item: ConfirmDeliveryItemInput): StockInput {
  const packs = item.pack_count ?? 0;
  const upp = item.units_per_pack ?? 0;
  const us = item.unit_size ?? 0;
  // Effective base unit for the CONTENT. Prefer item.unit_size_unit when it
  // declares a real weight/volume — that field describes the size of the
  // inner unit directly and is more reliable than item.unit, which the AI
  // sometimes defaults to "unit" even when a weight ("240 grammes") was
  // clearly given. Falls back to item.unit otherwise.
  const usu = (item.unit_size_unit ?? '').toLowerCase();
  const rawUnit = (item.unit ?? '').toLowerCase();
  const unit = (WEIGHT_VOLUME_UNITS.has(usu) ? usu : (rawUnit || 'kg')) as StockUnit;
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
  // S3 URL of the scanned bill once it's been persisted (via draft upload).
  // Populated when resuming a draft; populated lazily on confirm for fresh
  // imports so the resulting Approvisionnement keeps a reference to the bill.
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('');
  const [reviewTab, setReviewTab] = useState<'document' | 'items'>('items');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [vatRate, setVatRate] = useState(18);
  // Pick up the HT/TTC display preference from the shared localStorage key so
  // the delivery review page entry mode matches the stock table.
  const [vatDisplayMode, setVatDisplayMode] = useState<'ex' | 'inc'>('inc');
  useEffect(() => {
    try {
      const v = localStorage.getItem('foody.stock.vatDisplay');
      if (v === 'ex' || v === 'inc') setVatDisplayMode(v);
    } catch { /* ignore */ }
  }, []);
  const [currentDraftId, setCurrentDraftId] = useState<number | undefined>(draftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const [importMode, setImportMode] = useState<'scan' | 'voice'>('scan');
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState('');
  // Last submitted blob — kept so the Retry button on the error banner can
  // re-send the same audio without forcing the user to re-record.
  const lastVoiceRef = useRef<{ blob: Blob; mediaType: string } | null>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  // Whisper transcript from the most recent voice import — rendered in the
  // left pane so the user can see exactly what the AI heard before reviewing
  // the extracted items. Cleared between scans.
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

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
          setDocumentUrl(detail.draft.document_url);
          setDocumentType(detail.draft.document_type || '');
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
    setStreamError('');
    setEditedItems([]);
    setFormStates([]);
    setReviewedItems(new Set());
    setExtraction({ supplier_name: '', delivery_date: '', items: [], raw_notes: '' });
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewType(file.type);
    setStep('review');
    setStreaming(true);
    setSummaryDismissed(false);
    setVoiceTranscript('');

    const ac = new AbortController();
    abortRef.current = ac;

    const appendItem = (it: DeliveryExtraction['items'][number]) => {
      const matched = it.matched_item_id ? stockItems.find((s) => s.id === it.matched_item_id) : null;
      const line: ConfirmDeliveryItemInput = {
        stock_item_id: it.matched_item_id ?? undefined,
        name: it.translated_name || it.original_name,
        original_name: it.original_name,
        sku: it.sku || '',
        quantity: it.quantity,
        unit: it.unit,
        // The AI emits a fixed English enum for category (Meat / Dairy / …).
        // Translate to the active locale before storing so the admin doesn't
        // show English labels in a French/Hebrew UI, and so the value matches
        // what the user would type if they created a category manually.
        category: localizeAiCategory(it.category, t),
        cost_per_unit: it.estimated_cost,
        pack_count: it.pack_count ?? 0,
        units_per_pack: it.units_per_pack ?? 0,
        price_per_pack: it.price_per_pack || 0,
        total_price: it.total_price || (it.estimated_cost * it.quantity),
        unit_size: it.unit_size || 0,
        unit_size_unit: it.unit_size_unit || '',
        container_type: it.container_type || '',
        unit_type: it.unit_type || '',
        vat_rate_override: matched?.vat_rate_override ?? null,
        row_index: it.row_index,
        needs_review: it.needs_review,
        review_reason: it.review_reason,
      };
      setEditedItems((prev) => [...prev, line]);
      setFormStates((prev) => [...prev, lineToStockInput(line)]);
    };

    const applyLateFlags = (done: DeliveryStreamDone) => {
      const flags = done.late_flags;
      if (flags) {
        setEditedItems((prev) => prev.map((item, idx) => {
          let next = item;
          if (flags.duplicate_row_indexes?.includes(idx)) {
            next = {
              ...next,
              needs_review: true,
              review_reason: next.review_reason || 'duplicate_row',
            };
          }
          if (flags.deduped_indexes?.includes(idx)) {
            next = { ...next, skipped: true };
          }
          return next;
        }));
      }
      setExtraction((prev) => prev ? { ...prev, raw_notes: done.raw_notes ?? prev.raw_notes } : prev);
    };

    try {
      await importDeliveryStream(rid, file,
        { lang: locale, supplierId: selectedSupplierId > 0 ? selectedSupplierId : undefined },
        {
          onMeta: (m) => setExtraction((prev) => prev
            ? { ...prev, supplier_name: m.supplier_name ?? prev.supplier_name, delivery_date: m.delivery_date ?? prev.delivery_date }
            : prev),
          onItem: appendItem,
          onProgress: () => {},
          onDone: (done) => { applyLateFlags(done); setStreaming(false); },
          onError: ({ message }) => { setStreamError(message); setStreaming(false); },
        },
        ac.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setStreamError((err as Error).message);
      }
      setStreaming(false);
    }
  };

  // ── Voice import: record → transcribe → review ────────────────────────
  // Reuses the same streaming-UI state as the bill-scan path: while the
  // backend transcribes + parses we flip `streaming=true` so the user sees
  // the FoodySpinner banner with cycling verbs. When the extraction arrives,
  // we batch-insert every item just like a list arriving at the end.
  const handleVoiceSubmit = async (audioBlob: Blob, mediaType: string) => {
    lastVoiceRef.current = { blob: audioBlob, mediaType };
    setStreamError('');
    setEditedItems([]);
    setFormStates([]);
    setReviewedItems(new Set());
    setExtraction({ supplier_name: '', delivery_date: '', items: [], raw_notes: '' });
    setPreviewUrl(null);
    setPreviewType('');
    setReviewTab('items');
    setStep('review');
    setStreaming(true);
    setSummaryDismissed(false);
    setVoiceTranscript('');

    try {
      const { extraction: result, transcript } = await importDeliveryVoice(
        rid,
        audioBlob,
        mediaType,
        locale,
        selectedSupplierId > 0 ? selectedSupplierId : undefined,
      );
      setVoiceTranscript(transcript);
      setExtraction(result);
      const newItems: ConfirmDeliveryItemInput[] = result.items.map((i) => {
        const matched = i.matched_item_id ? stockItems.find((s) => s.id === i.matched_item_id) : null;
        return {
          stock_item_id: i.matched_item_id ?? undefined,
          name: i.translated_name || i.original_name,
          original_name: i.original_name,
          sku: i.sku || '',
          quantity: i.quantity,
          unit: i.unit,
          category: localizeAiCategory(i.category, t),
          cost_per_unit: i.estimated_cost,
          pack_count: i.pack_count ?? 0,
          units_per_pack: i.units_per_pack ?? 0,
          price_per_pack: i.price_per_pack || 0,
          total_price: i.total_price || (i.estimated_cost * i.quantity),
          unit_size: i.unit_size || 0,
          unit_size_unit: i.unit_size_unit || '',
          container_type: i.container_type || '',
          unit_type: i.unit_type || '',
          vat_rate_override: matched?.vat_rate_override ?? null,
          row_index: i.row_index,
          needs_review: i.needs_review,
          review_reason: i.review_reason,
        };
      });
      setEditedItems(newItems);
      setFormStates(newItems.map(lineToStockInput));
    } catch (err) {
      setStreamError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    lastVoiceRef.current = null;
    setStreaming(false);
    setEditedItems([]);
    setFormStates([]);
    setStep('upload');
  };

  // ── Chat: targeted AI edits over the current items ─────────────────────
  // Builds a slim snapshot of the current items, sends the user's message
  // + history to the chat endpoint, and applies the returned patches to
  // editedItems/formStates in place.
  const applyChatPatches = (patches: ChatPatch[]) => {
    if (patches.length === 0) return;
    setEditedItems((prev) => {
      const next = prev.slice();
      const formNext = formStates.slice();
      for (const p of patches) {
        if (p.item_index < 0 || p.item_index >= next.length) continue;
        const cur = next[p.item_index];
        const patched: ConfirmDeliveryItemInput = {
          ...cur,
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.category !== undefined ? { category: p.category } : {}),
          ...(p.quantity !== undefined ? { quantity: p.quantity } : {}),
          ...(p.total_price !== undefined ? { total_price: p.total_price } : {}),
          ...(p.cost_per_unit !== undefined ? { cost_per_unit: p.cost_per_unit } : {}),
          ...(p.vat_rate_override !== undefined ? { vat_rate_override: p.vat_rate_override } : {}),
          ...(p.skipped !== undefined ? { skipped: p.skipped } : {}),
        };
        // If price or quantity changed, total_price stays as patched (server
        // already converted units / VAT). Recompute cost_per_unit if the
        // model didn't give us one but moved the total or quantity.
        if (p.cost_per_unit === undefined && (p.total_price !== undefined || p.quantity !== undefined)) {
          const q = patched.quantity || cur.quantity;
          patched.cost_per_unit = q > 0 ? (patched.total_price ?? 0) / q : 0;
        }
        next[p.item_index] = patched;
        formNext[p.item_index] = lineToStockInput(patched);
      }
      setFormStates(formNext);
      return next;
    });
    // Treat AI edits as acknowledged for any flagged rows we touched.
    setReviewedItems((prev) => {
      const next = new Set(prev);
      patches.forEach((p) => next.add(p.item_index));
      return next;
    });
  };

  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatLoading(true);
    const nextHistory: ChatTurn[] = [...chatHistory, { role: 'user', content: message }];
    setChatHistory(nextHistory);
    setChatInput('');

    const snapshot: ChatItemSnapshot[] = editedItems.map((i, index) => ({
      index,
      name: i.name,
      original_name: i.original_name,
      category: i.category,
      unit: i.unit,
      quantity: i.quantity,
      cost_per_unit: i.cost_per_unit,
      total_price: i.total_price ?? 0,
      pack_count: i.pack_count,
      units_per_pack: i.units_per_pack,
      unit_size: i.unit_size,
      unit_size_unit: i.unit_size_unit,
      container_type: i.container_type,
      unit_type: i.unit_type,
      vat_rate_override: i.vat_rate_override,
      skipped: i.skipped,
    }));

    try {
      const res = await chatDeliveryEdit(rid, {
        items: snapshot,
        history: chatHistory,
        message,
        vat_display_mode: vatDisplayMode,
        default_vat_rate: vatRate,
        lang: locale,
      });
      applyChatPatches(res.patches);
      setChatHistory([
        ...nextHistory,
        { role: 'assistant', content: res.assistant_message || (res.patches.length > 0 ? t('aiPatchApplied') : t('aiNoChange')) },
      ]);
    } catch (err) {
      setChatHistory([
        ...nextHistory,
        { role: 'assistant', content: t('aiErrorGeneric') + ' (' + (err as Error).message + ')' },
      ]);
    } finally {
      setChatLoading(false);
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

      // Ensure the scanned bill is on S3 before confirming, so the
      // Approvisionnement page can render it later. Resumed drafts already
      // have an S3 URL; fresh imports upload via a transient draft that we
      // delete right after confirm.
      let draftIdToDelete = currentDraftId;
      let docUrl = documentUrl;
      let docType = documentType;
      if (!docUrl && file && extraction) {
        try {
          const draft = await createImportDraft(rid, file, {
            supplier_id: selectedSupplierId > 0 ? selectedSupplierId : undefined,
            supplier_name: supplierName,
            extraction,
            edited_items: editedItems,
          });
          draftIdToDelete = draft.id;
          docUrl = draft.document_url || '';
          docType = draft.document_type || '';
        } catch {
          // Non-fatal: confirm without a document reference.
        }
      }

      await confirmDelivery(rid, {
        supplier_name: supplierName,
        document_url: docUrl,
        document_type: docType,
        items: itemsToImport,
      });
      if (draftIdToDelete) {
        deleteImportDraft(rid, draftIdToDelete).catch(() => {});
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
            {/* Mode picker — Scan vs Voice. Voice is faster for hands-busy
                kitchens; scan is more accurate when a printed bill is on hand. */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <button
                type="button"
                onClick={() => setImportMode('scan')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${importMode === 'scan' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary hover:text-fg-primary'}`}
              >
                <ScanIcon className="w-4 h-4" />
                {t('importModeScan')}
              </button>
              <button
                type="button"
                onClick={() => setImportMode('voice')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${importMode === 'voice' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary hover:text-fg-primary'}`}
              >
                <MicIcon className="w-4 h-4" />
                {t('importModeVoice')}
              </button>
            </div>

            {importMode === 'scan' && (
              <p className="text-sm text-fg-secondary">{t('aiDeliveryDesc')}</p>
            )}

            {/* Supplier selector — shared across modes */}
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

            {importMode === 'scan' && (
              <>
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
                    <FileTextIcon className="w-5 h-5" />
                    {file.name}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
                  <button
                    onClick={handleUpload}
                    disabled={!file || loading || (!selectedSupplierId && !newSupplierName.trim()) || (selectedSupplierId === -1 && !newSupplierName.trim())}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    {loading && <FoodySpinner size={14} className="opacity-90" />}
                    {loading ? t('analyzing') : t('uploadAndAnalyze')}
                  </button>
                </div>
              </>
            )}

            {importMode === 'voice' && (
              <VoiceRecorder
                t={t}
                disabled={!selectedSupplierId && !newSupplierName.trim()}
                onSubmit={handleVoiceSubmit}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Review Step (full-screen split) ──────────────────────────────────────

  const isRtl = direction === 'rtl';

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
      {(() => {
        const displaySupplier = selectedSupplierId === -1
          ? newSupplierName
          : selectedSupplierId > 0
            ? suppliers.find((s) => s.id === selectedSupplierId)?.name
            : extraction?.supplier_name;
        const skipped = editedItems.filter((i) => i.skipped).length;
        const active = editedItems.length - skipped;
        const skippedSuffix = skipped > 0
          ? ` · ${skipped} ${t('skipped').toLowerCase()}`
          : '';
        return (
          <>
            {/* ─ Header ─ Compact on mobile (X · title · count), inline on lg+. */}
            <div
              className="flex items-center justify-between gap-3 px-3 lg:px-5 py-3 border-b border-[var(--divider)]"
              style={{ background: 'var(--surface-subtle)' }}
            >
              <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
                {/* Mobile-only close X (lg+ keeps it on the right of the action group) */}
                <button
                  onClick={onClose}
                  aria-label={t('close')}
                  className="lg:hidden text-fg-secondary hover:text-fg-primary text-2xl leading-none px-1 shrink-0"
                >
                  &times;
                </button>
                <SparklesIcon className="w-5 h-5 text-brand-500 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-fg-primary truncate">
                    {t('aiDeliveryImport')}
                  </h3>
                  {/* Mobile: supplier + count stacked under the title */}
                  <div className="lg:hidden flex items-center gap-2 text-xs text-fg-secondary mt-0.5 min-w-0">
                    {displaySupplier && (
                      <span className="truncate min-w-0">{displaySupplier}</span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium shrink-0">
                      {active} {t('items')}{skippedSuffix}
                    </span>
                  </div>
                </div>
                {/* Desktop: supplier + count inline next to the title */}
                {displaySupplier && (
                  <span className="hidden lg:inline text-sm text-fg-secondary">
                    — {displaySupplier}
                  </span>
                )}
                <span className="hidden lg:inline-flex text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
                  {active} {t('items')}{skippedSuffix}
                </span>
              </div>
              {/* Desktop action group — buttons live in a sticky footer on mobile (see bottom of modal). */}
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { if (streaming) { cancelStream(); return; } setStep('upload'); }}
                  className="btn-secondary text-sm"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={savingDraft || streaming}
                  title={streaming ? t('waitingForScan') : undefined}
                  className="btn-secondary text-sm"
                >
                  {savingDraft ? t('saving') : t('saveDraft')}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading || unreviewedFlaggedCount > 0 || streaming}
                  title={
                    streaming ? t('waitingForScan') :
                    unreviewedFlaggedCount > 0 ? t('reviewBlockedBanner').replace('{n}', String(unreviewedFlaggedCount)) :
                    undefined
                  }
                  className="btn-primary text-sm"
                >
                  {loading ? t('confirming') : t('confirmImport')}
                </button>
                <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none px-2">&times;</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ─ Mobile tabs (below lg) ─ */}
      <div className="flex lg:hidden border-b border-[var(--divider)]">
        <button
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${reviewTab === 'document' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-fg-secondary'}`}
          onClick={() => setReviewTab('document')}
        >
          {importMode === 'voice' ? t('voiceTranscript') : t('originalDocument')}
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
        {/* ─ Document / Transcript pane (left on LTR, right on RTL) ─
            Same slot serves both modes: bill scan shows the original
            image/PDF; voice import shows the Whisper transcript so the
            user can verify what the AI heard. */}
        <div className={`w-1/2 border-[var(--divider)] overflow-auto p-4 hidden lg:flex flex-col ${isRtl ? 'border-l' : 'border-r'}`}>
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-3">
            {importMode === 'voice' ? t('voiceTranscript') : t('originalDocument')}
          </h4>
          <div className="flex-1 rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
            {importMode === 'voice' ? (
              voiceTranscript ? (
                <p className="p-4 text-sm text-fg-primary whitespace-pre-wrap leading-relaxed" dir="auto">
                  {voiceTranscript}
                </p>
              ) : (
                <p className="p-4 text-sm text-fg-tertiary italic">
                  {t('voiceTranscriptPending')}
                </p>
              )
            ) : (
              <>
                {previewUrl && previewType.startsWith('image/') && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
                )}
                {previewUrl && previewType === 'application/pdf' && (
                  <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
                )}
              </>
            )}
          </div>
        </div>

        {/* ─ Mobile document / transcript view ─ */}
        {reviewTab === 'document' && (
          <div className="flex-1 overflow-auto p-4 lg:hidden">
            <div className="rounded-lg overflow-auto border border-[var(--divider)]" style={{ background: 'var(--surface-subtle)' }}>
              {importMode === 'voice' ? (
                voiceTranscript ? (
                  <p className="p-4 text-sm text-fg-primary whitespace-pre-wrap leading-relaxed" dir="auto">
                    {voiceTranscript}
                  </p>
                ) : (
                  <p className="p-4 text-sm text-fg-tertiary italic">
                    {t('voiceTranscriptPending')}
                  </p>
                )
              ) : (
                <>
                  {previewUrl && previewType.startsWith('image/') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Delivery document" className="w-full h-auto" />
                  )}
                  {previewUrl && previewType === 'application/pdf' && (
                    <iframe src={previewUrl} className="w-full h-full min-h-[70vh]" title="Delivery document" />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ─ Items editor (right on LTR, left on RTL) ─ */}
        <div className={`w-1/2 overflow-y-auto p-4 hidden lg:block`}>
          <StreamingHeader
            streaming={streaming}
            count={editedItems.length}
            error={streamError}
            errorDetail={streamError}
            onCancel={cancelStream}
            onRetry={() => {
              if (lastVoiceRef.current) {
                handleVoiceSubmit(lastVoiceRef.current.blob, lastVoiceRef.current.mediaType);
              } else {
                handleUpload();
              }
            }}
            t={t}
          />
          {/* AI summary bubble — temporarily hidden, may revisit.
          {!streaming && !streamError && (
            <AiSummaryBubble
              items={editedItems}
              supplier={
                (selectedSupplierId === -1
                  ? newSupplierName
                  : selectedSupplierId > 0
                    ? suppliers.find((s) => s.id === selectedSupplierId)?.name
                    : extraction?.supplier_name) ?? ''
              }
              vatRate={vatRate}
              dismissed={summaryDismissed}
              onDismiss={() => setSummaryDismissed(true)}
              t={t}
            />
          )}
          */}
          <ItemsList
            editedItems={editedItems}
            formStates={formStates}
            stockItems={stockItems}
            stockOptions={stockOptions}
            existingCategories={existingCategories}
            updateItem={updateItem}
            updateFormState={updateFormState}
            vatRate={vatRate}
            vatDisplayMode={vatDisplayMode}
            t={t}
            reviewedItems={reviewedItems}
            markReviewed={markReviewed}
            streaming={streaming}
          />
          {/* AI chat panel — temporarily hidden, may revisit.
          {!streaming && !streamError && editedItems.length > 0 && (
            <div className="mt-4">
              <ChatPanel
                open={chatOpen}
                onToggle={() => setChatOpen((o) => !o)}
                history={chatHistory}
                input={chatInput}
                loading={chatLoading}
                onInput={setChatInput}
                onSend={sendChat}
                t={t}
              />
            </div>
          )}
          */}
        </div>

        {/* ─ Mobile items view ─ */}
        {reviewTab === 'items' && (
          <div className="flex-1 overflow-y-auto p-4 lg:hidden">
            <StreamingHeader
              streaming={streaming}
              count={editedItems.length}
              error={streamError}
              errorDetail={streamError}
              onCancel={cancelStream}
              onRetry={() => {
                if (lastVoiceRef.current) {
                  handleVoiceSubmit(lastVoiceRef.current.blob, lastVoiceRef.current.mediaType);
                } else {
                  handleUpload();
                }
              }}
              t={t}
            />
            {/* AI summary bubble — temporarily hidden, may revisit.
            {!streaming && !streamError && (
              <AiSummaryBubble
                items={editedItems}
                supplier={
                  (selectedSupplierId === -1
                    ? newSupplierName
                    : selectedSupplierId > 0
                      ? suppliers.find((s) => s.id === selectedSupplierId)?.name
                      : extraction?.supplier_name) ?? ''
                }
                vatRate={vatRate}
                dismissed={summaryDismissed}
                onDismiss={() => setSummaryDismissed(true)}
                t={t}
              />
            )}
            */}
            <ItemsList
              editedItems={editedItems}
              formStates={formStates}
              stockItems={stockItems}
              stockOptions={stockOptions}
              existingCategories={existingCategories}
              updateItem={updateItem}
              updateFormState={updateFormState}
              vatRate={vatRate}
              vatDisplayMode={vatDisplayMode}
              t={t}
              reviewedItems={reviewedItems}
              markReviewed={markReviewed}
              streaming={streaming}
            />
            {/* AI chat panel — temporarily hidden, may revisit.
            {!streaming && !streamError && editedItems.length > 0 && (
              <div className="mt-4">
                <ChatPanel
                  open={chatOpen}
                  onToggle={() => setChatOpen((o) => !o)}
                  history={chatHistory}
                  input={chatInput}
                  loading={chatLoading}
                  onInput={setChatInput}
                  onSend={sendChat}
                  t={t}
                />
              </div>
            )}
            */}
          </div>
        )}
      </div>

      {/* ─ Mobile sticky action bar ─
          The desktop layout puts Back / Save draft / Confirm in the header.
          On phones those got clipped off-screen, so they live in a
          full-width footer bar instead. The Back link doubles as a small
          tertiary action on the left. */}
      <div
        className="lg:hidden flex items-center gap-2 px-3 py-3 border-t border-[var(--divider)] shrink-0"
        style={{ background: 'var(--surface-subtle)' }}
      >
        <button
          onClick={() => { if (streaming) { cancelStream(); return; } setStep('upload'); }}
          className="text-fg-secondary hover:text-fg-primary text-sm px-2 shrink-0"
        >
          {t('back')}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={savingDraft || streaming}
          title={streaming ? t('waitingForScan') : undefined}
          className="btn-secondary text-sm flex-1 min-w-0"
        >
          {savingDraft ? t('saving') : t('saveDraft')}
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading || unreviewedFlaggedCount > 0 || streaming}
          title={
            streaming ? t('waitingForScan') :
            unreviewedFlaggedCount > 0 ? t('reviewBlockedBanner').replace('{n}', String(unreviewedFlaggedCount)) :
            undefined
          }
          className="btn-primary text-sm flex-1 min-w-0"
        >
          {loading ? t('confirming') : t('confirmImport')}
        </button>
      </div>
    </div>
  );
}

// ─── Items List (shared between desktop and mobile) ───────────────────────

// ItemSkeleton mirrors the shape of an item card (title + subtitle, metadata
// line, ARTICLE section, quantity grid). The `delay` staggers the pulse
// animation across multiple placeholders so they don't all flash in lock-step,
// which reads as a more natural "AI is thinking" feel.
function ItemSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="p-4 rounded-lg space-y-4 animate-pulse"
      style={{ background: 'var(--surface-subtle)', animationDelay: `${delay}ms` }}
    >
      {/* Header: title + subtitle + status chip */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-5 w-3/4 rounded bg-fg-tertiary/15" />
            <div className="h-3.5 w-1/2 rounded bg-fg-tertiary/15" />
          </div>
          <div className="h-5 w-14 rounded-full bg-fg-tertiary/15 shrink-0" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-14 rounded bg-fg-tertiary/15" />
          <div className="h-3 flex-1 rounded bg-fg-tertiary/15" />
          <div className="h-5 w-14 rounded-full bg-fg-tertiary/15" />
        </div>
      </div>
      {/* Article section */}
      <div className="space-y-3 border-t border-[var(--divider)] pt-3">
        <div className="h-2.5 w-12 rounded bg-fg-tertiary/15" />
        <div className="h-9 w-full rounded bg-fg-tertiary/15" />
      </div>
      {/* Quantity section */}
      <div className="border-t border-[var(--divider)] pt-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="h-9 rounded bg-fg-tertiary/15" />
          <div className="h-9 rounded bg-fg-tertiary/15" />
          <div className="h-9 rounded bg-fg-tertiary/15" />
        </div>
      </div>
    </div>
  );
}

// AiSummaryBubble is a one-shot, computed-locally trust-builder shown above
// the items list once the stream completes. It re-reads from the items
// themselves so it stays accurate as the user edits.
function AiSummaryBubble({
  items, supplier, vatRate, dismissed, onDismiss, t,
}: {
  items: ConfirmDeliveryItemInput[];
  supplier: string;
  vatRate: number;
  dismissed: boolean;
  onDismiss: () => void;
  t: (key: string) => string;
}) {
  if (dismissed) return null;
  const active = items.filter((i) => !i.skipped);
  if (active.length === 0) return null;

  const totalHt = active.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const totalTtc = active.reduce((s, i) => {
    const rate = i.vat_rate_override ?? vatRate;
    return s + (i.total_price ?? 0) * (1 + rate / 100);
  }, 0);
  const fmt = (n: number) => n.toFixed(2);

  const top = [...active]
    .sort((a, b) => (b.total_price ?? 0) - (a.total_price ?? 0))
    .slice(0, 3)
    .map((i) => `${i.name} (${fmt(i.total_price ?? 0)} ₪)`)
    .join(', ');

  const readKey = supplier ? 'aiSummaryRead' : 'aiSummaryReadNoSupplier';
  const readMsg = t(readKey)
    .replace('{n}', String(active.length))
    .replace('{supplier}', supplier)
    .replace('{totalTtc}', fmt(totalTtc))
    .replace('{totalHt}', fmt(totalHt));

  return (
    <div className="mb-3 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 flex items-start gap-3">
      <SparklesIcon className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-fg-primary">{readMsg}</p>
        {active.length >= 2 && (
          <p className="text-xs text-fg-secondary">
            {t('aiSummaryTopItems').replace('{items}', top)}
          </p>
        )}
        <p className="text-xs text-fg-tertiary">{t('aiSummaryCheckTotal')}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="dismiss"
        className="shrink-0 text-fg-tertiary hover:text-fg-primary text-lg leading-none px-1"
      >
        &times;
      </button>
    </div>
  );
}

// ChatPanel is the interactive natural-language editor docked below the
// items list. Collapsed by default to a single trigger line; expands into
// a transcript + input. Stateless across re-renders — its conversation
// history lives on the parent component.
function ChatPanel({
  open, onToggle, history, input, loading, onInput, onSend, t,
}: {
  open: boolean;
  onToggle: () => void;
  history: ChatTurn[];
  input: string;
  loading: boolean;
  onInput: (v: string) => void;
  onSend: () => void;
  t: (key: string) => string;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 rounded-lg border border-[var(--divider)] bg-[var(--surface-subtle)] hover:bg-[var(--surface)] transition-colors text-left"
      >
        <SparklesIcon className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-sm text-fg-secondary flex-1 truncate">{t('askAi')}</span>
        <span className="text-xs text-fg-tertiary shrink-0">▴</span>
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--divider)] bg-[var(--surface-subtle)] overflow-hidden flex flex-col" style={{ maxHeight: '40vh' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--divider)]">
        <SparklesIcon className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-sm font-medium text-fg-primary flex-1">{t('aiAssistant')}</span>
        <button onClick={onToggle} className="text-xs text-fg-tertiary hover:text-fg-primary px-1">▾</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[8rem]">
        {history.length === 0 && (
          <p className="text-xs text-fg-tertiary italic">{t('askAiPlaceholder')}</p>
        )}
        {history.map((turn, i) => (
          <div
            key={i}
            className={`text-sm leading-snug ${turn.role === 'user' ? 'text-fg-primary' : 'text-fg-secondary'}`}
          >
            <span className={`text-[10px] uppercase tracking-wider mr-2 ${turn.role === 'user' ? 'text-fg-tertiary' : 'text-brand-500'}`}>
              {turn.role === 'user' ? '·' : '✨'}
            </span>
            {turn.content}
          </div>
        ))}
        {loading && (
          <div className="text-sm text-fg-tertiary italic flex items-center gap-2">
            <span className="text-brand-500">✨</span>
            {t('aiThinking')}
            <span className="inline-flex gap-1 items-end">
              <span className="w-1 h-1 rounded-full bg-fg-tertiary animate-bounce" style={{ animationDelay: '-300ms' }} />
              <span className="w-1 h-1 rounded-full bg-fg-tertiary animate-bounce" style={{ animationDelay: '-150ms' }} />
              <span className="w-1 h-1 rounded-full bg-fg-tertiary animate-bounce" />
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 p-2 border-t border-[var(--divider)]">
        <input
          type="text"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t('askAiPlaceholder')}
          disabled={loading}
          className="flex-1 bg-transparent text-sm px-2 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 rounded"
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          aria-label={t('aiSend')}
          className="shrink-0 p-1.5 rounded-md text-brand-500 hover:bg-brand-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <SendHorizonalIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StreamingHeader({
  streaming, count, error, errorDetail, onCancel, onRetry, t,
}: {
  streaming: boolean;
  count: number;
  error: string;
  /** Verbatim upstream error message for the user to copy/screenshot. */
  errorDetail?: string;
  onCancel: () => void;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  // Cycle a list of status verbs while streaming so the banner doesn't
  // feel frozen. Verbs come from the locale's aiStatusVerbs key (CSV).
  const verbs = t('aiStatusVerbs').split(',').map((s) => s.trim()).filter(Boolean);
  const [verbIndex, setVerbIndex] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    setVerbIndex(0);
    const id = setInterval(() => {
      setVerbIndex((i) => (i + 1) % verbs.length);
    }, 1400);
    return () => clearInterval(id);
  }, [streaming, verbs.length]);

  if (streaming) {
    const verb = verbs[verbIndex] || '';
    const msg = t('scanInProgress')
      .replace('{verb}', verb)
      .replace('{n}', String(count));
    return (
      <div className="mb-3 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 flex items-center gap-3">
        <FoodySpinner size={20} className="shrink-0" />
        <span
          key={verbIndex}
          className="text-sm text-fg-primary flex-1 animate-in fade-in slide-in-from-bottom-0.5 duration-300"
        >
          {msg}
        </span>
        <button onClick={onCancel} className="text-xs text-fg-secondary hover:text-fg-primary px-2 py-1 rounded border border-[var(--divider)] shrink-0">
          {t('cancelScan')}
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-amber-600">
            {t('scanInterrupted').replace('{n}', String(count))}
          </p>
          {errorDetail && (
            <p className="text-xs text-amber-600/80 break-words font-mono">
              {errorDetail}
            </p>
          )}
        </div>
        <button onClick={onRetry} className="shrink-0 text-xs px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/20 text-amber-600">
          {t('retry')}
        </button>
      </div>
    );
  }
  return null;
}

function ItemsList({
  editedItems, formStates, stockItems, stockOptions, existingCategories, updateItem, updateFormState, vatRate, vatDisplayMode, t, reviewedItems, markReviewed, streaming,
}: {
  editedItems: ConfirmDeliveryItemInput[];
  formStates: StockInput[];
  stockItems: StockItem[];
  stockOptions: { value: string; label: string; sublabel?: string }[];
  existingCategories: string[];
  updateItem: (idx: number, patch: Partial<ConfirmDeliveryItemInput>) => void;
  updateFormState: (idx: number, v: StockInput) => void;
  vatRate: number;
  vatDisplayMode: 'ex' | 'inc';
  t: (key: string) => string;
  reviewedItems: Set<number>;
  markReviewed: (idx: number) => void;
  streaming: boolean;
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
        const statusChip = isSkipped
          ? { label: t('skipped'), cls: 'bg-fg-tertiary/10 text-fg-secondary' }
          : isExisting
            ? { label: t('existing'), cls: 'bg-green-500/10 text-green-500' }
            : { label: t('new'), cls: 'bg-amber-500/10 text-amber-500' };
        return (
          <div
            key={idx}
            className={`p-4 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-1 duration-200 ${isFlagged ? 'border-l-4 border-amber-500' : ''}`}
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

            {/* ── Header: identity + status ───────────────────────────── */}
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4
                    className="text-base font-semibold text-fg-primary truncate"
                    dir="auto"
                    style={{ textDecoration: isSkipped ? 'line-through' : undefined }}
                  >
                    {item.name || item.original_name || '—'}
                  </h4>
                  {item.original_name && item.original_name !== item.name && (
                    <p className="text-sm text-fg-secondary truncate">
                      <bdi>{item.original_name}</bdi>
                    </p>
                  )}
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${statusChip.cls}`}>
                  {statusChip.label}
                </span>
              </div>

              {/* Metadata line: line number + editable SKU + skip toggle */}
              <div className="flex items-center gap-3 text-xs text-fg-tertiary">
                {item.row_index && item.row_index > 0 ? (
                  <span className="shrink-0">{t('rowNumber').replace('{n}', String(item.row_index))}</span>
                ) : null}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="shrink-0">{t('sku')}</span>
                  <input
                    className="bg-transparent border-b border-[var(--divider)]/40 hover:border-[var(--divider)] focus:border-brand-500 outline-none text-xs flex-1 min-w-0 px-0.5 py-0.5 text-fg-secondary transition-colors"
                    value={item.sku ?? ''}
                    disabled={isSkipped}
                    onChange={(e) => updateItem(idx, { sku: e.target.value })}
                    placeholder={t('skuHelp')}
                    dir="ltr"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateItem(idx, { skipped: !isSkipped })}
                  className="ml-auto text-xs px-2 py-0.5 rounded-full whitespace-nowrap border border-[var(--divider)] hover:bg-[var(--surface)] text-fg-secondary shrink-0"
                  style={{ pointerEvents: 'auto' }}
                >
                  {isSkipped ? t('unskip') : t('skip')}
                </button>
              </div>
            </div>

            {/* ── Article section: match + name/category ──────────────── */}
            <div
              className="space-y-3 border-t border-[var(--divider)] pt-3"
              style={{ pointerEvents: isSkipped ? 'none' : undefined }}
              aria-disabled={isSkipped}
            >
              <div className="text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">
                {t('articleSection')}
              </div>
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
              {!isExisting && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('name')}</label>
                    <input
                      className="input w-full py-1.5 text-sm"
                      value={item.name}
                      disabled={isSkipped}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-fg-secondary font-medium mb-1 block">{t('category')}</label>
                    <select
                      className="input w-full py-1.5 text-sm"
                      value={item.category}
                      disabled={isSkipped}
                      onChange={(e) => updateItem(idx, { category: e.target.value })}
                    >
                      <option value="">{t('category')}</option>
                      {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      {item.category && !existingCategories.includes(item.category) && (
                        <option value={item.category}>{item.category}</option>
                      )}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* ── Quantity / packaging / price ────────────────────────── */}
            <div
              className="border-t border-[var(--divider)] pt-3"
              style={{ pointerEvents: isSkipped ? 'none' : undefined }}
              aria-disabled={isSkipped}
            >
              <StockQuantityForm
                value={formStates[idx] ?? lineToStockInput(item)}
                onChange={(v) => updateFormState(idx, v)}
                vatRate={vatRate}
                vatRateOverride={item.vat_rate_override ?? null}
                onVatRateChange={(v) => updateItem(idx, { vat_rate_override: v })}
                vatDisplayMode={vatDisplayMode}
                compact
              />
            </div>
          </div>
        );
      })}
      {streaming && (
        <>
          <ItemSkeleton delay={0} />
          <ItemSkeleton delay={200} />
          <ItemSkeleton delay={400} />
        </>
      )}
    </div>
  );
}
