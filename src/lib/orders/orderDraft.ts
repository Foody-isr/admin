// Brouillon de la commande manuelle en cours, conservé dans localStorage pour
// survivre à une navigation et à un rechargement d'onglet.
//
// Jumeau structurel de `src/lib/itemDraft.ts` : même versionnage, même
// expiration, même clé par restaurant, même comportement best-effort. Ce qui
// change ici, c'est la durée de vie et la forme des lignes.

import type { NewOrderLineModifier, ComboSelection } from '@/components/orders/NewOrderItemModal';
import type { FulfillmentValue } from '@/lib/orders/fulfillment';
import type { CustomerSearchResult } from '@/lib/api';

const STORAGE_PREFIX = 'foody.orders.draft.';
const CURRENT_VERSION = 1;

/** Douze heures : la durée d'un service. Un panier plus vieux que ça n'est pas
 *  un brouillon qu'on reprend, c'est une commande d'hier qu'on renvoie en
 *  cuisine sans la voir. Le brouillon d'article vit sept jours parce qu'un
 *  article à moitié rédigé garde du sens ; un panier non. */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

/** Une ligne telle qu'on la stocke. On garde `itemId` et non l'objet MenuItem :
 *  celui-ci porte ses groupes de variantes, ses modificateurs, ses images et ses
 *  traductions, ce qui gonflerait le brouillon pour rien. La ligne est
 *  réhydratée depuis le menu fraîchement chargé, ce qui fait au passage la
 *  revalidation : un identifiant introuvable EST le cas « n'existe plus ». */
export interface DraftLine {
  uid: string;
  itemId: number;
  quantity: number;
  notes: string;
  selectedVariantId?: number;
  selectedVariantName?: string;
  selectedVariantPrice?: number;
  modifiers: NewOrderLineModifier[];
  comboItemId?: number;
  comboSelections?: ComboSelection[];
  /** Prix unitaire au moment où la ligne a été ajoutée. C'est la référence
   *  contre laquelle « le prix a changé » est mesuré à la reprise. */
  unitPriceAtDraft: number;
}

export interface DraftCustomer {
  name: string;
  phone: string;
  address: string;
  city: string;
  floor: string;
  apt: string;
  entryCode: string;
  deliveryNotes: string;
}

export interface OrderDraft {
  version: number;
  savedAt: number;
  lines: DraftLine[];
  customer: DraftCustomer;
  /** Le client rattaché par le sélecteur. Conservé pour que la puce « Client
   *  existant » et le choix d'adresses connues survivent : sans lui, les champs
   *  reviendraient remplis mais le rattachement semblerait perdu. */
  linked: CustomerSearchResult | null;
  orderType: 'pickup' | 'delivery';
  fulfillment: FulfillmentValue;
}

export type OrderDraftInput = Omit<OrderDraft, 'version' | 'savedAt'>;

function keyFor(rid: number): string {
  return `${STORAGE_PREFIX}${rid}`;
}

/** Un panier vide n'est pas un brouillon, même avec une fiche client remplie :
 *  sinon un bandeau « commande reprise » s'afficherait sur une page vierge. */
export function isMeaningfulDraft(input: OrderDraftInput): boolean {
  return input.lines.length > 0;
}

export function loadOrderDraft(rid: number): OrderDraft | null {
  if (typeof window === 'undefined') return null;
  const key = keyFor(rid);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderDraft;
    if (parsed.version !== CURRENT_VERSION) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

export function saveOrderDraft(rid: number, input: OrderDraftInput): void {
  if (typeof window === 'undefined') return;
  if (!isMeaningfulDraft(input)) {
    clearOrderDraft(rid);
    return;
  }
  const draft: OrderDraft = { version: CURRENT_VERSION, savedAt: Date.now(), ...input };
  try {
    window.localStorage.setItem(keyFor(rid), JSON.stringify(draft));
  } catch {
    // Quota ou sérialisation : un brouillon est best-effort, il ne casse jamais
    // la prise de commande.
  }
}

export function clearOrderDraft(rid: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(rid));
  } catch {
    // ignore
  }
}
