'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, Plus, Image as ImageIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog } from '@/components/ds';
import { useCurrency, useI18n } from '@/lib/i18n';
import { addItemsToGroup, removeItemFromGroup, type Menu, type MenuItem, type MenuCategory, type GroupItemScope } from '@/lib/api';

type TFn = (key: string) => string;

function EditDialog({ title, subtitle, children, footer, saving, dirty, error, onClose }: {
  title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer: React.ReactNode;
  saving: boolean; dirty: boolean; error: string; onClose: () => void;
}) {
  const { t } = useI18n();
  const [discard, setDiscard] = useState(false);
  const initialFocus = useRef<HTMLInputElement | null>(null);
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };
  return <><Modal initialFocusRef={initialFocus} title={title} subtitle={subtitle} size="2xl" onClose={close} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button>{footer}</div>}>
    {error && <p role="alert" className="mb-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error} {t('menuSavePartial')}</p>}
    <fieldset ref={element => { initialFocus.current = element?.querySelector('input:not([disabled])') ?? null; }} disabled={saving || !!error} className="min-w-0 space-y-4">{children}</fieldset>
  </Modal><ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={error ? t('menuSavePartial') : t('libraryDiscardDescription')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} /></>;
}

function ItemFilters({ search, onSearch, categories, category, onCategory, t }: {
  search: string; onSearch: (value: string) => void; categories: MenuCategory[]; category: number | null;
  onCategory: (value: number | null) => void; t: TFn;
}) {
  return <><label className="relative block"><span className="sr-only">{t('search')}</span><Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-secondary" /><input className="input ps-10" placeholder={t('search')} value={search} onChange={e => onSearch(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant={category === null ? 'primary' : 'secondary'} aria-pressed={category === null} onClick={() => onCategory(null)}>{t('allCategoriesFilter')}</Button>{categories.filter(c => (c.items?.length ?? 0) > 0).map(c => <Button key={c.id} size="sm" variant={category === c.id ? 'primary' : 'secondary'} aria-pressed={category === c.id} onClick={() => onCategory(c.id)}>{c.name}</Button>)}</div></>;
}

function ItemChoice({ item, selected, onChange, radio }: { item: MenuItem; selected: boolean; onChange: () => void; radio?: string }) {
  const { money } = useCurrency();
  return <label className={`flex cursor-pointer items-center gap-3 border-b border-[var(--line)] px-2 py-3 ${selected ? 'bg-[var(--summary-bg)]' : 'hover:bg-[var(--surface-2)]'}`}>
    {item.image_url ? <img src={item.image_url} alt="" className="size-10 shrink-0 rounded-r-md object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-fg-secondary"><ImageIcon className="size-5" /></span>}
    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold" dir="auto">{item.name}</span><span className="text-sm text-fg-secondary"><bdi>{money(item.price)}</bdi></span></span>
    <input type={radio ? 'radio' : 'checkbox'} name={radio} aria-label={item.name} className="size-5 shrink-0 accent-[var(--brand-500)]" checked={selected} onChange={onChange} />
  </label>;
}

/** Edits group membership while retaining successful steps if a later request fails. */
export function AddRemoveItemsModal({ t, rid, groupId, allItems, allCats, groupItems, addScope, removeCutoff, onClose, onDone, onCreateNew }: {
  t: TFn; rid: number; groupId: number; allItems: MenuItem[]; allCats: MenuCategory[]; groupItems: MenuItem[];
  addScope?: GroupItemScope; removeCutoff?: string; onClose: (changed?: boolean) => void; onDone: (added: number[], removed: number[]) => void; onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const original = useRef(new Set(groupItems.map(i => i.id)));
  const confirmed = useRef(new Set(original.current));
  const [checked, setChecked] = useState(new Set(original.current));
  const [createPending, setCreatePending] = useState(false);
  const dirty = checked.size !== original.current.size || Array.from(checked).some(id => !original.current.has(id));
  const filtered = allItems.filter(i => (category === null || i.category_id === category) && i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const additions = Array.from(checked).filter(id => !confirmed.current.has(id));
      if (additions.length) { await addItemsToGroup(rid, groupId, additions, addScope); additions.forEach(id => confirmed.current.add(id)); }
      for (const id of Array.from(confirmed.current).filter(id => !checked.has(id))) { await removeItemFromGroup(rid, groupId, id, removeCutoff); confirmed.current.delete(id); }
      onDone(Array.from(checked).filter(id => !original.current.has(id)), Array.from(original.current).filter(id => !checked.has(id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <><EditDialog title={t('addOrRemoveItems')} saving={saving} dirty={dirty || !!error} error={error} onClose={() => onClose(confirmed.current.size !== original.current.size || Array.from(confirmed.current).some(id => !original.current.has(id)))} footer={<Button variant="primary" disabled={saving} onClick={() => void save()}>{t(saving ? 'saving' : 'done')}</Button>}>
    <ItemFilters search={search} onSearch={setSearch} categories={allCats} category={category} onCategory={setCategory} t={t} />
    <p className="text-sm text-fg-secondary" role="status">{t('nSelected').replace('{n}', String(checked.size))}</p>
    <Button variant="secondary" onClick={() => { if (dirty || error) setCreatePending(true); else onCreateNew(); }}><Plus />{t('createNewItems')}</Button>
    <div>{filtered.map(item => <ItemChoice key={item.id} item={item} selected={checked.has(item.id)} onChange={() => setChecked(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />)}{!filtered.length && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}</div>
  </EditDialog><ConfirmDialog open={createPending} onOpenChange={setCreatePending} title={t('discardChanges')} description={error ? t('menuSavePartial') : t('libraryDiscardDescription')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onCreateNew} /></>;
}

/** Keeps each replacement choice and the current step when saving fails. */
export function ReplaceItemsModal({ t, itemsToReplace, allItems, allCats, groupItemIds, onClose, onDone }: {
  t: TFn; itemsToReplace: MenuItem[]; allItems: MenuItem[]; allCats: MenuCategory[]; groupItemIds: Set<number>;
  onClose: () => void; onDone: (replacements: { oldId: number; newId: number }[]) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [replacements, setReplacements] = useState(new Map<number, number>());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const current = itemsToReplace[step];
  const used = new Set(Array.from(replacements).filter(([old]) => old !== current?.id).map(([, id]) => id));
  const filtered = allItems.filter(i => !groupItemIds.has(i.id) && !used.has(i.id) && (category === null || i.category_id === category) && i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (!current) return null;
  const last = step === itemsToReplace.length - 1;
  const advance = async (map: Map<number, number>) => {
    if (busy.current) return;
    if (!last) { setStep(step + 1); setSearch(''); return; }
    busy.current = true; setSaving(true); setError('');
    try { await onDone(Array.from(map).map(([oldId, newId]) => ({ oldId, newId }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <EditDialog title={t('replaceSelectFor').replace('{name}', current.name)} subtitle={t('replaceStepProgress').replace('{current}', String(step + 1)).replace('{total}', String(itemsToReplace.length))} saving={saving} dirty={replacements.size > 0 || !!error} error={error} onClose={onClose} footer={<>
    {step > 0 && <Button variant="secondary" disabled={saving || !!error} onClick={() => { setStep(step - 1); setSearch(''); }}>{t('back')}</Button>}
    <Button variant="secondary" disabled={saving || !!error} onClick={() => { const next = new Map(replacements); next.delete(current.id); setReplacements(next); void advance(next); }}>{t('skip')}</Button>
    <Button variant="primary" disabled={saving || !replacements.has(current.id)} onClick={() => void advance(replacements)}>{t(saving ? 'saving' : last ? 'done' : 'next')}</Button>
  </>}>
    <ItemFilters search={search} onSearch={setSearch} categories={allCats} category={category} onCategory={setCategory} t={t} />
    <div>{filtered.map(item => <ItemChoice key={item.id} item={item} radio={`replace-${current.id}`} selected={replacements.get(current.id) === item.id} onChange={() => setReplacements(prev => new Map(prev).set(current.id, item.id))} />)}{!filtered.length && <p className="py-8 text-center text-fg-secondary">{t('noResults')}</p>}</div>
  </EditDialog>;
}

/** Selects a real destination group with native keyboard-accessible radio controls. */
export function MoveToGroupModal({ t, menus, sourceGroupId, itemCount, onClose, onPick }: {
  t: TFn; menus: Menu[]; sourceGroupId: number; itemCount: number; onClose: () => void; onPick: (target: number) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const visible = useMemo(() => menus.map(menu => ({ menu, groups: (menu.groups ?? []).filter(g => g.id !== sourceGroupId && `${menu.name} ${g.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())) })).filter(m => m.groups.length), [menus, sourceGroupId, search]);
  const save = async () => {
    if (busy.current || picked === null) return;
    busy.current = true; setSaving(true); setError('');
    try { await onPick(picked); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <EditDialog title={t('moveToGroup')} subtitle={t('moveToGroupDesc').replace('{n}', String(itemCount))} saving={saving} dirty={picked !== null || !!error} error={error} onClose={onClose} footer={<Button variant="primary" disabled={saving || picked === null} onClick={() => void save()}>{t(saving ? 'saving' : 'move')}</Button>}>
    <label className="block"><span className="sr-only">{t('search')}</span><input className="input" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} /></label>
    {visible.map(({ menu, groups }) => <fieldset key={menu.id} className="min-w-0"><legend className="mb-2 break-words text-sm font-semibold text-fg-secondary">{menu.name}</legend>{groups.map(group => <label key={group.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-r-md border border-[var(--line)] p-3 ${picked === group.id ? 'bg-[var(--summary-bg)]' : ''}`}><span className="min-w-0 flex-1 break-words">{group.name}</span><input type="radio" name="target-group" aria-label={`${menu.name} · ${group.name}`} checked={picked === group.id} onChange={() => setPicked(group.id)} className="size-5 shrink-0 accent-[var(--brand-500)]" /></label>)}</fieldset>)}
    {!visible.length && <p className="py-8 text-center text-fg-secondary">{t('noResults')}</p>}
  </EditDialog>;
}
