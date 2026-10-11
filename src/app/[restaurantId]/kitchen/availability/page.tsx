'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  listAvailabilityRules, createAvailabilityRule, updateAvailabilityRule, deleteAvailabilityRule,
  type AvailabilityRule, type AvailabilityRuleInput, type OutOfStockBehavior,
} from '@/lib/api';
import { Badge, Button, ConfirmDialog, Field, Input, NumberField, PageHead, Select } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { FeatureIntro } from '@/components/help/FeatureIntro';
import StockSettingsNav from '@/components/settings/StockSettingsNav';

const BLANK: AvailabilityRuleInput = {
  name: '', track: true, low_stock_threshold: 5, out_of_stock_behavior: 'sold_out',
  show_count: true, is_default: false, sort_order: 0,
};

/** Reusable availability rules with explicit default and recipe-stock behavior. */
export default function AvailabilityRulesPage() {
  const { restaurantId } = useParams();
  return <RulesWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}

function RulesWorkspace({rid}: {rid:number}) {
  const {t} = useI18n();
  const {hasAnyPermission} = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [rules,setRules] = useState<AvailabilityRule[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [editing,setEditing] = useState<AvailabilityRule | 'new' | null>(null);
  const [removing,setRemoving] = useState<AvailabilityRule | null>(null);
  const [deleting,setDeleting] = useState(false);
  const [deleteError,setDeleteError] = useState('');
  const [notice,setNotice] = useState('');
  const lock = useRef(false);
  const guard = useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const reload = useCallback(async () => {
    const request = guard.current.begin(rid);
    setLoading(true); setError('');
    try {
      const result = await listAvailabilityRules(rid);
      if (guard.current.isCurrent(request)) setRules(result);
    } catch (cause) {
      if (guard.current.isCurrent(request)) setError(cause instanceof Error ? cause.message : t('availabilityFailedToLoad'));
    } finally { if (guard.current.isCurrent(request)) setLoading(false); }
  },[rid,t]);
  useEffect(() => {const current = guard.current;void reload();return () => current.invalidate();},[reload]);

  const remove = async () => {
    if (!canManage || !removing || removing.is_default || lock.current) return;
    const id = removing.id;
    lock.current = true; setDeleting(true); setDeleteError('');
    try {
      await deleteAvailabilityRule(rid,id);
      setRules(previous => previous.filter(rule => rule.id !== id));
      setRemoving(null); setNotice(t('availabilityDeleted'));
    } catch (cause) {setDeleteError(cause instanceof Error ? cause.message : t('availabilityCouldNotDelete'));}
    finally {lock.current = false; setDeleting(false);}
  };

  return <div className="space-y-5">
    <PageHead title={t('availabilityRulesTitle')} desc={t('availabilityLibraryHint')}
      actions={canManage ? <Button size="lg" disabled={loading || !!error} onClick={() => {setNotice('');setEditing('new');}}><Plus/>{t('availabilityNewRule')}</Button> : undefined}/>
    <StockSettingsNav/>
    <FeatureIntro feature="availability"/>
    {notice && <p role="status" className="text-sm text-[var(--success-500)]">{notice}</p>}
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
      : error ? <div role="alert" className="space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
      : rules.length === 0 ? <p className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-fg-secondary">{t('availabilityNoRules')}</p>
      : <div className="max-w-5xl divide-y divide-[var(--line)] rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
        {rules.map(rule => <section key={rule.id} aria-label={rule.name} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-base font-semibold">{rule.name}</h2>{rule.is_default && <Badge tone="info">{t('availabilityDefaultTag')}</Badge>}</div>
              <p className="mt-2 text-sm text-fg-secondary">{t(rule.track ? 'availabilityTracksStock' : 'availabilityAlwaysAvailableDesc')}</p></div>
            {canManage && <div className="flex shrink-0 gap-1"><Button size="lg" icon variant="ghost" aria-label={`${t('edit')} — ${rule.name}`} onClick={() => {setNotice('');setEditing(rule);}}><Pencil/></Button>{!rule.is_default && <Button size="lg" icon variant="ghost" aria-label={`${t('delete')} — ${rule.name}`} onClick={() => {setDeleteError('');setRemoving(rule);}}><Trash2/></Button>}</div>}
          </div>
          {rule.track ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-fg-secondary">{t('availabilityThresholdLabel')}</dt><dd className="mt-1 font-medium">{rule.low_stock_threshold > 0 ? <>{t('availabilityWarnAtMost')} <bdi>{rule.low_stock_threshold}</bdi></> : t('availabilityThresholdOff')}</dd></div>
            <div><dt className="text-fg-secondary">{t('availabilityWhenOutOfStock')}</dt><dd className="mt-1 font-medium">{t(rule.out_of_stock_behavior === 'hide' ? 'availabilityHideWhenOut' : 'availabilitySoldOutBadge')}</dd></div>
            <div><dt className="text-fg-secondary">{t('availabilityCustomerCount')}</dt><dd className="mt-1 font-medium">{t(rule.show_count ? 'availabilityShowsCount' : 'availabilityGenericBadge')}</dd></div>
          </dl> : !rule.is_default && <p className="mt-3 text-sm text-[var(--warning-500)]">{t('availabilityRuleDeprecated')}</p>}
        </section>)}
      </div>}
    {editing && <RuleForm key={editing === 'new' ? 'new' : editing.id} rid={rid} rule={editing === 'new' ? undefined : editing} nextOrder={rules.length} onClose={() => setEditing(null)} onSaved={rule => {
      setRules(previous => {
        const updated = previous.map(value => value.id === rule.id ? rule : rule.is_default ? {...value,is_default:false} : value);
        return previous.some(value => value.id === rule.id) ? updated : [...updated,rule];
      });
      setEditing(null);setNotice(t('saved'));
    }}/>}
    {removing && <Modal title={t('delete')} subtitle={removing.name} onClose={() => {if (!lock.current) setRemoving(null);}} closeDisabled={deleting}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={deleting} onClick={() => setRemoving(null)}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={deleting} onClick={() => void remove()}>{t(deleting ? 'saving' : 'delete')}</Button></div>}>
      <p className="text-sm leading-relaxed text-fg-secondary">{t('availabilityDeleteConfirm')}</p>
      {deleteError && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{deleteError}</p>}
    </Modal>}
  </div>;
}

function RuleForm({rid,rule,nextOrder,onClose,onSaved}: {rid:number;rule?:AvailabilityRule;nextOrder:number;onClose:()=>void;onSaved:(rule:AvailabilityRule)=>void}) {
  const {t} = useI18n();
  const {hasAnyPermission} = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [initial] = useState<AvailabilityRuleInput>(() => rule ? {
    name:rule.name,track:rule.track,low_stock_threshold:rule.low_stock_threshold,out_of_stock_behavior:rule.out_of_stock_behavior,
    show_count:rule.show_count,is_default:rule.is_default,sort_order:rule.sort_order,
  } : {...BLANK,sort_order:nextOrder});
  const [draft,setDraft] = useState(initial);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [discard,setDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const first = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const formId = useId();
  const close = () => {if (!lock.current) {if (dirty) setDiscard(true);else onClose();}};
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => {if (dirty || lock.current) {event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const submit = async (event:React.FormEvent) => {
    event.preventDefault();if (!canManage || !draft.name.trim() || lock.current) return;
    lock.current = true;setSaving(true);setError('');
    try {
      const payload = {...draft,name:draft.name.trim()};
      const result = rule ? await updateAvailabilityRule(rid,rule.id,payload) : await createAvailabilityRule(rid,payload);
      onSaved(result);
    } catch (cause) {setError(cause instanceof Error ? cause.message : t('availabilityCouldNotSave'));}
    finally {lock.current = false;setSaving(false);}
  };
  return <>
    <Modal title={t(rule ? 'availabilityEditRule' : 'availabilityNewRule')} size="lg" initialFocusRef={first} onClose={close} closeDisabled={saving}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={close}>{t('cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={!canManage || !draft.name.trim() || saving}>{t(saving ? 'saving' : 'save')}</Button></div>}>
      <form id={formId} onSubmit={submit}><fieldset disabled={saving || !canManage} className="min-w-0 space-y-5">
        <Field label={t('availabilityRuleName')}><Input className="min-h-11" required ref={first} value={draft.name} onChange={event => setDraft({...draft,name:event.target.value})} placeholder={t('availabilityRuleNamePlaceholder')}/></Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium selection-row"><input type="checkbox" className="size-5 shrink-0 accent-[var(--brand-ink)]" checked={draft.track} onChange={event => setDraft({...draft,track:event.target.checked})}/>{t('availabilityTrackRecipeStock')}</label>
        {draft.track && <div className="space-y-5 border-s-2 border-[var(--line)] ps-4">
          <Field label={t('availabilityLowStockField')}><NumberField className="min-h-11" value={draft.low_stock_threshold} format={String} min={0} integer onChange={value => setDraft({...draft,low_stock_threshold:Math.max(0,value)})}/></Field>
          <Field label={t('availabilityWhenOutOfStock')}><Select className="min-h-11" value={draft.out_of_stock_behavior} onChange={event => setDraft({...draft,out_of_stock_behavior:event.target.value as OutOfStockBehavior})}><option value="sold_out">{t('availabilityShowSoldOutBadge')}</option><option value="hide">{t('availabilityHideFromMenu')}</option></Select></Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm selection-row"><input type="checkbox" className="size-5 shrink-0 accent-[var(--brand-ink)]" checked={draft.show_count} onChange={event => setDraft({...draft,show_count:event.target.checked})}/>{t('availabilityShowRemainingCount')}</label>
        </div>}
        <div className="border-t border-[var(--line)] pt-3"><label className="flex min-h-11 items-center gap-3 text-sm font-medium selection-row"><input type="checkbox" className="size-5 shrink-0 accent-[var(--brand-ink)]" disabled={rule?.is_default} checked={draft.is_default} onChange={event => setDraft({...draft,is_default:event.target.checked})}/>{t('availabilityUseAsDefault')}</label><p className="mt-1 text-sm text-fg-secondary">{t(rule?.is_default ? 'availabilityDefaultLocked' : 'availabilityDefaultImpact')}</p></div>
      </fieldset></form>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{error}</p>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}
