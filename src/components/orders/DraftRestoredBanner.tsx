'use client';

// Signale que le panier affiché vient d'un brouillon repris, et non d'une page
// vierge.
//
// Sans ce bandeau, la reprise automatique est dangereuse : le staff ouvre la
// page en croyant à un panier vide, ajoute les articles d'un autre client
// par-dessus, et envoie en cuisine une commande qui mélange deux personnes.

import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

interface DraftRestoredBannerProps {
  itemCount: number;
  issueCount: number;
  onDiscard: () => void;
}

export function DraftRestoredBanner({ itemCount, issueCount, onDiscard }: DraftRestoredBannerProps) {
  const { t } = useI18n();

  return (
    <div className="mb-[var(--s-4)] flex flex-wrap items-center gap-[var(--s-3)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] py-[var(--s-3)]">
      <span className="text-fs-sm text-[var(--fg)]">{t('draftRestored')}</span>
      <span className="text-fs-sm text-[var(--fg-muted)]">
        {t('draftRestoredItems').replace('{n}', String(itemCount))}
      </span>
      {issueCount > 0 && (
        <span className="text-fs-sm text-[var(--warning-500)]">
          {t('draftRestoredIssues').replace('{n}', String(issueCount))}
        </span>
      )}
      <div className="flex-1" />
      <Button variant="ghost" onClick={onDiscard}>{t('draftDiscard')}</Button>
    </div>
  );
}
