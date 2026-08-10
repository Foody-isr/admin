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
import {
  lineUnitPrice, type NewOrderLine, type NewOrderLineModifier, type ComboSelection,
} from '@/components/orders/NewOrderItemModal';
import { isItemSoldOut } from './itemAvailability';

export type LineIssue =
  | { kind: 'missing' }
  | { kind: 'sold_out' }
  | { kind: 'price_changed'; was: number; now: number }
  | { kind: 'combo_part'; partName: string; reason: 'missing' | 'sold_out' }
  | { kind: 'quantity_invalid' };

export interface RehydratedLine {
  line: NewOrderLine;
  /** null quand rien n'a bougé. */
  issue: LineIssue | null;
  /** Le prix mémorisé de la ligne, assaini. La page le garde pour le réécrire
   *  tel quel : recalculé depuis l'article courant, il effacerait la référence
   *  contre laquelle « le prix a changé » se mesure, et la ligne reviendrait
   *  saine au deuxième aller-retour. */
  unitPriceAtDraft: number;
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

  for (let i = 0; i < draftLines.length; i += 1) {
    const { d, quantityInvalid } = sanitizeLine(draftLines[i], i);
    const item = itemMap.get(d.itemId);

    // Sans l'article, on ne peut pas reconstruire une NewOrderLine exploitable.
    // On en fabrique une coquille portant le nom mémorisé, pour que la ligne
    // reste affichable et retirable plutôt que de disparaître en silence.
    if (!item) {
      out.push({
        line: shellLine(d),
        issue: { kind: 'missing' },
        unitPriceAtDraft: d.unitPriceAtDraft,
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

    out.push({
      line,
      issue: diagnose(d, item, line, itemMap, quantityInvalid),
      unitPriceAtDraft: d.unitPriceAtDraft,
    });
  }

  return out;
}

interface SanitizedLine {
  d: DraftLine;
  /** La quantité stockée n'était pas un entier positif. Signalé plutôt que
   *  corrigé en silence : contrairement au prix, la quantité part au serveur
   *  telle quelle, donc la ramener à 1 sans le dire enverrait en cuisine une
   *  commande que personne n'a passée. */
  quantityInvalid: boolean;
}

/** Ramène une ligne de brouillon potentiellement corrompue à une forme sûre.
 *  `raw` est `unknown`, pas `DraftLine` : un JSON tronqué peut mettre `null`
 *  ou une chaîne à la place d'un objet de ligne, pas seulement lui manquer un
 *  champ. Un `itemId` introuvable (le défaut `-1`) fait retomber la ligne dans
 *  le chemin « article manquant » déjà géré, ce qui évite d'avoir deux façons
 *  de dire « ligne irrécupérable ». `modifiers` doit être un tableau :
 *  `lineUnitPrice` le réduit, et `undefined` y ferait planter `.reduce`.
 *  `comboSelections` malformé redevient `undefined` (« pas de combo ») plutôt
 *  que de propager une valeur non itérable jusqu'à la boucle de `diagnose`.
 *
 *  L'`uid` de repli est indexé sur la position : deux lignes corrompues
 *  retombaient sinon toutes les deux sur la chaîne vide, donc sur la même clé
 *  React, la même entrée d'`issues`, et un Retirer qui en supprimait deux. */
function sanitizeLine(raw: unknown, index: number): SanitizedLine {
  const d = (raw !== null && typeof raw === 'object' ? raw : {}) as Partial<DraftLine>;
  const quantityOk = typeof d.quantity === 'number' && Number.isInteger(d.quantity) && d.quantity > 0;
  return {
    quantityInvalid: !quantityOk,
    d: {
      uid: typeof d.uid === 'string' && d.uid !== '' ? d.uid : `draft-line-${index}`,
      itemId: typeof d.itemId === 'number' ? d.itemId : -1,
      name: typeof d.name === 'string' ? d.name : '',
      quantity: quantityOk ? (d.quantity as number) : 1,
      notes: typeof d.notes === 'string' ? d.notes : '',
      selectedVariantId: d.selectedVariantId,
      selectedVariantName: d.selectedVariantName,
      selectedVariantPrice: d.selectedVariantPrice,
      modifiers: sanitizeModifiers(d.modifiers),
      comboItemId: d.comboItemId,
      comboSelections: sanitizeComboSelections(d.comboSelections),
      unitPriceAtDraft: typeof d.unitPriceAtDraft === 'number' ? d.unitPriceAtDraft : 0,
    },
  };
}

/** Un modificateur qui n'est pas un objet (`null`, une chaîne...) ne porte ni
 *  prix ni nom : on le retire plutôt que de le faire traverser `.reduce`. */
function sanitizeModifiers(raw: unknown): NewOrderLineModifier[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is NewOrderLineModifier => m !== null && typeof m === 'object');
}

/** Même logique que `sanitizeModifiers`, pour la boucle de `diagnose` qui lit
 *  `sel.menuItemId` sans filet. */
function sanitizeComboSelections(raw: unknown): ComboSelection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((s): s is ComboSelection => s !== null && typeof s === 'object');
}

function diagnose(
  d: DraftLine,
  item: MenuItem,
  line: NewOrderLine,
  itemMap: Map<number, MenuItem>,
  quantityInvalid: boolean,
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

  // Placé après les cas non rattrapables et avant le prix : une quantité
  // illisible se traite (accepter la ramène à 1, retirer la supprime), donc
  // elle ne doit pas masquer une rupture, qui ne se traite pas.
  if (quantityInvalid) return { kind: 'quantity_invalid' };

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
 *  plus honorer.
 *
 *  La variante choisie est reprise pour l'affichage (« Salade Tuna · Grande »),
 *  mais PAS son prix : `lineUnitPrice` fait passer `selectedVariantPrice`
 *  devant le prix de l'article, et la coquille se remettrait à peser dans le
 *  total de la commande. */
function shellLine(d: DraftLine): NewOrderLine {
  return {
    uid: d.uid,
    item: {
      id: d.itemId,
      name: d.name || (d.comboSelections?.length ? 'Combo' : `#${d.itemId}`),
      price: 0,
      is_active: false,
    } as unknown as MenuItem,
    quantity: d.quantity,
    notes: d.notes,
    selectedVariantId: d.selectedVariantId,
    selectedVariantName: d.selectedVariantName,
    modifiers: d.modifiers,
    comboItemId: d.comboItemId,
    comboSelections: d.comboSelections,
  };
}

/**
 * Réduit les lignes du panier à ce qu'on stocke.
 *
 * `remembered` porte, par ligne, le prix mémorisé d'une reprise. Sans lui, la
 * réécriture qui suit une reprise recalculait `unitPriceAtDraft` depuis
 * l'article courant : le prix d'origine était perdu, et au retour suivant une
 * ligne « prix modifié » revenait saine et débloquait la validation toute
 * seule. Une ligne absente de la table — ajoutée par le staff, ou dont le
 * changement de prix vient d'être accepté — prend le prix courant, ce qui est
 * exactement ce qu'accepter veut dire.
 */
export function toDraftLines(lines: NewOrderLine[], remembered?: Map<string, number>): DraftLine[] {
  return lines.map((l) => {
    const kept = remembered?.get(l.uid);
    return {
      uid: l.uid,
      itemId: l.item.id,
      name: l.item.name,
      quantity: l.quantity,
      notes: l.notes,
      selectedVariantId: l.selectedVariantId,
      selectedVariantName: l.selectedVariantName,
      selectedVariantPrice: l.selectedVariantPrice,
      modifiers: l.modifiers,
      comboItemId: l.comboItemId,
      comboSelections: l.comboSelections,
      unitPriceAtDraft: kept !== undefined ? kept : lineUnitPrice(l),
    };
  });
}
