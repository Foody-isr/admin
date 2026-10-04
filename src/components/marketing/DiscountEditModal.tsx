'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiscount, updateDiscount, getDiscount, listDiscounts, getAllCategories, listAllItems, type Discount, type DiscountInput } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog, Field, Input, Select, Textarea } from '@/components/ds';
import { Switch } from '@/app/[restaurantId]/settings/orders/_components';
import { discountDraft, discountInput, discountSignature, checkedDiscount, type DiscountDraft, type DiscountIssue } from './discount-form';

type ScopeKind = 'category' | 'specific_item';
type ScopeData = { loading: boolean; error: boolean; rows: { id: number; name: string }[] };
export interface DiscountEditModalProps {
  open: boolean; editing?: Discount; restaurantId: number; canEdit: boolean; today: string; timezone: string;
  onClose: () => void;
  /** Update the list after reconciliation without closing the current editor. */
  onCurrent: (discount: Discount) => void;
  /** Accept the saved record without requiring a second mutation if list refresh fails. */
  onSaved: (discount: Discount, verified?: boolean) => void;
}
const emptyScope = (): ScopeData => ({ loading: true, error: false, rows: [] });
const inputId = (field: string) => `discount-${field}`;

/** Edit a complete discount definition with scoped selection, draft guards and readback recovery. */
export default function DiscountEditModal({ open, editing, restaurantId, canEdit, today, timezone, onClose, onCurrent, onSaved }: DiscountEditModalProps) {
  const { t } = useI18n(), { symbol, money } = useCurrency();
  const [baseline, setBaseline] = useState(editing);
  const [draft, setDraft] = useState(() => discountDraft(editing, today));
  const [catalog, setCatalog] = useState<Record<ScopeKind, ScopeData>>({ category: emptyScope(), specific_item: emptyScope() });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false), [issue, setIssue] = useState<DiscountIssue | null>(null);
  const [pending, setPending] = useState<DiscountInput | null>(null), [serverVersion, setServerVersion] = useState<Discount | null>(null), [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'leave' | 'adopt' | null>(null);
  const lock = useRef(false), lifetime = useRef({ generation: 0, category: 0, specific_item: 0 });
  const dirty = JSON.stringify(draft) !== JSON.stringify(discountDraft(baseline, today));
  const frozen = !canEdit || saving || !!pending;
  const fetchScope = useCallback(async (kind: ScopeKind) => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current[kind];
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current[kind];
    setCatalog(previous => ({ ...previous, [kind]: { ...previous[kind], loading: true, error: false } }));
    try {
      const rows = kind === 'category' ? await getAllCategories(restaurantId) : await listAllItems(restaurantId);
      if (!Array.isArray(rows) || rows.some(row => !Number.isSafeInteger(row.id) || typeof row.name !== 'string')) throw new Error('Incomplete catalog');
      if (current()) setCatalog(previous => ({ ...previous, [kind]: { rows, loading: false, error: false } }));
    } catch { if (current()) setCatalog(previous => ({ ...previous, [kind]: { ...previous[kind], loading: false, error: true } })); }
  }, [restaurantId]);
  useEffect(() => {
    if (!open) return;
    const current = lifetime.current; void fetchScope('category'); void fetchScope('specific_item');
    return () => { current.generation++; };
  }, [open, fetchScope]);
  useEffect(() => { if (issue) document.getElementById(inputId(issue.field))?.focus(); else if (error) document.getElementById('discount-save-error')?.focus(); }, [issue, error]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || pending || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [dirty, pending]);
  const patch = (next: Partial<DiscountDraft>) => { if (frozen || lock.current) return; setDraft(previous => ({ ...previous, ...next })); setIssue(null); setError(null); };
  const close = () => { if (lock.current) return; if (dirty || pending) setConfirmation('leave'); else onClose(); };
  const checked = (value: Discount) => checkedDiscount(value, restaurantId, baseline?.id);
  const save = async () => {
    if (frozen || lock.current || (baseline && !dirty)) return;
    const result = discountInput(draft, baseline);
    if (result.issue) { setIssue(result.issue); return; }
    lock.current = true; setSaving(true); setError(null); setIssue(null);
    const generation = lifetime.current.generation;
    try {
      const saved = checked(baseline ? await updateDiscount(restaurantId, baseline.id, result.input) : await createDiscount(restaurantId, result.input));
      if (generation === lifetime.current.generation) onSaved(saved);
    } catch { if (generation === lifetime.current.generation) { setPending(result.input); setError('discountSaveUnconfirmed'); } }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setSaving(false); } }
  };
  const verify = async () => {
    if (!pending || lock.current) return;
    lock.current = true; setSaving(true); setError(null); setServerVersion(null);
    const generation = lifetime.current.generation;
    try {
      const found = baseline ? checked(await getDiscount(restaurantId, baseline.id)) : (await listDiscounts(restaurantId)).map(checked).find(row => row.code.trim().toUpperCase() === pending.code);
      if (generation !== lifetime.current.generation) return;
      if (found && discountSignature(checked(found)) === discountSignature(pending)) { onSaved(found, true); return; }
      if (!baseline) {
        setPending(null); setError(found ? 'discountCodeAlreadyExists' : 'discountNotFoundAfterRead');
        if (found) { onCurrent(found); setIssue({ field: 'code', key: 'discountCodeAlreadyExists' }); }
      } else if (found && discountSignature(found) === discountSignature(baseline)) {
        setPending(null); setError('discountUnchangedAfterRead');
      } else if (found) { setServerVersion(found); setError('discountServerDifferent'); onCurrent(found); }
    } catch { if (generation === lifetime.current.generation) setError('discountReadError'); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setSaving(false); } }
  };
  if (!open) return null;
  const selectedKind = draft.scope === 'whole_sale' ? null : draft.scope;
  const scopeData = selectedKind ? catalog[selectedKind] : null;
  const selection = draft.selections[draft.scope];
  const rows = scopeData?.rows.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  const unknownIds = scopeData && !scopeData.loading ? selection.filter(id => !scopeData.rows.some(row => row.id === id)) : [];
  const toggle = (id: number) => patch({ selections: { ...draft.selections, [draft.scope]: selection.includes(id) ? selection.filter(value => value !== id) : [...selection, id] } });
  const fieldError = (field: string) => issue?.field === field ? <p id={`${inputId(field)}-error`} className="text-sm text-[var(--danger-500)]">{t(issue.key)}</p> : null;
  const invalid = (field: string) => ({ 'aria-invalid': issue?.field === field || undefined, 'aria-describedby': issue?.field === field ? `${inputId(field)}-error` : undefined });
  return <>
    <Modal title={baseline ? t(canEdit ? 'editDiscountTitle' : 'discountViewTitle') : t('newDiscountTitle')} size="2xl" onClose={close} closeDisabled={saving} footer={<div className="space-y-3"><p role="status" className="text-xs text-[var(--fg-muted)]">{t(saving ? 'saving' : pending ? 'discountAwaitingVerification' : dirty ? 'settingsUnsaved' : 'settingsUnchanged')}</p><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={close}>{t(canEdit ? 'cancel' : 'close')}</Button>{canEdit && <Button type="submit" form="discount-form" disabled={frozen || (!!baseline && !dirty)}>{t('save')}</Button>}</div></div>}>
      <form id="discount-form" className="space-y-6" onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
        {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('discountReadOnly')}</p>}
        {error && <div id="discount-save-error" tabIndex={-1} role="alert" className="space-y-3 rounded-r-md border border-[var(--danger-500)] p-4"><p className="text-sm leading-6">{t(error)}</p>{pending && <Button type="button" variant="secondary" disabled={saving} className="whitespace-normal py-2 leading-5" onClick={() => void verify()}>{t('discountVerifySaved')}</Button>}
          {serverVersion && <><details className="rounded-r-md bg-[var(--surface-2)] p-3"><summary className="cursor-pointer text-sm font-semibold">{t('discountServerVersion')}</summary><dl className="mt-3 space-y-3 text-sm">{[
            [t('discountCode'), serverVersion.code], [t('discountName'), serverVersion.name], [t('discountDescription'), serverVersion.description], [t('discountType'), t(serverVersion.type === 'fixed' ? 'typeFixed' : serverVersion.type === 'percent' ? 'typePercent' : 'typeFreeDelivery')], [t('discountValue'), serverVersion.type === 'percent' ? `${serverVersion.value}%` : money(serverVersion.value)], [t('appliesTo'), `${t(serverVersion.scope === 'whole_sale' ? 'scopeWholeSale' : serverVersion.scope === 'category' ? 'scopeCategory' : 'scopeSpecificItem')} · ${(serverVersion.scope_ids ?? []).join(', ')}`], [t('minPurchase'), money(serverVersion.min_purchase)], [t('totalCap'), serverVersion.total_cap ?? t('discountUnlimited')], [t('perCustomerCap'), serverVersion.per_customer_cap ?? t('discountUnlimited')], [t('startsAt'), serverVersion.starts_at ?? t('discountNoDateBound')], [t('endsAt'), serverVersion.ends_at ?? t('discountNoDateBound')], [t('active'), t(serverVersion.is_active ? 'yes' : 'no')],
          ].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--fg-muted)]">{label}</dt><dd dir="auto" className="mt-1 whitespace-pre-wrap break-words">{value === '' ? '—' : value}</dd></div>)}</dl></details><Button type="button" disabled={saving} className="whitespace-normal py-2 leading-5" onClick={() => setConfirmation('adopt')}>{t('discountUseServer')}</Button></>}
        </div>}
        <section className="space-y-4" aria-label={t('discountIdentity')}>
          <h3 className="text-base font-semibold">{t('discountIdentity')}</h3>
          <div className="grid gap-4 sm:grid-cols-2"><Field label={t('discountCode')}><Input id={inputId('code')} autoFocus dir="ltr" value={draft.code} readOnly={frozen} onChange={event => patch({ code: event.target.value })} onBlur={() => patch({ code: draft.code.trim().toUpperCase() })} {...invalid('code')} autoComplete="off" />{fieldError('code')}</Field><Field label={t('discountName')}><Input id={inputId('name')} dir="auto" value={draft.name} readOnly={frozen} onChange={event => patch({ name: event.target.value })} /></Field></div>
          <Field label={t('discountDescription')}><Textarea dir="auto" rows={3} value={draft.description} readOnly={frozen} onChange={event => patch({ description: event.target.value })} /></Field>
        </section>
        <section className="space-y-4 border-t border-[var(--line)] pt-5" aria-label={t('discountType')}>
          <div className="grid gap-4 sm:grid-cols-2"><Field label={t('discountType')}><Select id={inputId('type')} disabled={frozen} value={draft.type} onChange={event => patch({ type: event.target.value as Discount['type'] })}><option value="fixed">{t('typeFixed')}</option><option value="percent">{t('typePercent')}</option><option value="free_delivery">{t('typeFreeDelivery')}</option></Select></Field>{draft.type !== 'free_delivery' && <Field label={`${t('discountValue')} (${draft.type === 'percent' ? '%' : symbol})`}><Input id={inputId('value')} dir="ltr" type="number" step="any" value={draft.value} readOnly={frozen} onChange={event => patch({ value: event.target.value })} {...invalid('value')} />{fieldError('value')}</Field>}</div>
          {draft.type !== 'free_delivery' && <><Field label={t('appliesTo')}><Select disabled={frozen} value={draft.scope} onChange={event => { patch({ scope: event.target.value as Discount['scope'] }); setSearch(''); }}><option value="whole_sale">{t('scopeWholeSale')}</option><option value="category">{t('scopeCategory')}</option><option value="specific_item">{t('scopeSpecificItem')}</option></Select></Field>
            {selectedKind && scopeData && <div id={inputId('scopeIds')} tabIndex={-1} className="space-y-3 rounded-r-md border border-[var(--line)] p-4" {...invalid('scopeIds')}>
              <p className="text-sm font-semibold">{t('discountSelectedCount').replace('{n}', String(selection.length))}</p>
              <Field label={t('search')}><Input type="search" disabled={saving} value={search} onChange={event => setSearch(event.target.value)} /></Field>
              {scopeData.loading ? <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p> : scopeData.error ? <div role="alert" className="space-y-2"><p className="text-sm text-[var(--danger-500)]">{t('discountScopeLoadError')}</p><Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void fetchScope(selectedKind)}>{t('retry')}</Button></div> : <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain">{rows.map(row => <label key={row.id} className="flex items-start gap-3 rounded-r-md p-2 text-sm hover:bg-[var(--surface-2)]"><input type="checkbox" disabled={frozen} checked={selection.includes(row.id)} onChange={() => toggle(row.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-ink)]" /><span dir="auto" className="break-words">{row.name}</span></label>)}{rows.length === 0 && <p className="text-sm text-[var(--fg-muted)]">{t(search ? 'discountScopeNoResults' : 'discountScopeEmpty')}</p>}</div>}
              {unknownIds.length > 0 && <div className="space-y-2 border-t border-[var(--line)] pt-3"><p className="text-xs leading-5 text-[var(--fg-muted)]">{t('discountScopeUnknown')}</p>{unknownIds.map(id => <label key={id} className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={frozen} checked onChange={() => toggle(id)} className="size-4 accent-[var(--brand-ink)]" /><span>{t('discountReference').replace('{id}', String(id))}</span></label>)}</div>}
              {fieldError('scopeIds')}
            </div>}
          </>}
        </section>
        <section className="space-y-4 border-t border-[var(--line)] pt-5" aria-label={t('conditions')}>
          <h3 className="text-base font-semibold">{t('conditions')}</h3>
          {([['minimum', 'minPurchase', 'minPurchaseHelp'], ['totalCap', 'totalCap', 'totalCapHelp'], ['customerCap', 'perCustomerCap', 'perCustomerCapHelp']] as const).map(([field, label, hint]) => <Field key={field} label={field === 'minimum' ? `${t(label)} (${symbol})` : t(label)} hint={t(hint)}><Input id={inputId(field)} aria-label={field === 'minimum' ? `${t(label)} (${symbol})` : t(label)} dir="ltr" type="number" step="any" value={draft[field]} readOnly={frozen} onChange={event => patch({ [field]: event.target.value })} {...invalid(field)} />{fieldError(field)}</Field>)}
        </section>
        <section className="space-y-4 border-t border-[var(--line)] pt-5" aria-label={t('discountDates')}>
          <h3 className="text-base font-semibold">{t('discountDates')}</h3><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('discountDatesHint')} <bdi>{timezone}</bdi></p>
          <Field label={t('startsAt')}><Input id={inputId('start')} type="date" dir="ltr" value={draft.start} readOnly={frozen} onChange={event => patch({ start: event.target.value })} {...invalid('start')} />{fieldError('start')}</Field>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={frozen} checked={draft.hasEnd} onChange={event => patch({ hasEnd: event.target.checked })} className="size-4 accent-[var(--brand-ink)]" /><span>{t('setEndDate')}</span></label>
          {draft.hasEnd && <Field label={t('endsAt')}><Input id={inputId('end')} type="date" dir="ltr" value={draft.end} readOnly={frozen} onChange={event => patch({ end: event.target.value })} {...invalid('end')} />{fieldError('end')}</Field>}
          <div className="flex items-center justify-between gap-4 rounded-r-md bg-[var(--surface-2)] p-4"><span className="text-sm font-medium">{t('active')}</span><Switch checked={draft.active} disabled={frozen} label={t('active')} onChange={active => patch({ active })} /></div>
        </section>
      </form>
    </Modal>
    <ConfirmDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} title={t(confirmation === 'adopt' ? 'discountUseServer' : 'discardUnsavedChanges')} description={t(confirmation === 'adopt' ? 'discountAdoptConfirm' : pending ? 'discountLeaveUnconfirmed' : 'discountDiscardHint')} confirmLabel={t(confirmation === 'adopt' ? 'discountUseServer' : 'discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const action = confirmation; setConfirmation(null); if (lock.current) return; if (action === 'adopt' && serverVersion) { setBaseline(serverVersion); setDraft(discountDraft(serverVersion, today)); setPending(null); setServerVersion(null); setError(null); setIssue(null); } else if (action === 'leave') onClose(); }} />
  </>;
}
