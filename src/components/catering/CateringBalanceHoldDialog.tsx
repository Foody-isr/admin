'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useI18n, useCurrency } from '@/lib/i18n';
import { getCateringBalanceHold, createCateringBalanceHold, actOnCateringBalanceHold, type CateringBalanceHold, type CateringEvent } from '@/lib/api';
import { cateringBalanceActions, cateringBalanceStatusKey } from '@/lib/catering-balance';

type Action = 'create' | 'capture' | 'release';

/** Manual balance management, kept separate from the already collected deposit. */
export default function CateringBalanceHoldDialog({ restaurantId, event, canEdit, onClose }: {
  restaurantId: number;
  event: CateringEvent;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const [view, setView] = useState<CateringBalanceHold | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getCateringBalanceHold(restaurantId, event.id).then(result => {
      if (active) setView(result);
    }).catch(() => { if (active) setError(t('catering_balance_load_error')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [restaurantId, event.id, t]);

  const execute = async (action: Action | 'refresh' | 'read') => {
    if (busy || (!canEdit && action !== 'read')) return;
    setBusy(true);
    setError('');
    setConfirm(null);
    setCopied(false);
    try {
      setView(await (action === 'read' ? getCateringBalanceHold(restaurantId, event.id)
        : action === 'create' ? createCateringBalanceHold(restaurantId, event.id)
          : actOnCateringBalanceHold(restaurantId, event.id, action)));
    } catch {
      // The server may have claimed an operation before a timeout. Reload only
      // persisted state, never automatically replay a financial mutation.
      setError(t('catering_balance_action_error'));
      try { setView(await getCateringBalanceHold(restaurantId, event.id)); }
      catch { setError(`${t('catering_balance_action_error')} ${t('catering_balance_load_error')}`); }
    } finally {
      setBusy(false);
    }
  };

  const actions = view ? cateringBalanceActions(view) : { create: false, settle: false };
  const copyLink = async () => {
    if (!view?.checkout_url) return;
    try { await navigator.clipboard.writeText(view.checkout_url); setCopied(true); }
    catch { setError(t('catering_balance_copy_error')); }
  };

  return (
    <Modal title={t('catering_balance_title')} subtitle={`${event.customer_name} · #${event.id}`} icon={<ShieldCheck />} size="lg" onClose={onClose} closeDisabled={busy}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>{t('close')}</Button><Button variant="secondary" disabled={busy} onClick={() => void execute(canEdit ? 'refresh' : 'read')}>{t('catering_balance_refresh')}</Button></div>}>
      <div className="space-y-5" aria-busy={busy}>
        <p className="text-sm leading-6 text-fg-secondary">{t('catering_balance_explanation')}</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {busy && <p role="status" className="text-sm text-fg-secondary">{t('loading')}</p>}
        {view && <>
          <dl className="divide-y divide-[var(--divider)] border-y border-[var(--divider)] tabular-nums">
            {([
              ['catering_balance_total', view.total], ['catering_balance_deposit', view.deposit_paid],
              ['catering_balance_due', view.balance_due], ['catering_balance_held', view.held_amount], ['catering_balance_captured', view.captured],
            ] as const).map(([label, amount]) => <div key={label} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-fg-secondary">{t(label)}</dt><dd className="font-semibold text-fg-primary">{money(amount)}</dd></div>)}
          </dl>
          <div role="status"><p className="font-semibold">{t(cateringBalanceStatusKey(view.status))}</p>{view.last_checked_at && <p className="mt-1 text-xs text-fg-tertiary">{t('catering_balance_checked')} {new Date(view.last_checked_at).toLocaleString()}</p>}</div>
          {view.checkout_url && <div className="space-y-2"><label className="block text-sm font-semibold" htmlFor="balance-checkout-url">{t('catering_balance_link')}</label><input id="balance-checkout-url" className="input text-sm" dir="ltr" readOnly value={view.checkout_url} onFocus={e => e.target.select()} /><Button variant="secondary" size="sm" onClick={() => void copyLink()}>{t(copied ? 'catering_balance_copied' : 'catering_balance_copy')}</Button><p className="text-xs leading-5 text-fg-secondary">{t('catering_balance_link_hint')}</p></div>}
          <p className="text-xs leading-5 text-fg-secondary">{t('catering_balance_expiry_hint')}</p>
          {canEdit && !confirm && <div className="flex flex-wrap gap-2">
            {actions.create && <Button disabled={busy} onClick={() => setConfirm('create')}>{t('catering_balance_create')}</Button>}
            {actions.settle && <><Button disabled={busy} onClick={() => setConfirm('capture')}>{t('catering_balance_capture')} {money(view.balance_due)}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm('release')}>{t('catering_balance_release')}</Button></>}
          </div>}
          {confirm && <div className="space-y-3 border-t border-[var(--divider)] pt-4"><p className="text-sm font-medium">{t(`catering_balance_confirm_${confirm}`).replace('{amount}', money(view.balance_due))}</p><div className="flex flex-wrap gap-2"><Button variant={confirm === 'release' ? 'danger' : 'primary'} disabled={busy} onClick={() => void execute(confirm)}>{t('confirm')}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('cancel')}</Button></div></div>}
        </>}
      </div>
    </Modal>
  );
}
