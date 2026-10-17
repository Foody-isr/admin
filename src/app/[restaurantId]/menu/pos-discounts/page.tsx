'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Tag } from 'lucide-react';
import { listPOSDiscounts, savePOSDiscount, type POSDiscountDefinition } from '@/lib/api';
import { validPOSDiscount } from '@/lib/pos-discount-form';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Drawer, Input, Select, BooleanInput } from '@/components/ds';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell, ListToolbar } from '@/components/data-table';

/** Restaurant-owned staff discounts used by Actions → Discounts in Foody POS. */
export default function POSDiscountsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return <POSDiscountsWorkspace key={restaurantId} rid={Number(restaurantId)} />;
}

function POSDiscountsWorkspace({rid}:{rid:number}) {
  const { t } = useI18n(), {symbol:currency} = useCurrency();
  const { hasPermission:has } = usePermissions();
  const canView = has('menu.view') || has('menu.edit'), canEdit = has('menu.edit');
  const [rows, setRows] = useState<POSDiscountDefinition[]>([]), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const [editor, setEditor] = useState<POSDiscountDefinition | null>(null);
  const scope = useRef(rid); scope.current = rid;
  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try { const data = await listPOSDiscounts(rid); if (scope.current === rid) setRows(data); }
    catch { if (scope.current === rid) setFailed(true); }
    finally { if (scope.current === rid) setLoading(false); }
  }, [rid, canView]);
  useEffect(() => { setRows([]); setEditor(null); void load(); }, [load]);
  const typeLabel = (row: POSDiscountDefinition) => row.variable ? t(row.type === 'percent' ? 'posDiscountVariablePercent' : 'posDiscountVariableAmount') : row.type === 'percent' ? `${row.value} %` : `${currency}${row.value.toFixed(2)}`;
  const filtered = rows.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (!canView) return <p>{t('noPermission')}</p>;
  return <div className="min-w-0 space-y-6">
    <h1 className="text-[28px] font-bold">{t('posStaffDiscounts')}</h1>
    <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }} actions={<Button disabled={!canEdit} onClick={() => setEditor({ id: crypto.randomUUID(), name: '', type: 'fixed', variable: false, value: 0, active: true, version: 0 })}>{t('createDiscount')}</Button>} />
    {failed ? <Button variant="secondary" onClick={() => void load()}>{t('posDiscountFailed')}</Button> : loading ? <p>{t('loading')}</p> : <DataTable>
      <DataTableHead><DataTableHeadCell>{t('discountName')}</DataTableHeadCell><DataTableHeadCell>{t('discountValue')}</DataTableHeadCell><DataTableHeadCell>{t('status')}</DataTableHeadCell></DataTableHead>
      <DataTableBody>{filtered.map(row => <DataTableRow key={row.id} onClick={canEdit ? () => setEditor(row) : undefined}>
        <DataTableCell><span className="flex items-center gap-3"><Tag size={20} />{row.name}</span></DataTableCell><DataTableCell>{typeLabel(row)}</DataTableCell><DataTableCell>{t(row.active ? 'active' : 'inactive')}</DataTableCell>
      </DataTableRow>)}</DataTableBody>
    </DataTable>}
    {!loading && !failed && filtered.length === 0 && <p className="text-muted-foreground">{t('posDiscountNone')}</p>}
    {editor && <DiscountEditor key={`${rid}:${editor.id}`} initial={editor} enabled={canEdit} onClose={() => setEditor(null)} onSave={async value => {
      if (scope.current !== rid || !canEdit) throw new Error('Restaurant changed');
      const saved = await savePOSDiscount(rid, value);
      if (scope.current !== rid) throw new Error('Restaurant changed');
      setRows(previous => previous.some(row => row.id === saved.id) ? previous.map(row => row.id === saved.id ? saved : row) : [...previous, saved]);
    }} />}
  </div>;
}

function DiscountEditor({ initial, enabled, onSave, onClose }: { initial: POSDiscountDefinition; enabled: boolean; onSave: (value: POSDiscountDefinition) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n(), {symbol:currency} = useCurrency();
  const [value, setValue] = useState(initial), [amount, setAmount] = useState(initial.value ? String(initial.value) : '');
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const desired = { ...value, name: value.name.trim(), value: value.variable ? 0 : Number(amount.replace(',', '.')) };
  const save = async () => {
    if (lock.current || !enabled || !validPOSDiscount(desired)) return;
    lock.current = true; setSaving(true); setFailed(false);
    try { await onSave(desired); onClose(); }
    catch { setFailed(true); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Drawer open onOpenChange={open => { if (!open && !lock.current) onClose(); }} title={initial.version ? initial.name : t('createDiscount')} onSave={save} saveDisabled={!enabled || saving || !validPOSDiscount(desired)} closeDisabled={saving}>
    <fieldset disabled={!enabled || saving} className="space-y-6">
      <label className="block space-y-2"><span className="font-semibold">{t('discountName')}</span><Input maxLength={80} value={value.name} onChange={event => setValue(previous => ({ ...previous, name: event.target.value }))} /></label>
      <label className="block space-y-2"><span className="font-semibold">{t('discountType')}</span><Select value={`${value.type}:${value.variable}`} onChange={event => { const [type, variable] = event.target.value.split(':'); setValue(previous => ({ ...previous, type: type as 'fixed' | 'percent', variable: variable === 'true' })); }}>
        <option value="fixed:false">{t('posDiscountFixedAmount')}</option><option value="percent:false">{t('posDiscountFixedPercent')}</option><option value="fixed:true">{t('posDiscountVariableAmount')}</option><option value="percent:true">{t('posDiscountVariablePercent')}</option>
      </Select></label>
      {!value.variable && <label className="block space-y-2"><span className="font-semibold">{t('discountValue')} ({value.type === 'percent' ? '%' : currency})</span><Input type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>}
      <label className="flex items-center justify-between gap-4"><span className="font-semibold">{t('active')}</span><BooleanInput checked={value.active} onChange={event => setValue(previous => ({ ...previous, active: event.target.checked }))} /></label>
      {failed && <p role="alert" className="text-destructive">{t('posDiscountFailed')}</p>}
    </fieldset>
  </Drawer>;
}
