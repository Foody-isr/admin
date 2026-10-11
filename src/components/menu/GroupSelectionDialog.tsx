'use client';

import { useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

/** Selects library records without conflating category IDs and display-group IDs. */
export function GroupSelectionDialog({ title, choices, onSave, onClose, onCreate }: {
  title: string;
  choices: { id: number; name: string; detail: string; disabled?: boolean }[];
  onSave: (ids: number[]) => Promise<void>;
  onClose: () => void;
  onCreate?: (hasSelection: boolean) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set<number>());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const close = () => { if (!busy.current) { if (selected.size) setDiscard(true); else onClose(); } };
  const save = async () => {
    if (busy.current || !selected.size) return;
    busy.current = true; setSaving(true); setError('');
    try { await onSave(Array.from(selected)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setSaving(false); }
  };
  const filtered = choices.filter(choice => choice.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  return <><Modal title={title} initialFocusRef={search} size="2xl" onClose={close} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button><Button variant="primary" disabled={saving || !selected.size} onClick={() => void save()}>{t(saving ? 'saving' : 'add')}</Button></div>}>
    <fieldset disabled={saving} className="min-w-0 space-y-4"><label className="block"><span className="sr-only">{t('search')}</span><input ref={search} className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} /></label>
      {onCreate && <Button type="button" variant="secondary" onClick={() => onCreate(selected.size > 0)}>{t('createNewItems')}</Button>}
      <p className="text-sm text-fg-secondary" role="status">{t('nSelected').replace('{n}', String(selected.size))}</p>
      <div>{filtered.map(choice => <label key={choice.id} className={[`flex min-h-16 cursor-pointer items-center gap-3 border-b border-[var(--line)] p-3 ${selected.has(choice.id) ? 'bg-[var(--summary-bg)]' : 'hover:bg-[var(--surface-2)]'}`, "selection-row"].filter(Boolean).join(" ")}><span className="min-w-0 flex-1"><span className="block break-words font-semibold" dir="auto">{choice.name}</span><span className="text-sm text-fg-secondary">{choice.detail}</span></span><input type="checkbox" disabled={choice.disabled} aria-label={choice.name} checked={selected.has(choice.id)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(choice.id)) next.delete(choice.id); else next.add(choice.id); return next; })} className="size-5 shrink-0 accent-[var(--brand-500)]" /></label>)}{!filtered.length && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}</div>
      {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
    </fieldset>
  </Modal><ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} /></>;
}
