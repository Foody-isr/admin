'use client';

// Confirme une fusion de fiches client. Le staff choisit le numéro principal
// (celui qui servira pour WhatsApp et les appels) et voit ce qui sera regroupé
// avant de valider.
//
// La fusion est réversible : aucune commande n'est réécrite, seul un lien est
// posé. C'est ce qui permet de proposer l'opération sans avertissement anxiogène.

import { useState } from 'react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { mergeCustomers } from '@/lib/api';

export interface MergeRow {
  phone: string;
  name: string;
  orders: number;
}

interface MergeCustomersModalProps {
  restaurantId: number;
  rows: MergeRow[];
  onClose: () => void;
  onMerged: () => void;
}

export function MergeCustomersModal({ restaurantId, rows, onClose, onMerged }: MergeCustomersModalProps) {
  const { t } = useI18n();
  // Présélection : la fiche la plus active, c'est presque toujours le numéro
  // que le client donne quand on le rappelle. `orders` descendant, égalité
  // départagée par l'ordre stable d'arrivée (déterministe, pas l'ordre du Set).
  const [primary, setPrimary] = useState(
    [...rows].sort((a, b) => b.orders - a.orders)[0]?.phone ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await mergeCustomers(
        restaurantId,
        primary,
        rows.filter((r) => r.phone !== primary).map((r) => r.phone),
      );
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t('mergeCustomers')} onClose={onClose}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <fieldset>
          <legend className="text-fs-sm text-[var(--fg-muted)] mb-[var(--s-2)]">
            {t('mergeCustomersPrimary')}
          </legend>
          <div className="flex flex-col gap-[var(--s-2)]">
            {rows.map((r) => (
              <label key={r.phone} className="flex items-center gap-[var(--s-3)] cursor-pointer">
                <input
                  type="radio"
                  name="primary-phone"
                  checked={primary === r.phone}
                  onChange={() => setPrimary(r.phone)}
                  className="accent-brand-500"
                />
                <span className="flex-1 min-w-0 truncate">{r.name || r.phone}</span>
                <span className="text-fs-sm text-[var(--fg-muted)]">
                  {r.phone} · {t('orders')} {r.orders}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="text-fs-sm text-[var(--fg-muted)]">
          {t('mergeCustomersSummary')
            .replace('{orders}', String(totalOrders))
            .replace('{n}', String(rows.length))}
        </div>

        {error && <div className="text-fs-sm text-[var(--danger-500)]">{error}</div>}

        <div className="flex items-center justify-end gap-[var(--s-3)]">
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !primary}>
            {t('mergeCustomersConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
