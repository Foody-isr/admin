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
  /** Quand ce brouillon est apparu pour la première fois. Volontairement NON
   *  rafraîchi à chaque réécriture : reprendre un brouillon *est* une écriture
   *  (la reprise pose `lines`, l'effet de sauvegarde part, 500 ms plus tard
   *  l'enregistrement est réécrit), donc un horodatage rafraîchi repousserait
   *  l'expiration de douze heures à chaque visite. Le TTL borne le temps
   *  pendant lequel on peut reprendre le panier de quelqu'un d'autre sans s'en
   *  apercevoir ; mesuré depuis la dernière écriture, il ne bornerait rien. */
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

const CUSTOMER_FIELDS: (keyof DraftCustomer)[] = [
  'name', 'phone', 'address', 'city', 'floor', 'apt', 'entryCode', 'deliveryNotes',
];

function isDraftCustomer(value: unknown): value is DraftCustomer {
  if (value === null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return CUSTOMER_FIELDS.every((f) => typeof c[f] === 'string');
}

function isFulfillmentValue(value: unknown): value is FulfillmentValue {
  if (value === null || typeof value !== 'object') return false;
  const f = value as Partial<FulfillmentValue>;
  return f.timing === 'immediate' || f.timing === 'scheduled';
}

/** Un JSON valide ne fait pas un enregistrement exploitable. Une écriture
 *  tronquée, ou un futur changement de schéma, produit un objet dont
 *  `customer` ou `fulfillment` manque ; la page et le drawer les lisent sans
 *  filet dans un effet, ce qui remonte à la frontière d'erreur de Next et
 *  laisse la page de commande vide. Et comme rien n'effaçait l'enregistrement,
 *  ça se répétait à chaque chargement.
 *
 *  On vérifie donc ici la forme du haut de l'enregistrement, et on jette
 *  exactement comme un JSON corrompu. Le contenu des `lines`, lui, reste
 *  volontairement toléré ligne par ligne : `rehydrateDraftLines` sait dégrader
 *  une ligne isolée sans perdre le reste du panier, ce qui vaut mieux que de
 *  jeter tout un brouillon pour un modificateur mal formé. */
function isWellFormedDraft(value: unknown): value is OrderDraft {
  if (value === null || typeof value !== 'object') return false;
  const d = value as Partial<OrderDraft>;
  if (typeof d.version !== 'number' || typeof d.savedAt !== 'number') return false;
  if (!Array.isArray(d.lines)) return false;
  if (!isDraftCustomer(d.customer)) return false;
  if (d.orderType !== 'pickup' && d.orderType !== 'delivery') return false;
  if (!isFulfillmentValue(d.fulfillment)) return false;
  // `linked` n'a que deux formes valides : un client rattaché, ou aucun.
  // `undefined` (champ absent) n'en fait pas partie.
  return d.linked === null || typeof d.linked === 'object';
}

export function loadOrderDraft(rid: number): OrderDraft | null {
  if (typeof window === 'undefined') return null;
  const key = keyFor(rid);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isWellFormedDraft(parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }
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
  // L'heure de création se transmet d'une écriture à l'autre. `loadOrderDraft`
  // sert de lecture parce qu'il applique déjà la version, le TTL et la forme :
  // un enregistrement périmé ou illisible ne peut donc pas léguer son heure de
  // naissance au suivant, il repart de zéro.
  const previous = loadOrderDraft(rid);
  const draft: OrderDraft = {
    version: CURRENT_VERSION,
    savedAt: previous?.savedAt ?? Date.now(),
    ...input,
  };
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
