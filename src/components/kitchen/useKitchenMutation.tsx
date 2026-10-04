'use client';

import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Retain a confirmed kitchen mutation while retrying its subsequent refresh. */
export function useKitchenMutation<T>(fingerprint: string, onClose: () => void) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const [baseline,setBaseline] = useState(fingerprint);
  const lock = useRef(false);
  const receipt = useRef<{ value: T } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dirty = fingerprint !== baseline;
  const close = () => {
    if (lock.current) return;
    if (dirty && !receipt.current) setDiscard(true);
    else onClose();
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ((dirty && !receipt.current) || lock.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const run = async (persist: () => Promise<T>, refresh: (result: T) => Promise<void>) => {
    if (!canManage || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!receipt.current) { receipt.current = { value: await persist() }; setSaved(true); }
      await refresh(receipt.current.value);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('saveFailed')); }
    finally { lock.current = false; setBusy(false); }
  };
  return {
    acceptBaseline:()=>setBaseline(fingerprint),
    busy, saved, canManage, frozen: busy || saved || !canManage, error, dirty, close, run,
    feedback: <>{saved && <p role="status" className="text-sm">{t('supplierChangeSavedRefresh')}</p>}{error && <p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}</>,
    confirmation: <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} />,
  };
}
