'use client';

import { Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

export interface KPIInfo { key: string }

/** Translated explanations of the indicators used by catalogue and item screens. */
export default function KPIInfoModal({ kpiInfo, onClose }: { kpiInfo: KPIInfo | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!kpiInfo) return null;
  const content = (field: string) => t(`kpiHelp_${kpiInfo.key.replace(/-/g, '_')}_${field}`);
  return (
    <Modal title={content('title')} icon={<Info/>} size="xl" onClose={onClose}
      footer={<div className="flex justify-end"><Button variant="secondary" size="lg" onClick={onClose}>{t('close')}</Button></div>}>
      <div className="space-y-5 text-sm leading-relaxed">
        <p className="text-fg-secondary">{content('description')}</p>
        <section className="space-y-2"><h3 className="font-semibold">{t('kpiHelpFormula')}</h3><p className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3">{content('formula')}</p></section>
        <section className="space-y-2"><h3 className="font-semibold">{t('kpiHelpExample')}</h3><p className="text-fg-secondary">{content('example')}</p></section>
        <section className="space-y-2"><h3 className="font-semibold">{t('kpiHelpInterpretation')}</h3><p className="text-fg-secondary">{content('interpretation')}</p></section>
      </div>
    </Modal>
  );
}

/** Definitions for reachable KPI help actions; copy lives in the shared dictionaries. */
export const KPI_INFO: Record<string, KPIInfo> = Object.fromEntries(
  ['total-articles', 'disponibles', 'revenu-moyen', 'rupture-stock', 'item-food-cost', 'item-margin'].map(key => [key, {key}]),
);
