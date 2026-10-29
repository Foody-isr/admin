'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog } from '@/components/ds';
import { cashGuaranteeAction, type Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

type Guarantee = { status: string; amount_minor: number; currency: string; expires_at?: string };

/** Shows the reservation separately from received money; capture is always explicit. */
export function CashGuaranteePanel({ order }: { order: Order }) {
 const { t, locale } = useI18n();
 const { hasPermission } = usePermissions();
 const [current, setCurrent] = useState(order);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState(false);
 const [confirm, setConfirm] = useState(false);
 const pending = useRef(false);
 const scope = useRef(`${order.restaurant_id}:${order.id}`);
 scope.current = `${order.restaurant_id}:${order.id}`;
 useEffect(() => { setCurrent(order); }, [order]);
 const guarantee = current.external_metadata?.cash_guarantee as Guarantee | undefined;
 if (!guarantee) return null;
 const canAct = hasPermission('payments.manage');
 const canCapture = canAct && !busy && !error && guarantee.status === 'authorized' && current.payment_status === 'unpaid' && !['rejected','cancelled','refunded'].includes(current.status) && !!guarantee.expires_at && Date.parse(guarantee.expires_at) > Date.now();
 const act = async (action: 'capture' | 'refresh') => {
  if (pending.current) return;
  const requestScope = scope.current;
  pending.current = true; setBusy(true); setError(false);
  try {
   const response = await cashGuaranteeAction(current.restaurant_id, current.id, action);
   if (scope.current === requestScope) setCurrent(response.order);
  } catch { if (scope.current === requestScope) setError(true); }
  finally { pending.current = false; if (scope.current === requestScope) setBusy(false); }
 };
 const amount = new Intl.NumberFormat(locale, { style: 'currency', currency: guarantee.currency }).format(guarantee.amount_minor / 100);
 return <div className="space-y-3 rounded-r-md border border-[var(--line)] p-4" data-cash-guarantee>
  <p className="font-semibold">{t(current.payment_status === 'unpaid' && guarantee.status === 'authorized' ? 'cashGuaranteeTitle' : 'cashGuaranteeReceivedTitle')}</p>
  <p>{amount} · {t(`cashGuaranteeStatus_${guarantee.status}`)}</p>
  {guarantee.expires_at && guarantee.status === 'authorized' && <p className="text-[var(--fg-muted)]">{new Date(guarantee.expires_at).toLocaleString(locale)}</p>}
  {error && <p role="alert" className="text-[var(--danger-500)]">{t('cashGuaranteeError')}</p>}
  {canAct && <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => void act('refresh')}>{t('cashGuaranteeRefresh')}</Button>{canCapture && <Button type="button" onClick={() => setConfirm(true)}>{t('cashGuaranteeCapture')}</Button>}</div>}
  <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('cashGuaranteeConfirm')} confirmLabel={t('cashGuaranteeCapture')} cancelLabel={t('cancel')} onConfirm={() => { setConfirm(false); void act('capture'); }} />
 </div>;
}
