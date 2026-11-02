'use client';

import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

/** Confirms article persistence while making the separate carte publication explicit. */
export default function ItemMenuSaveNotice({ names, onClose }: { names: string[]; onClose: () => void }) {
  const { t } = useI18n();
  return <Modal title={t('itemMenuSavedTitle')} onClose={onClose} footer={<Button type="button" variant="primary" onClick={onClose}>{t('done')}</Button>}>
    <p>{t('itemMenuDraftSaved').replace('{menus}', names.join(', '))}</p>
  </Modal>;
}
