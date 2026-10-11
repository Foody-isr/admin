'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { listSections, createSection, updateSection, deleteSection, type TableSection } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, EmptyState, Field, Input, NumberField, PageHead } from '@/components/ds';
import Modal from '@/components/Modal';

type Editor = { section: TableSection | null; name: string; count: number };

/** Manage restaurant sections without replaying a write when its readback fails. */
export default function SectionsPage() {
  const { restaurantId } = useParams();
  return <SectionsWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function SectionsWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('tables.manage');
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | 'retry' | null>(null);
  const [deleting, setDeleting] = useState<TableSection | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const dirty = !!editor && (editor.name !== (editor.section?.name ?? '') || editor.count !== 0);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const next = await listSections(rid);
      if (!current()) return false;
      setSections(next); setLoaded(true); return true;
    } catch { if (current()) setLoadError(true); return false; }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const close = () => { if (lock.current) return; if (dirty) setConfirm('discard'); else { setEditor(null); setFieldError(''); } };
  const open = (section: TableSection | null) => {
    if (!canManage || lock.current || loading || loadError) return;
    setEditor({ section, name: section?.name ?? '', count: 0 }); setError(''); setFieldError(''); setReceipt(''); setUncertain(false); setReviewed(false);
  };
  const refresh = async () => { if (lock.current || loading) return; if (await load()) setReviewed(true); };
  const validate = () => {
    if (!editor?.name.trim()) { setFieldError('sectionNameRequired'); nameInput.current?.focus(); return false; }
    if (sections.some(section => section.id !== editor.section?.id && section.name.trim().toLowerCase() === editor.name.trim().toLowerCase())) { setFieldError('sectionNameDuplicate'); nameInput.current?.focus(); return false; }
    return Number.isInteger(editor.count) && editor.count >= 0 && editor.count <= 50;
  };
  const write = async (kind: 'save' | 'delete', target?: TableSection) => {
    if (!canManage || lock.current || loading || loadError || (kind === 'save' && (!editor || !validate()))) return;
    lock.current = true; setBusy(true); setError(''); setReceipt('');
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    try {
      if (kind === 'delete' && target) {
        await deleteSection(rid, target.id);
        if (!current()) return;
        setSections(items => items.filter(section => section.id !== target.id)); setReceipt('sectionDeleted');
      } else if (editor) {
        const name = editor.name.trim();
        if (editor.section) {
          const updated = await updateSection(rid, editor.section.id, name);
          if (!current()) return;
          // Rename responses do not preload tables. Keep the known collection until GET succeeds.
          setSections(items => items.map(section => section.id === editor.section!.id ? { ...section, name: updated.name } : section));
          setReceipt('sectionRenamed');
        } else {
          const created = await createSection(rid, { name, label: name, ...(editor.count > 0 ? { table_count: editor.count } : {}) });
          if (!current()) return;
          setSections(items => [...items, created]); setReceipt('sectionCreated');
        }
        setEditor(null); setFieldError('');
      }
      setUncertain(false); setReviewed(false);
      await load();
    } catch {
      if (current()) { setError('sectionWriteUnconfirmed'); setUncertain(true); setReviewed(false); }
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!editor || !dirty || !validate() || (uncertain && !reviewed)) return;
    if (uncertain) setConfirm('retry'); else void write('save');
  };
  const disabled = busy || loading || loadError;
  return <div className="max-w-5xl space-y-6">
    <PageHead title={t('sections')} desc={t('sectionsDesc')} actions={canManage && <Button disabled={disabled || !loaded || (uncertain && !reviewed)} onClick={() => open(null)}><Plus />{t('newSection')}</Button>} />
    <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('sectionsVisibleHint')}</p>
    {!canManage && <p className="text-sm text-[var(--fg-muted)]">{t('pushPreferencesReadOnly')}</p>}
    {receipt && <p role="status" className="text-sm font-medium">{t(receipt)}</p>}
    {loading && <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p>}
    {loadError && <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t(receipt ? 'sectionSavedRefreshFailed' : 'sectionsLoadFailed')}</p><Button variant="secondary" disabled={busy || loading} onClick={() => void refresh()}>{t('retry')}</Button></div>}
    {error && !editor && <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t(error)}</p><Button variant="secondary" disabled={busy || loading} onClick={() => void refresh()}>{t('sectionsReviewList')}</Button>{reviewed && <p className="text-sm text-[var(--fg-muted)]">{t('sectionsReviewedHint')}</p>}</div>}
    {loaded && <section aria-label={t('sections')} aria-busy={loading || busy} className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      {sections.length === 0 ? <EmptyState icon={<Boxes />} title={t('noSectionsYet')} desc={t('sectionsEmptyHint')} action={canManage && <Button disabled={disabled || (uncertain && !reviewed)} onClick={() => open(null)}><Plus />{t('newSection')}</Button>} /> : <ul className="divide-y divide-[var(--line)]">{sections.map(section => <li key={section.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4"><span className="hidden size-11 shrink-0 place-items-center rounded-r-md bg-[var(--summary-bg)] text-[var(--summary-fg)] sm:grid"><Boxes className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words text-base font-semibold"><bdi>{section.name}</bdi></h2><p className="mt-1 text-sm text-[var(--fg-muted)]">{t('sectionsVisibleTables').replace('{count}', String(section.tables?.length ?? 0))}</p></div></div>
        {canManage && <div className="flex shrink-0 gap-2"><Button variant="secondary" icon aria-label={`${t('renameSection')} · ${section.name}`} disabled={disabled || (uncertain && !reviewed)} onClick={() => open(section)}><Pencil /></Button><Button variant="ghost" icon className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]" aria-label={`${t('deleteSection')} · ${section.name}`} disabled={disabled || (uncertain && !reviewed)} onClick={() => setDeleting(section)}><Trash2 /></Button></div>}
      </li>)}</ul>}
    </section>}
    {editor && <Modal title={t(editor.section ? 'renameSection' : 'newSection')} onClose={close} closeDisabled={busy} initialFocusRef={nameInput}>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <Field label={t('sectionName')}><Input ref={nameInput} autoFocus required dir="auto" value={editor.name} readOnly={busy} placeholder={t('sectionNamePlaceholder')} aria-label={t('sectionName')} aria-invalid={!!fieldError || undefined} aria-describedby={fieldError ? 'section-name-error' : undefined} onChange={event => { setEditor({ ...editor, name: event.target.value }); setFieldError(''); }} /></Field>
        {fieldError && <p id="section-name-error" role="alert" className="text-sm text-[var(--danger-500)]">{t(fieldError)}</p>}
        {!editor.section && <><Field label={t('initialTableCount')} hint={t('initialTableCountHint')}><NumberField integer min={0} max={50} format={String} value={editor.count} readOnly={busy} aria-label={t('initialTableCount')} dir="ltr" onChange={count => setEditor({ ...editor, count })} /></Field><p className="text-sm leading-6 text-[var(--fg-muted)]">{editor.count > 0 ? <>{t('sectionsTableNamesHint')} <bdi>{editor.name.trim() || t('sectionNamePlaceholder')} 1</bdi>{editor.count > 1 && <>, <bdi>{editor.name.trim() || t('sectionNamePlaceholder')} {editor.count}</bdi></>}</> : t('sectionsZeroHint')}</p></>}
        {error && <div role="alert" className="space-y-3"><p className="text-sm leading-6 text-[var(--danger-500)]">{t(error)}</p><Button type="button" variant="secondary" disabled={busy || loading} onClick={() => void refresh()}>{t('sectionsReviewList')}</Button>{loadError && <p className="text-sm text-[var(--danger-500)]">{t('sectionsLoadFailed')}</p>}{reviewed && <div><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('sectionsReviewedHint')}</p><ul className="mt-3 max-h-44 space-y-2 overflow-y-auto text-sm">{sections.map(section => <li key={section.id}><bdi>{section.name}</bdi> · {t('sectionsVisibleTables').replace('{count}', String(section.tables?.length ?? 0))}</li>)}</ul></div>}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={close}>{t('cancel')}</Button><Button type="submit" disabled={!dirty || disabled || (uncertain && !reviewed)}>{t(busy ? 'saving' : editor.section ? 'saveChanges' : 'create')}</Button></div>
      </form>
    </Modal>}
    <ConfirmDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }} title={t(confirm === 'retry' ? 'sectionsRetryTitle' : 'discardUnsavedChanges')} description={confirm === 'retry' ? t('sectionsRetryHint') : undefined} confirmLabel={t(confirm === 'retry' ? 'sectionsRetryWrite' : 'discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'retry') void write('save'); else { setEditor(null); setFieldError(''); } }} />
    <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null); }} danger title={<>{t('deleteSection')} · <bdi>{deleting?.name}</bdi></>} description={t('sectionsDeleteHint')} confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={() => { const target = deleting; setDeleting(null); if (target) void write('delete', target); }} />
  </div>;
}
