'use client';

import { useMemo, useRef, useState } from 'react';
import { FileTextIcon, UploadIcon, XIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  importStockCsv, importMenuItemsCsv,
  CsvImportStockResult, CsvImportLibraryResult, StockUnit,
} from '@/lib/api';
import { parseColumnarCsv, ParsedCsv, CsvParseError } from '@/lib/csv/columnar';

type Mode = 'stock' | 'library';

type Props = {
  mode: Mode;
  restaurantId: number;
  onClose: () => void;
  onImported: (result: CsvImportStockResult | CsvImportLibraryResult) => void;
  /**
   * Existing categories already in the system (case-insensitive match
   * against parsed headers). For library mode pass ItemCategory.name[];
   * for stock mode pass StockItem.category[] (the free-text values).
   */
  existingCategories: string[];
  /**
   * Existing item keys to detect duplicates in the review screen.
   * For stock mode: `${LOWER(category)}::${LOWER(name)}`
   * For library mode: `${LOWER(categoryName)}::${LOWER(itemName)}`
   */
  existingItemKeys: Set<string>;
};

type SelectionMap = Map<string, boolean>; // rowKey -> checked

const STOCK_UNIT_OPTIONS: StockUnit[] = ['unit', 'g', 'kg', 'ml', 'l'];

function rowKey(category: string, item: string): string {
  return `${category.toLowerCase()}::${item.toLowerCase()}`;
}

export default function CsvImportModal({
  mode, restaurantId, onClose, onImported, existingCategories, existingItemKeys,
}: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<'input' | 'review' | 'submitting'>('input');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [selection, setSelection] = useState<SelectionMap>(new Map());
  const [defaultUnit, setDefaultUnit] = useState<StockUnit>('unit');
  const fileRef = useRef<HTMLInputElement>(null);

  const existingCatSet = useMemo(
    () => new Set(existingCategories.map((c) => c.toLowerCase())),
    [existingCategories]
  );

  const counters = useMemo(() => {
    if (!parsed) return { willCreate: 0, willSkip: 0, newCats: [] as string[] };
    const newCats = parsed.categories
      .map((c) => c.name)
      .filter((n) => !existingCatSet.has(n.toLowerCase()));
    let willCreate = 0;
    let willSkip = 0;
    for (const cat of parsed.categories) {
      for (const item of cat.items) {
        const key = rowKey(cat.name, item);
        const checked = selection.get(key) ?? !existingItemKeys.has(key);
        if (!checked) {
          if (existingItemKeys.has(key)) willSkip++;
          continue;
        }
        willCreate++;
      }
    }
    return { willCreate, willSkip, newCats };
  }, [parsed, existingItemKeys, existingCatSet, selection]);

  function handleFile(file: File) {
    setError('');
    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      setError(t('csvImportErrorXlsx'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setText(content);
    };
    reader.onerror = () => setError(t('csvImportErrorRead'));
    reader.readAsText(file);
  }

  function handleParse() {
    setError('');
    try {
      const result = parseColumnarCsv(text);
      const initial: SelectionMap = new Map();
      for (const cat of result.categories) {
        for (const item of cat.items) {
          const key = rowKey(cat.name, item);
          initial.set(key, !existingItemKeys.has(key));
        }
      }
      setParsed(result);
      setSelection(initial);
      setStep('review');
    } catch (err) {
      if (err instanceof CsvParseError) {
        setError(err.message);
      } else {
        setError(t('csvImportErrorBadFormat'));
      }
    }
  }

  async function handleSubmit() {
    if (!parsed) return;
    setError('');
    setStep('submitting');
    try {
      const filtered = parsed.categories
        .map((c) => ({
          name: c.name,
          items: c.items.filter((it) => selection.get(rowKey(c.name, it))),
        }))
        .filter((c) => c.items.length > 0);

      if (filtered.length === 0) {
        setError(t('csvImportErrorNothingSelected'));
        setStep('review');
        return;
      }

      let result: CsvImportStockResult | CsvImportLibraryResult;
      if (mode === 'stock') {
        result = await importStockCsv(restaurantId, {
          default_unit: defaultUnit,
          categories: filtered,
        });
      } else {
        result = await importMenuItemsCsv(restaurantId, { categories: filtered });
      }
      onImported(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('review');
    }
  }

  function toggle(category: string, item: string) {
    const key = rowKey(category, item);
    setSelection((prev) => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  }

  const title = mode === 'stock' ? t('csvImportStockTitle') : t('csvImportLibraryTitle');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="rounded-modal shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--divider)' }}
        >
          <h3 className="font-semibold text-fg-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
            aria-label={t('close')}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 'input' && (
            <div className="space-y-5">
              <p className="text-sm text-fg-secondary">{t('csvImportStep1')}</p>

              <div
                className="rounded-card p-6 flex flex-col items-center gap-3"
                style={{ border: '2px dashed var(--divider)' }}
              >
                <UploadIcon className="w-8 h-8 text-fg-secondary" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
                >
                  {t('csvImportChooseFile')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                <p className="text-xs text-fg-secondary">{t('csvImportOr')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-primary mb-2">
                  {t('csvImportPaste')}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="LEGUMES,POISSON,Fromage..."
                  rows={8}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                  style={{
                    borderColor: 'var(--divider)',
                    background: 'var(--surface-subtle)',
                  }}
                />
              </div>

              {error && (
                <div className="rounded-md px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md border text-sm text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={text.trim() === ''}
                  className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('csvImportParse')}
                </button>
              </div>
            </div>
          )}

          {(step === 'review' || step === 'submitting') && parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t('csvImportCountItems').replace('{n}', String(counters.willCreate))}
                </span>
                {counters.newCats.length > 0 && (
                  <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                    {t('csvImportCountCategories')
                      .replace('{n}', String(counters.newCats.length))
                      .replace('{list}', counters.newCats.join(', '))}
                  </span>
                )}
                {counters.willSkip > 0 && (
                  <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    {t('csvImportCountDuplicates').replace('{n}', String(counters.willSkip))}
                  </span>
                )}
              </div>

              {mode === 'stock' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-fg-primary">
                    {t('csvImportDefaultUnit')}
                  </label>
                  <select
                    value={defaultUnit}
                    onChange={(e) => setDefaultUnit(e.target.value as StockUnit)}
                    className="rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
                    disabled={step === 'submitting'}
                  >
                    {STOCK_UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {parsed.categories.map((cat) => {
                  const isNewCat = !existingCatSet.has(cat.name.toLowerCase());
                  return (
                    <div
                      key={cat.name}
                      className="rounded-card"
                      style={{ border: '1px solid var(--divider)' }}
                    >
                      <div
                        className="px-3 py-2 flex items-center justify-between"
                        style={{ background: 'var(--surface-subtle)' }}
                      >
                        <span className="text-sm font-semibold text-fg-primary uppercase tracking-wide">
                          {cat.name}
                        </span>
                        {isNewCat && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                            {t('csvImportNew')}
                          </span>
                        )}
                      </div>
                      <ul className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                        {cat.items.map((item) => {
                          const key = rowKey(cat.name, item);
                          const checked = selection.get(key) ?? false;
                          const isDup = existingItemKeys.has(key);
                          return (
                            <li
                              key={key}
                              className={`px-3 py-2 flex items-center gap-3 text-sm ${
                                isDup ? 'text-fg-secondary' : 'text-fg-primary'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(cat.name, item)}
                                disabled={step === 'submitting'}
                              />
                              <span className={isDup ? 'line-through' : ''}>{item}</span>
                              {isDup && (
                                <span className="ml-auto text-xs text-amber-700">
                                  {t('csvImportDuplicate')}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-md px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setStep('input'); setParsed(null); }}
                  className="px-4 py-2 rounded-md border text-sm text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderColor: 'var(--divider)' }}
                  disabled={step === 'submitting'}
                >
                  <FileTextIcon className="w-4 h-4 inline-block mr-1" />
                  {t('csvImportBack')}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-md border text-sm text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                    style={{ borderColor: 'var(--divider)' }}
                    disabled={step === 'submitting'}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={step === 'submitting' || counters.willCreate === 0}
                    className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {step === 'submitting'
                      ? t('csvImportSubmitting')
                      : t('csvImportButton')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
