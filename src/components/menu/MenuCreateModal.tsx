'use client';

import { useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { ConfirmDialog } from '@/components/ds';
import { createMenu, updateMenu, setMenuHours, type MenuAvailabilityHour } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { MenuHoursEditor, menuHoursAreComplete } from './MenuHoursEditor';

/** Menu creation retains its server ID if a later hours request must be retried. */
export default function MenuCreateModal({ restaurantId, onClose, onSaved }: {
  restaurantId: number;
  onClose: (created?: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [pos, setPos] = useState(true);
  const [web, setWeb] = useState(true);
  const [follows, setFollows] = useState(true);
  const [hours, setHours] = useState<MenuAvailabilityHour[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const createdId = useRef<number | null>(null);
  const savingRef = useRef(false);
  const dirty = !!name || !active || !pos || !web || !follows || hours.length > 0;
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(!!createdId.current); } };
  const save = async () => {
    if (!name.trim() || savingRef.current) return;
    if (!follows && !menuHoursAreComplete(hours)) { setError(t('menuIncompleteHours')); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const input = { name, is_active: active, pos_enabled: pos, web_enabled: web, follows_restaurant_hours: follows };
      const saved = createdId.current ? await updateMenu(restaurantId, createdId.current, input) : await createMenu(restaurantId, input);
      createdId.current = saved.id;
      if (!follows) await setMenuHours(restaurantId, saved.id, hours.map(({ day_of_week, open_time, close_time, is_closed }) => ({ day_of_week, open_time, close_time, is_closed })));
      onSaved();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : t('libraryOperationFailed');
      setError(createdId.current ? `${t('menuCreatedHoursIncomplete')} ${detail}` : detail);
    } finally { savingRef.current = false; setSaving(false); }
  };
  return <>
    <Modal title={t('createMenu')} onClose={close} size="lg" footer={<div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={close} className="btn-secondary">{t('cancel')}</button><button type="submit" form="menu-create" disabled={saving || !name.trim()} className="btn-primary">{saving ? t('saving') : t('save')}</button></div>}>
      <form id="menu-create" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={saving}>
        <fieldset disabled={saving} className="space-y-5">
          <div><label htmlFor="menu-create-name" className="mb-2 block text-sm font-medium">{t('menuName')}</label><input id="menu-create-name" autoFocus required className="input" value={name} onChange={event => setName(event.target.value)} /></div>
          <fieldset className="rounded-r-md bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]"><legend className="sr-only">{t('channels')}</legend><p className="mb-2 text-sm font-semibold">{t('channels')}</p><div className="flex flex-wrap gap-6"><label className="flex min-h-11 items-center gap-3 text-sm selection-row"><input type="checkbox" className="size-4" checked={pos} onChange={event => setPos(event.target.checked)} />POS</label><label className="flex min-h-11 items-center gap-3 text-sm selection-row"><input type="checkbox" className="size-4" checked={web} onChange={event => setWeb(event.target.checked)} />Web</label></div></fieldset>
          <label className="flex min-h-11 items-center gap-3 text-sm selection-row"><input type="checkbox" className="size-4" checked={active} onChange={event => setActive(event.target.checked)} />{t('active')}</label>
          <div><h3 className="mb-2 text-sm font-semibold">{t('availability')}</h3><label className="mb-4 flex min-h-11 items-center gap-3 text-sm selection-row"><input type="checkbox" className="size-4" checked={follows} onChange={event => setFollows(event.target.checked)} />{t('followsRestaurantHours')}</label>{!follows && <MenuHoursEditor hours={hours} onChange={setHours} disabled={saving} />}</div>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      </form>
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t(createdId.current ? 'menuPartialClose' : 'libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => onClose(!!createdId.current)} />
  </>;
}
