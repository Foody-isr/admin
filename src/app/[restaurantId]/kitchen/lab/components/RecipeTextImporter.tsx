'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  MicIcon,
  PackageCheckIcon,
  ScanTextIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ds';
import { labImportManualRecipeText } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type {
  Component,
  DraftPayload,
  ManualRecipeImportEntry,
  ManualRecipeImportResult,
  ManualRecipeImportWarning,
} from '../types';
import styles from '../workspace.module.css';
import { safeRecipeSteps } from '../normalizePayload';

type ApplyMode = 'replace' | 'append';

interface BrowserSpeechAlternative { transcript: string }
interface BrowserSpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechAlternative;
}
interface BrowserSpeechResultList {
  readonly length: number;
  [index: number]: BrowserSpeechResult;
}
interface BrowserSpeechEvent extends Event {
  readonly resultIndex: number;
  results: BrowserSpeechResultList;
}
interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

/** Free-text and browser-dictation capture for deterministic manual recipes. */
export function RecipeTextImporter({
  restaurantId,
  draftId,
  payload,
  canManage,
  onChange,
  onDirtyChange,
}: {
  restaurantId: number;
  draftId: number;
  payload: DraftPayload;
  canManage: boolean;
  onChange: (next: DraftPayload) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualRecipeImportResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
  const request=useRef({value:0});
  const active=useRef(true);
  const lock=useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    active.current=true;
    const scope=request.current;
    if (typeof window === 'undefined') return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => {active.current=false;scope.value+=1;const recognition=recognitionRef.current;if(recognition){recognition.onend=null;recognition.onerror=null;recognition.onresult=null;recognition.abort();}};
  }, []);

  useEffect(()=>{onDirtyChange(!!text.trim() || listening);},[text,listening,onDirtyChange]);
  useEffect(()=>{if(!canManage){recognitionRef.current?.abort();setListening(false);}},[canManage]);

  const componentEntries = useMemo(
    () => result?.entries.filter((entry) => entry.kind !== 'step') ?? [],
    [result],
  );

  const startDictation = () => {
    if (typeof window === 'undefined' || listening || loading || !canManage) return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    setError(null);
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = locale.startsWith('he') ? 'he-IL' : locale.startsWith('en') ? 'en-US' : 'fr-FR';
    recognition.onresult = (event) => {
      if(!active.current)return;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      // The browser keeps earlier final results in the list. Starting at
      // resultIndex prevents a dictated line from being appended again on
      // every subsequent speech event.
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim();
        if (!transcript) continue;
        if (event.results[index].isFinal) finalParts.push(transcript);
        else interimParts.push(transcript);
      }
      if (finalParts.length > 0) {
        request.current.value+=1;setResult(null);
        setText((current) => `${current.trimEnd()}${current.trim() ? '\n' : ''}${finalParts.join('\n')}`.slice(0,16000));
      }
      setInterimText(interimParts.join(' '));
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimText('');
      setError(event.error === 'not-allowed' ? t('labRecipeDictationPermission') : t('labRecipeDictationFailed'));
    };
    recognition.onend = () => {
      setListening(false);
      setInterimText('');
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {recognition.start();setListening(true);} catch {setError(t('labRecipeDictationFailed'));recognitionRef.current=null;}
  };

  const stopDictation = () => recognitionRef.current?.stop();

  const analyze = async () => {
    if (!text.trim() || lock.current || !canManage || listening) return;
    lock.current=true;const sequence=++request.current.value;
    if (listening) stopDictation();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsed = await labImportManualRecipeText(restaurantId, draftId, { text: text.trim(), locale });
      if(!active.current || sequence!==request.current.value)return;
      setResult(parsed);
      setSelected(new Set(parsed.components.map((_, index) => index)));
      setApplyMode('replace');
    } catch (cause) {
      console.error('Manual recipe text import failed', cause);
      if(active.current && sequence===request.current.value)setError(cause instanceof Error ? cause.message : t('labRecipeParseFailed'));
    } finally {
      lock.current=false;if(active.current)setLoading(false);
    }
  };

  const toggleSelected = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const apply = () => {
    if (!result || !canManage || loading) return;
    const currentRecipeSteps = safeRecipeSteps(payload.recipe_steps);
    const importedRecipeSteps = safeRecipeSteps(result.recipe_steps);
    const importedComponents = result.components.filter((_, index) => selected.has(index));
    const components = applyMode === 'replace'
      ? importedComponents
      : [...payload.components, ...importedComponents];
    const recipeSteps = importedRecipeSteps.length === 0
      ? currentRecipeSteps
      : applyMode === 'replace'
        ? importedRecipeSteps
        : [...currentRecipeSteps, ...importedRecipeSteps].map((step, index) => ({ ...step, order: index + 1 }));
    const containsNew = components.some(hasNewComponent);
    onChange({
      ...payload,
      components,
      recipe_steps: recipeSteps,
      brief: {
        ...payload.brief,
        stock_policy: containsNew ? 'prefer_existing' : payload.brief.stock_policy,
      },
    });
    setOpen(false);
    setResult(null);
    setText('');
    setInterimText('');
  };

  if (!canManage) return null;

  return (
    <section className={`${styles.container} overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]`}>
      <button
        type="button"
        onClick={() => {if(open) recognitionRef.current?.abort();setOpen(value=>!value);}}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-start focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:gap-4 sm:px-6"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[color-mix(in_oklab,var(--brand-500)_12%,var(--surface))] text-[var(--brand-ink)]">
          <FilePenLineIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--fg)]">{t('labRecipeCaptureTitle')}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[var(--fg-muted)]">{t('labRecipeCaptureHelp')}</span>
        </span>
        <span className="hidden rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--fg-muted)] sm:inline-flex">{t('labRecipeNoAiBadge')}</span>
        {open ? <ChevronUpIcon className="h-4 w-4 text-[var(--fg-muted)]" /> : <ChevronDownIcon className="h-4 w-4 text-[var(--fg-muted)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--line)]">
          <div className={styles.importLayout}>
            <div className="p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="manual-recipe-text" className="text-sm font-semibold text-[var(--fg)]">{t('labRecipeWriteLabel')}</label>
                <span className="text-xs text-[var(--fg-subtle)]">{text.length}/16000</span>
              </div>
              <div className={`rounded-[8px] border bg-[var(--surface)] transition-colors ${listening ? 'border-[var(--brand-500)] shadow-[var(--focus-ring)]' : 'border-[var(--line-strong)]'}`}>
                <textarea
                  id="manual-recipe-text" dir="auto"
                  value={text}
                  onChange={(event) => { request.current.value+=1; setText(event.target.value.slice(0, 16000)); setResult(null); }}
                  rows={9}
                  maxLength={16000}
                  placeholder={t('labRecipeWritePlaceholder')}
                  className="block w-full resize-y rounded-t-[8px] bg-transparent px-4 py-3 text-base leading-6 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] sm:text-sm"
                />
                {interimText && <p className="border-t border-dashed border-[var(--line)] px-4 py-2 text-xs italic text-[var(--fg-muted)]">{interimText}</p>}
                <div className="flex flex-col items-stretch justify-between gap-3 border-t border-[var(--line)] px-3 py-2.5 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    {speechSupported ? (
                      <button
                        type="button"
                        disabled={loading} onClick={listening ? stopDictation : startDictation}
                        className={`inline-flex h-11 items-center gap-2 rounded-[8px] px-3 text-xs font-semibold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:h-11 ${listening ? 'bg-[var(--danger-action)] text-white' : 'bg-[var(--surface-2)] text-[var(--fg)] hover:bg-[var(--line)]'}`}
                      >
                        {listening ? <SquareIcon className="h-3.5 w-3.5 fill-current" /> : <MicIcon className="h-4 w-4 text-[var(--brand-ink)]" />}
                        {listening ? t('labRecipeStopDictation') : t('labRecipeStartDictation')}
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--fg-subtle)]">{t('labRecipeDictationUnavailable')}</span>
                    )}
                    {listening && <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger-500)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />{t('labRecipeListening')}</span>}
                  </div>
                  <span className="text-xs leading-4 text-[var(--fg-subtle)]">{t('labRecipeAudioNotice')}</span>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--fg-muted)]">{t('labRecipeFormatHint')}</p>
              {error && <p role="alert" className="mt-3 rounded-[8px] bg-[var(--danger-50)] px-3 py-2 text-xs text-[var(--danger-500)]">{error}</p>}
              <Button className="mt-4 w-full sm:w-auto" onClick={analyze} disabled={loading || listening || text.trim().length === 0}>
                {loading ? <LoaderCircleIcon className="animate-spin" /> : <ScanTextIcon />}
                {loading ? t('labRecipeAnalyzing') : t('labRecipeAnalyze')}
              </Button>
            </div>

            <div className={`${styles.importPreview} bg-[var(--surface-2)] p-4 sm:p-6`}>
              {!result ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)]"><PackageCheckIcon className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-semibold text-[var(--fg)]">{t('labRecipePreviewEmptyTitle')}</p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-[var(--fg-muted)]">{t('labRecipePreviewEmptyHelp')}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--fg)]">{t('labRecipeReviewTitle')}</h4>
                      <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{t('labRecipeReviewHelp')}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--success-50)] px-2.5 py-1 text-xs font-semibold text-[var(--success-500)]">{result.summary.matched_count} {t('labRecipeMatchedShort')}</span>
                  </div>

                  <div className={`${styles.importResults} mt-4 space-y-2 pe-1`}>
                    {componentEntries.map((entry, index) => (
                      <ImportEntryRow key={`${entry.source}-${index}`} entry={entry} checked={selected.has(index)} onToggle={() => toggleSelected(index)} />
                    ))}
                    {safeRecipeSteps(result.recipe_steps).map((step) => (
                      <div key={`step-${step.order}`} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                        <p className="text-xs font-semibold text-[var(--fg-muted)]">{t('labRecipeStep')} {step.order}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[var(--fg)]">{step.instruction_primary || step.instruction_he}</p>
                      </div>
                    ))}
                  </div>

                  {(result.warnings?.length ?? 0) > 0 && (
                    <div className="mt-3 rounded-[8px] border border-[var(--warning-500)]/35 bg-[var(--warning-50)] px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--warning-500)]"><TriangleAlertIcon className="h-3.5 w-3.5" />{t('labRecipeReviewNeeded')}</p>
                      <ul className="mt-1.5 space-y-1 text-xs leading-4 text-[var(--fg-muted)]">
                        {uniqueWarnings(result.warnings ?? []).slice(0, 4).map((warning, index) => <li key={`${warning.code}-${warning.name}-${index}`}>• {warningCopy(warning, t)}</li>)}
                      </ul>
                    </div>
                  )}

                  {payload.components.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-1">
                      <ModeButton active={applyMode === 'replace'} onClick={() => setApplyMode('replace')} label={t('labRecipeReplace')} />
                      <ModeButton active={applyMode === 'append'} onClick={() => setApplyMode('append')} label={t('labRecipeAppend')} />
                    </div>
                  )}
                  <Button className="mt-3 w-full" onClick={apply} disabled={selected.size === 0 && safeRecipeSteps(result.recipe_steps).length === 0}>
                    <CheckCircle2Icon />{applyMode === 'replace' ? t('labRecipeApplyReplace') : t('labRecipeApplyAppend')}
                  </Button>
                  <p className="mt-2 text-center text-xs leading-4 text-[var(--fg-subtle)]">{t('labRecipeApplyNotice')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ImportEntryRow({ entry, checked, onToggle }: { entry: ManualRecipeImportEntry; checked: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const isMatched = entry.status === 'matched';
  return (
    <div className={`rounded-[8px] border bg-[var(--surface)] ${checked ? 'border-[var(--line-strong)]' : 'border-[var(--line)] opacity-55'}`}>
      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-4 w-4 rounded border-[var(--line-strong)] accent-[var(--brand-500)]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--fg)]">{entry.matched_name || entry.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isMatched ? 'bg-[var(--success-50)] text-[var(--success-500)]' : 'bg-[var(--warning-50)] text-[var(--warning-500)]'}`}>
              {isMatched ? t('labRecipeMatched') : t('labRecipeNew')}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-[var(--fg-muted)]">{formatQuantity(entry.quantity, entry.unit)}</span>
        </span>
      </label>
      {(entry.children?.length ?? 0) > 0 && (
        <div className="border-t border-[var(--line)] px-3 py-2 ps-10">
          {entry.children?.map((child, index) => (
            <div key={`${child.source}-${index}`} className="flex items-center justify-between gap-3 py-1 text-xs">
              <span className="truncate text-[var(--fg-muted)]">{child.matched_name || child.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--fg-subtle)]">{formatQuantity(child.quantity, child.unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-[7px] px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active ? 'bg-[var(--fg)] text-[var(--surface)]' : 'text-[var(--fg-muted)]'}`}>{label}</button>;
}

function formatQuantity(quantity?: number, unit?: string): string {
  if (quantity == null || !unit) return '—';
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(quantity)} ${unit}`;
}

function hasNewComponent(component: Component): boolean {
  return component.kind === 'stock_new' || component.kind === 'prep_new' || (component.ingredients ?? []).some(hasNewComponent);
}

function uniqueWarnings(warnings: ManualRecipeImportWarning[]): ManualRecipeImportWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.name ?? ''}:${warning.source ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function warningCopy(warning: ManualRecipeImportWarning, t: (key: string) => string): string {
  const name = warning.name || warning.source || t('labRecipeUnknownLine');
  const key = warning.code === 'new_stock_item'
    ? 'labRecipeWarningNewStock'
    : warning.code === 'quantity_defaulted'
      ? 'labRecipeWarningQuantity'
      : warning.code === 'unit_adjusted'
        ? 'labRecipeWarningUnit'
        : warning.code === 'existing_preparation_definition'
          ? 'labRecipeWarningExistingPrep'
          : warning.code === 'preparation_yield_defaulted'
            ? 'labRecipeWarningYield'
            : 'labRecipeWarningGeneric';
  return t(key).replace('{name}', name);
}
