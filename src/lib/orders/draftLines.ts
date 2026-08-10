// Réhydratation d'un brouillon de panier, et diagnostic de ce qui a bougé
// pendant l'absence du staff.
//
// Réhydrater et revalider sont la même opération, délibérément : une ligne
// stockée ne porte que l'identifiant de son article, donc la retrouver dans le
// menu fraîchement chargé est exactement ce qui révèle qu'elle a disparu.
//
// Pur : ni React, ni réseau, ni horloge.

import type { DraftLine } from './orderDraft';
import type { MenuItem } from '@/lib/api';
import { lineUnitPrice, type NewOrderLine } from '@/components/orders/NewOrderItemModal';
import { isItemSoldOut } from './itemAvailability';

export type LineIssue =
  | { kind: 'missing' }
  | { kind: 'sold_out' }
  | { kind: 'price_changed'; was: number; now: number }
  | { kind: 'combo_part'; partName: string; reason: 'missing' | 'sold_out' };

export interface RehydratedLine {
  line: NewOrderLine;
  /** null quand rien n'a bougé. */
  issue: LineIssue | null;
}

/**
 * Reconstruit les lignes du panier depuis le brouillon et le menu courant, en
 * signalant au passage ce qui a changé.
 *
 * L'ordre des diagnostics n'est pas arbitraire : un article absent l'emporte
 * sur une rupture, qui l'emporte sur un changement de prix. Dire à quelqu'un
 * que le prix a changé sur une ligne qu'il ne peut de toute façon pas commander
 * ne l'aide pas à décider.
 */
export function rehydrateDraftLines(
  draftLines: DraftLine[],
  itemMap: Map<number, MenuItem>,
): RehydratedLine[] {
  // Un brouillon est fiable après JSON.parse au-delà de `version`/`savedAt`
  // (même contrat que itemDraft.ts) : une seule ligne corrompue, ou le tableau
  // lui-même absent d'une forme partiellement écrite, ne doit jamais faire
  // planter la page de commande. `sanitizeLine` ramène les champs manquants ou
  // mal typés à une valeur neutre avant qu'ils n'atteignent `lineUnitPrice`.
  if (!Array.isArray(draftLines)) return [];

  const out: RehydratedLine[] = [];

  for (const raw of draftLines) {
    const d = sanitizeLine(raw);
    const item = itemMap.get(d.itemId);

    // Sans l'article, on ne peut pas reconstruire une NewOrderLine exploitable.
    // On en fabrique une coquille portant le nom mémorisé, pour que la ligne
    // reste affichable et retirable plutôt que de disparaître en silence.
    if (!item) {
      out.push({
        line: shellLine(d),
        issue: { kind: 'missing' },
      });
      continue;
    }

    const line: NewOrderLine = {
      uid: d.uid,
      item,
      quantity: d.quantity,
      notes: d.notes,
      selectedVariantId: d.selectedVariantId,
      selectedVariantName: d.selectedVariantName,
      selectedVariantPrice: d.selectedVariantPrice,
      modifiers: d.modifiers,
      comboItemId: d.comboItemId,
      comboSelections: d.comboSelections,
    };

    out.push({ line, issue: diagnose(d, item, line, itemMap) });
  }

  return out;
}

/** Ramène une ligne de brouillon potentiellement corrompue à une forme sûre.
 *  `modifiers` doit être un tableau : c'est lui que `lineUnitPrice` réduit, et
 *  un `undefined` y ferait planter `.reduce`. `comboSelections` malformé
 *  redevient `undefined` (« pas de combo ») plutôt que de propager une valeur
 *  non itérable jusqu'à la boucle de `diagnose`. */
function sanitizeLine(d: DraftLine): DraftLine {
  return {
    ...d,
    quantity: typeof d.quantity === 'number' && d.quantity > 0 ? d.quantity : 1,
    notes: typeof d.notes === 'string' ? d.notes : '',
    modifiers: Array.isArray(d.modifiers) ? d.modifiers : [],
    comboSelections: Array.isArray(d.comboSelections) ? d.comboSelections : undefined,
    unitPriceAtDraft: typeof d.unitPriceAtDraft === 'number' ? d.unitPriceAtDraft : 0,
  };
}

function diagnose(
  d: DraftLine,
  item: MenuItem,
  line: NewOrderLine,
  itemMap: Map<number, MenuItem>,
): LineIssue | null {
  if (isItemSoldOut(item)) return { kind: 'sold_out' };

  // Un combo se vérifie aussi composant par composant : « ce combo n'est plus
  // disponible » n'aiderait pas le staff à décider s'il retire ou remplace.
  for (const sel of d.comboSelections ?? []) {
    const part = itemMap.get(sel.menuItemId);
    if (!part) {
      return { kind: 'combo_part', partName: sel.menuItemName, reason: 'missing' };
    }
    if (isItemSoldOut(part)) {
      return { kind: 'combo_part', partName: sel.menuItemName, reason: 'sold_out' };
    }
  }

  // lineUnitPrice porte toute la subtilité : le prix d'une variante REMPLACE le
  // prix de base, les modificateurs s'ajoutent en delta, un combo additionne les
  // deltas de ses composants. Le recalculer ici signalerait de faux changements.
  const now = lineUnitPrice(line);
  if (now !== d.unitPriceAtDraft) {
    return { kind: 'price_changed', was: d.unitPriceAtDraft, now };
  }

  return null;
}

/** Une ligne dont l'article a disparu du catalogue. Le nom mémorisé permet de
 *  l'afficher ; le prix à zéro évite de la compter dans un total qu'elle ne peut
 *  plus honorer. */
function shellLine(d: DraftLine): NewOrderLine {
  return {
    uid: d.uid,
    item: {
      id: d.itemId,
      name: d.comboSelections?.length ? 'Combo' : `#${d.itemId}`,
      price: 0,
      is_active: false,
    } as unknown as MenuItem,
    quantity: d.quantity,
    notes: d.notes,
    modifiers: d.modifiers,
    comboItemId: d.comboItemId,
    comboSelections: d.comboSelections,
  };
}

/** Réduit les lignes du panier à ce qu'on stocke. */
export function toDraftLines(lines: NewOrderLine[]): DraftLine[] {
  return lines.map((l) => ({
    uid: l.uid,
    itemId: l.item.id,
    quantity: l.quantity,
    notes: l.notes,
    selectedVariantId: l.selectedVariantId,
    selectedVariantName: l.selectedVariantName,
    selectedVariantPrice: l.selectedVariantPrice,
    modifiers: l.modifiers,
    comboItemId: l.comboItemId,
    comboSelections: l.comboSelections,
    unitPriceAtDraft: lineUnitPrice(l),
  }));
}
