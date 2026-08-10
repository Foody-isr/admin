// Présentation pure des diagnostics de lignes de brouillon.
//
// Séparé de draftLines.ts à dessein : ce module-là diagnostique (est-ce que
// cette ligne a un problème, et lequel) ; celui-ci ne diagnostique rien, il
// traduit un LineIssue déjà connu en texte affichable et en décisions
// d'interface (quelle couleur, quelles actions, est-ce que ça bloque). `t`
// est injecté plutôt qu'importé pour rester testable sans React ni contexte
// i18n.
//
// Pur : ni React, ni réseau, ni horloge.

import type { LineIssue } from './draftLines';

/** Compose le libellé affiché sur une ligne signalée. L'ordre des cas suit
 *  celui de `LineIssue` : un seul de `missing` / `sold_out` / `price_changed`
 *  / `combo_part` est jamais vrai à la fois (voir `diagnose` dans
 *  draftLines.ts), donc pas de priorité à arbitrer ici. */
export function issueLabel(issue: LineIssue, t: (key: string) => string): string {
  switch (issue.kind) {
    case 'missing':
      return t('draftIssueMissing');
    case 'sold_out':
      return t('draftIssueSoldOut');
    case 'price_changed':
      return t('draftIssuePriceChanged')
        .replace('{was}', String(issue.was))
        .replace('{now}', String(issue.now));
    case 'combo_part':
      return (issue.reason === 'missing' ? t('draftIssueComboMissing') : t('draftIssueComboSoldOut'))
        .replace('{name}', issue.partName);
  }
}

/** Ton visuel du diagnostic : `price_changed` reste commandable (avertissement),
 *  les trois autres cas non (danger). */
export function issueTone(issue: LineIssue): 'danger' | 'warning' {
  return issue.kind === 'price_changed' ? 'warning' : 'danger';
}

/** Seul `price_changed` laisse l'article commandable tel quel : le prix
 *  affiché vient déjà de `lineUnitPrice` sur l'article courant, et le
 *  serveur recalcule le total autoritatif à la création. Sur les trois
 *  autres cas l'article ne peut de toute façon pas être envoyé en cuisine,
 *  donc seule l'action Retirer a du sens. */
export function issueCanBeAccepted(issue: LineIssue): boolean {
  return issue.kind === 'price_changed';
}

/** Une seule ligne signalée suffit à bloquer la validation : chaque
 *  diagnostic doit être traité (accepté ou retiré) avant d'envoyer la
 *  commande en cuisine. */
export function isSubmissionBlocked(issues: Map<string, LineIssue>): boolean {
  return issues.size > 0;
}
