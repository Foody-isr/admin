'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreparedStock, setPreparedStock, type PreparedStock } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Edits the independent shelf counter immediately, using its current revision. */
export function PreparedStockEditor({ rid, itemId }: { rid: number; itemId: number }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const [saved, setSaved] = useState<PreparedStock | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [quantity, setQuantity] = useState('0');
  const [until,setUntil]=useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0);
  const invalidateGeneration=useCallback(()=>{generation.current++;},[]);
  useEffect(() => {
    const current = ++generation.current;
    setSaved(null); setFailed(false); setBusy(true);
    getPreparedStock(rid,itemId).then(value=>{
      if (generation.current!==current) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.available_until) || !Number.isSafeInteger(value.revision) || value.revision<0 || value.quantity!==null && (!Number.isSafeInteger(value.quantity)||value.quantity<0)) throw new Error('Invalid prepared stock');
      setSaved(value); setUntil(value.available_until); setEnabled(value.quantity!==null); setQuantity(String(value.quantity??0));
    }).catch(()=>{if(generation.current===current)setFailed(true);}).finally(()=>{if(generation.current===current)setBusy(false);});
    return invalidateGeneration;
  },[rid,itemId,attempt,invalidateGeneration]);
  const next = enabled ? Number(quantity) : null;
  const valid = !enabled || /^\d{4}-\d{2}-\d{2}$/.test(until) && quantity.trim()!=='' && Number.isSafeInteger(next) && next!>=0 && next!<=1000000;
  const dirty = !!saved && (next!==saved.quantity || enabled && until!==saved.available_until);
  const save = async () => {
    if (!saved || busy || !valid || !dirty) return;
    const current = generation.current;
    setBusy(true); setFailed(false); setConfirmed(false);
    try {
      const value = await setPreparedStock(rid,itemId,next,saved.revision,until);
      if (generation.current!==current) return;
      if (enabled && value.available_until!==until || value.quantity!==next || !Number.isSafeInteger(value.revision) || value.revision<=saved.revision) throw new Error('Prepared stock save not confirmed');
      setSaved(value); setConfirmed(true);
    } catch { if(generation.current===current)setFailed(true); }
    finally { if(generation.current===current)setBusy(false); }
  };
  return <section className="item-prepared-stock-section space-y-3" aria-label={t('preparedStockTitle')}>
    <h3>{t('preparedStockTitle')}</h3>
    <p className="text-sm text-[var(--fg-muted)]">{t('preparedStockHint')}</p>
    {saved && <>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy||!hasAnyPermission('menu.edit')} onChange={event=>{setEnabled(event.target.checked);setConfirmed(false);}} />{t('preparedStockEnable')}</label>
      {enabled && <label className="block text-sm">{t('preparedStockQuantity')}<input className="mt-1 block rounded-md border border-[var(--line)] bg-[var(--bg)] p-2" type="number" min="0" max="1000000" step="1" dir="ltr" value={quantity} disabled={busy||!hasAnyPermission('menu.edit')} onChange={event=>{setQuantity(event.target.value);setConfirmed(false);}} /></label>}
      {enabled && <label className="block text-sm">{t('preparedStockUntil')}<input className="mt-1 block rounded-md border border-[var(--line)] bg-[var(--bg)] p-2" type="date" value={until} disabled={busy||!hasAnyPermission('menu.edit')} onChange={event=>{setUntil(event.target.value);setConfirmed(false);}} /></label>}
      <button type="button" className="item-settings-link" disabled={busy||!valid||!dirty||failed||!hasAnyPermission('menu.edit')} onClick={()=>void save()}>{t('apply')}</button>
    </>}
    {busy && <p role="status">{t('loading')}</p>}
    {confirmed && <p role="status">{t('preparedStockSaved')}</p>}
    {failed && <div role="alert"><p>{t('preparedStockError')}</p><button type="button" className="item-settings-link" disabled={busy} onClick={()=>setAttempt(value=>value+1)}>{t('preparedStockReload')}</button></div>}
  </section>;
}
