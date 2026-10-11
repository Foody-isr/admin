'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Pencil, Ruler, ChevronDown } from 'lucide-react';
import {
  listCustomUnits, createCustomUnit, updateCustomUnit, deleteCustomUnit, listStockItems,
  type CustomUnit, type StockItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog, Field, Input, PageHead } from '@/components/ds';
import StockSettingsNav from '@/components/settings/StockSettingsNav';

/** Custom unit names and their per-stock conversion usage, scoped to the active restaurant. */
export default function UnitsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <UnitsWorkspace key={rid} rid={rid}/>;
}

function UnitsWorkspace({rid}: {rid:number}) {
  const {t} = useI18n();
  const {hasAnyPermission} = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [units, setUnits] = useState<CustomUnit[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usageError, setUsageError] = useState('');
  const [editing, setEditing] = useState<CustomUnit | 'new' | null>(null);
  const [removing, setRemoving] = useState<CustomUnit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const deleteLock = useRef(false);
  const guard = useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const request = guard.current.begin(rid);
    setLoading(true); setError(''); setUsageError('');
    const [unitResult, stockResult] = await Promise.allSettled([listCustomUnits(rid),listStockItems(rid)]);
    if (!guard.current.isCurrent(request)) return;
    if (unitResult.status === 'fulfilled') setUnits(unitResult.value);
    else setError(unitResult.reason instanceof Error ? unitResult.reason.message : t('workspaceLoadError'));
    if (stockResult.status === 'fulfilled') setItems(stockResult.value);
    else setUsageError(stockResult.reason instanceof Error ? stockResult.reason.message : t('workspaceLoadError'));
    setLoading(false);
  }, [rid,t]);
  useEffect(() => { const current = guard.current; void reload(); return () => current.invalidate(); },[reload]);

  const usage = useMemo(() => {
    const result = new Map<number,StockItem[]>();
    for (const item of items) for (const conversion of item.unit_conversions ?? []) {
      if (conversion.base_quantity <= 0) continue;
      const used = result.get(conversion.custom_unit_id) ?? [];
      if (!used.some(value => value.id === item.id)) used.push(item);
      result.set(conversion.custom_unit_id,used);
    }
    return result;
  }, [items]);

  const remove = async () => {
    if (!canManage || !removing || deleteLock.current || usageError) return;
    const unit = removing;
    deleteLock.current = true; setDeleting(true); setDeleteError('');
    try {
      await deleteCustomUnit(rid,unit.id);
      setUnits(previous => previous.filter(value => value.id !== unit.id));
      setItems(previous => previous.map(value => ({...value,unit_conversions:value.unit_conversions?.filter(conversion => conversion.custom_unit_id !== unit.id)})));
      setRemoving(null); setNotice(t('unitsDeletedNotice').replace('{name}',unit.name));
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { deleteLock.current = false; setDeleting(false); }
  };

  return <div className="space-y-5">
    <PageHead title={t('units')} desc={<>{t('unitsLibrarySubtitle')} <Link href={`/${rid}/kitchen/stock`} className="text-[var(--brand-ink)] underline underline-offset-4">{t('unitsGoToStock')}</Link></>}
      actions={canManage ? <Button size="lg" disabled={loading || !!error} onClick={() => {setNotice('');setEditing('new');}}><Plus/>{t('addUnit')}</Button> : undefined}/>
    <StockSettingsNav/>
    {notice && <p role="status" className="text-sm text-[var(--success-500)]">{notice}</p>}
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
    : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"><p className="text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
    : <>
      {usageError && <div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--warning-50)] p-4 text-sm space-y-3"><p className="text-[var(--warning-500)]">{t('unitsUsageUnavailable')}</p><p>{usageError}</p><Button size="lg" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>}
      {units.length === 0 ? <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-10 text-center space-y-3"><Ruler aria-hidden className="mx-auto size-8 text-fg-secondary"/><h2 className="text-lg font-semibold">{t('noCustomUnits')}</h2><p className="mx-auto max-w-md text-sm text-fg-secondary">{t('noCustomUnitsHint')}</p></div>
      : <div className="max-w-5xl divide-y divide-[var(--line)] rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        {units.map(unit => <section key={unit.id} aria-label={unit.name} className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-base font-semibold">{unit.name}</h2>{unit.abbreviation && <bdi className="rounded-r-sm bg-[var(--surface-2)] px-2 py-1 text-xs text-fg-secondary">{unit.abbreviation}</bdi>}</div>
              {usageError ? <p className="mt-2 text-sm text-fg-secondary">{t('unitsUsageUnknown')}</p> : <UnitUsage rid={rid} unit={unit} items={usage.get(unit.id) ?? []}/>}
            </div>
            {canManage && <div className="flex shrink-0 gap-1"><Button size="lg" icon variant="ghost" aria-label={`${t('edit')} — ${unit.name}`} onClick={() => {setNotice('');setEditing(unit);}}><Pencil/></Button><Button size="lg" icon variant="ghost" disabled={!!usageError || deleting} aria-label={`${t('delete')} — ${unit.name}`} onClick={() => {setDeleteError('');setRemoving(unit);}}><Trash2/></Button></div>}
          </div>
        </section>)}
      </div>}
    </>}
    {editing && <UnitForm key={editing === 'new' ? 'new' : editing.id} rid={rid} editing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={unit => {
      setUnits(previous => previous.some(value => value.id === unit.id) ? previous.map(value => value.id === unit.id ? unit : value) : [...previous,unit]);
      setEditing(null); setNotice(t('saved'));
    }}/>}
    {removing && <Modal title={t('delete')} subtitle={removing.name} closeDisabled={deleting} onClose={() => {if (!deleteLock.current) setRemoving(null);}}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={deleting} onClick={() => setRemoving(null)}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={deleting} onClick={() => void remove()}>{t(deleting ? 'saving' : 'delete')}</Button></div>}>
      <p className="text-sm leading-relaxed text-fg-secondary">{t('deleteUnitConfirm')}</p><p className="mt-3 text-sm">{t('unitsUsageCount').replace('{count}',String(usage.get(removing.id)?.length ?? 0))}</p>
      {deleteError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{deleteError}</p>}
    </Modal>}
  </div>;
}

function UnitUsage({rid,unit,items}: {rid:number; unit:CustomUnit; items:StockItem[]}) {
  const {t} = useI18n();
  if (items.length === 0) return <p className="mt-2 text-sm text-fg-secondary">{t('unitsUsageNone')}</p>;
  const label = items.length === 1 ? t('unitsUsageOne') : t('unitsUsageCount').replace('{count}',String(items.length));
  return <details className="group mt-1">
    <summary aria-label={`${unit.name} — ${label}`} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-r-sm text-sm text-[var(--brand-ink)]"><ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-180"/>{label}</summary>
    <ul className="space-y-1 border-s border-[var(--line)] ps-3">
      {items.map(item => {
        const conversion = item.unit_conversions?.find(value => value.custom_unit_id === unit.id);
        return <li key={item.id}><Link href={`/${rid}/kitchen/stock?edit=${item.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-r-sm py-2 text-sm hover:text-[var(--brand-ink)]"><span className="break-words underline underline-offset-4">{item.name}</span>{conversion && <bdi dir="ltr" className="text-xs tabular-nums text-fg-secondary">{conversion.base_quantity} {item.unit}</bdi>}</Link></li>;
      })}
    </ul>
  </details>;
}

function UnitForm({rid,editing,onClose,onSaved}: {rid:number; editing?:CustomUnit; onClose:()=>void; onSaved:(unit:CustomUnit)=>void}) {
  const {t} = useI18n();
  const {hasAnyPermission} = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [name,setName] = useState(editing?.name ?? '');
  const [abbreviation,setAbbreviation] = useState(editing?.abbreviation ?? '');
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [discard,setDiscard] = useState(false);
  const lock = useRef(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const dirty = name !== (editing?.name ?? '') || abbreviation !== (editing?.abbreviation ?? '');
  const close = () => { if (!lock.current) { if (dirty) setDiscard(true); else onClose(); } };
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => {if (dirty || lock.current) {event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const submit = async (event:React.FormEvent) => {
    event.preventDefault();if (!canManage || !name.trim() || lock.current) return;
    lock.current = true;setSaving(true);setError('');
    try {
      const payload = {name:name.trim(),abbreviation:abbreviation.trim()};
      const saved = editing ? await updateCustomUnit(rid,editing.id,payload) : await createCustomUnit(rid,payload);
      onSaved(saved);
    } catch (cause) {setError(cause instanceof Error ? cause.message : t('saveFailed'));}
    finally {lock.current = false;setSaving(false);}
  };
  return <>
    <Modal title={t(editing ? 'editUnit' : 'addUnit')} initialFocusRef={firstInput} closeDisabled={saving} onClose={close}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={!canManage || !name.trim() || saving}>{t(saving ? 'saving' : 'save')}</Button></div>}>
      <form id={formId} onSubmit={submit}><fieldset disabled={saving || !canManage} className="min-w-0 space-y-4">
        <Field label={t('unitNameLabel')}><Input required ref={firstInput} className="min-h-11" value={name} onChange={event => setName(event.target.value)} placeholder={t('unitNamePlaceholder')}/></Field>
        <Field label={t('unitAbbrLabel')} hint={t('optional')}><Input aria-label={t('unitAbbrLabel')} className="min-h-11" value={abbreviation} onChange={event => setAbbreviation(event.target.value)} placeholder={t('unitAbbrPlaceholder')}/></Field>
      </fieldset></form>
      {editing && name !== editing.name && <p className="mt-4 text-sm text-[var(--warning-500)]">{t('unitsRenameHint')}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{error}</p>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}
