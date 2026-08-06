'use client';

// Propose les fiches qui désignent probablement la même personne. Rien n'est
// fusionné sans clic : une suggestion reste une suggestion, parce qu'une fusion
// erronée mêle deux historiques dans tous les rapports.
//
// « Ignorer » est définitif pour la paire concernée, ce qui permet au bandeau de
// finir par se vider au lieu de proposer éternellement les mêmes faux positifs.
//
// Un groupe peut compter plus de deux fiches (même nom porté par 3+ numéros).
// Le serveur ne masque un groupe que lorsque TOUTES ses paires ont été
// ignorées (`allPairsDismissed`) : ignorer une seule paire d'un trio le
// laisserait réapparaître à l'identique au prochain chargement. « Ignorer »
// ignore donc systématiquement toutes les paires du groupe.

import { useCallback, useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  getCustomerDuplicates,
  dismissCustomerDuplicate,
  type DuplicateGroup,
} from '@/lib/api';
import { MergeCustomersModal, type MergeRow } from './MergeCustomersModal';

interface DuplicateSuggestionsProps {
  restaurantId: number;
  /** Appelé après toute fusion, pour que la liste des clients se recharge. */
  onChanged: () => void;
}

const groupKey = (g: DuplicateGroup) => `${g.reason}|${g.value}`;

export function DuplicateSuggestions({ restaurantId, onChanged }: DuplicateSuggestionsProps) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  // Groupe dont la fusion est en cours de confirmation. Le staff choisit le
  // numéro principal dans la modale existante : rien n'est présélectionné
  // silencieusement.
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);

  const load = useCallback(() => {
    getCustomerDuplicates(restaurantId).then(setGroups).catch(() => setGroups([]));
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  if (groups.length === 0) return null;

  const dismiss = async (g: DuplicateGroup) => {
    const key = groupKey(g);
    setBusyKey(key);
    setDismissError(null);
    try {
      for (let i = 0; i < g.customers.length; i++) {
        for (let j = i + 1; j < g.customers.length; j++) {
          await dismissCustomerDuplicate(restaurantId, g.customers[i].phone, g.customers[j].phone);
        }
      }
      load();
    } catch (err) {
      setDismissError(err instanceof Error ? err.message : t('failedToUpdateCustomer'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mb-[var(--s-4)] rounded-r-md border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-[var(--s-4)] py-[var(--s-3)] text-start"
      >
        <span className="text-fs-sm font-medium text-[var(--fg)]">
          {t('duplicatesBanner').replace('{n}', String(groups.length))}
        </span>
        <span className="flex items-center gap-[var(--s-2)] text-fs-sm text-[var(--fg-muted)]">
          {open ? t('duplicatesHide') : null}
          {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {groups.map((g) => {
            const key = groupKey(g);
            // Bloque les deux actions de CE groupe pendant un ignorer en cours,
            // ou pendant que sa propre fusion est en confirmation, pour éviter
            // un second clic sur des données en train de changer. Les autres
            // groupes restent utilisables.
            const rowBusy = busyKey === key || (mergeGroup ? groupKey(mergeGroup) === key : false);
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)]"
              >
                <Badge tone="neutral">
                  {g.reason === 'same_name' ? t('duplicatesReasonSameName') : t('duplicatesReasonSameAddress')}
                </Badge>
                <div className="flex-1 min-w-0 flex flex-wrap gap-[var(--s-4)]">
                  {g.customers.map((c) => (
                    <div key={c.phone} className="flex flex-col min-w-[9rem]">
                      <span className="text-fs-sm font-medium text-[var(--fg)] truncate">
                        {c.name || c.phone}
                      </span>
                      <span className="text-fs-xs text-[var(--fg-muted)]">
                        {c.phone} · {c.order_count} {t('orders')} · ₪{c.total_spent.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => dismiss(g)} disabled={rowBusy}>
                  {t('duplicatesDismiss')}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setMergeGroup(g)} disabled={rowBusy}>
                  {t('mergeCustomersSelected').replace('{n}', String(g.customers.length))}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {dismissError && (
        <div className="px-[var(--s-4)] pb-[var(--s-3)] text-fs-sm text-[var(--danger-500)]">
          {dismissError}
        </div>
      )}

      {mergeGroup && (
        <MergeCustomersModal
          restaurantId={restaurantId}
          rows={mergeGroup.customers.map<MergeRow>((c) => ({
            phone: c.phone,
            name: c.name,
            orders: c.order_count,
          }))}
          onClose={() => setMergeGroup(null)}
          onMerged={() => {
            setMergeGroup(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
