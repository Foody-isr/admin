// Registre des templates de message.
//
// C'est ce fichier qui rend le système générique plutôt que spécifique au
// récapitulatif : ajouter un message futur (« commande prête », « relance »)
// revient à ajouter une entrée ici avec ses défauts, plus le constructeur de
// contexte correspondant. Ni schéma, ni migration, ni éditeur à modifier.
//
// Les défauts reproduisent le message envoyé aujourd'hui. Un restaurant qui
// n'ouvre jamais l'écran de réglages continue donc de recevoir exactement le
// même texte qu'avant.

import type { RecapLocale } from '@/lib/orders/whatsapp-recap';
import { bracePlaceholders, hasKey, tokensUsed, type RenderContext } from './render';

export interface TemplateDefinition {
  key: string;
  /** Jetons remplacés par une valeur simple. */
  tokens: string[];
  /** Jetons remplacés par un bloc composé par Foody. */
  blocks: string[];
  defaults: Record<RecapLocale, string>;
}

// Deux jetons méritent une explication, parce qu'ils ne sont pas de simples
// valeurs :
//
//   - `salutation` est un BLOC, pas un jeton simple, bien qu'il ressemble à
//     « Bonjour {{client}}, ». La formule complète (avec ou sans prénom) doit
//     toujours s'afficher : buildOrderRecap() aujourd'hui montre « Bonjour, »
//     même sans nom client. Si on gardait {{client}} nu sur cette ligne, un
//     nom vide ferait disparaître toute la ligne, confirmation comprise
//     (règle « ligne dont tous les jetons déclarés sont vides »). `client`
//     reste déclaré à part pour les restaurants qui veulent leur propre
//     formule autour du seul prénom.
//   - `lien_suivi` est également un BLOC dont la valeur porte son propre saut
//     de ligne (« \nSuivre votre commande : … »). buildOrderRecap() n'affiche
//     ni la ligne vide ni le lien quand il n'y a pas d'URL de suivi ; une
//     ligne vide statique dans le corps du template ne pourrait pas
//     disparaître avec lui (une ligne sans jeton n'est jamais supprimée), le
//     séparateur doit donc voyager DANS la valeur du bloc.
const ORDER_RECAP: TemplateDefinition = {
  key: 'order_recap',
  tokens: ['restaurant', 'client', 'numero_commande', 'creneau'],
  blocks: ['type_commande', 'articles', 'totaux', 'adresse', 'infos_client', 'statut_paiement', 'salutation', 'lien_suivi'],
  defaults: {
    fr: [
      '*{{restaurant}}*',
      'Commande #{{numero_commande}}',
      '',
      '{{salutation}} votre commande est confirmée ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      'ℹ️ {{infos_client}}',
      '',
      '*Votre commande*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '{{lien_suivi}}',
    ].join('\n'),
    he: [
      '*{{restaurant}}*',
      'הזמנה #{{numero_commande}}',
      '',
      '{{salutation}} ההזמנה שלך אושרה ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      'ℹ️ {{infos_client}}',
      '',
      '*ההזמנה שלך*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '{{lien_suivi}}',
    ].join('\n'),
    en: [
      '*{{restaurant}}*',
      'Order #{{numero_commande}}',
      '',
      '{{salutation}} your order is confirmed ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      'ℹ️ {{infos_client}}',
      '',
      '*Your order*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '{{lien_suivi}}',
    ].join('\n'),
  },
};

const DELIVERY_REMINDER: TemplateDefinition = {
  key: 'delivery_reminder',
  tokens: ['restaurant', 'client', 'creneau', 'telephone'],
  blocks: ['adresse', 'consignes'],
  defaults: {
    fr: [
      '*{{restaurant}}*',
      'Bonjour {{client}},',
      '',
      'Petit rappel : votre livraison est prévue demain.',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '📞 {{telephone}}',
      'ℹ️ {{consignes}}',
      '',
      'Merci de nous confirmer que ces informations sont correctes.',
    ].join('\n'),
    he: [
      '*{{restaurant}}*',
      'שלום {{client}},',
      '',
      'תזכורת קטנה: המשלוח שלך מתוכנן למחר.',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '📞 {{telephone}}',
      'ℹ️ {{consignes}}',
      '',
      'נשמח לאישור שהפרטים נכונים.',
    ].join('\n'),
    en: [
      '*{{restaurant}}*',
      'Hello {{client}},',
      '',
      'A quick reminder: your delivery is scheduled for tomorrow.',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '📞 {{telephone}}',
      'ℹ️ {{consignes}}',
      '',
      'Please confirm that these details are correct.',
    ].join('\n'),
  },
};

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [ORDER_RECAP, DELIVERY_REMINDER];

export function findTemplate(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((d) => d.key === key);
}

/**
 * Les jetons d'un corps que le registre ne déclare pas. C'est ce que
 * l'éditeur signale pendant la frappe.
 *
 * Balaye `bracePlaceholders` et non `tokensUsed` : une coquille se glisse
 * autant dans la CASSE ou les CARACTÈRES du nom que dans le nom lui-même.
 * `{{Client}}`, `{{ CLIENT }}`, `{{numéro}}` et `{{client-name}}` ne sont
 * substitués par personne — ils doivent donc être signalés comme n'importe
 * quel `{{nawak}}`, sans quoi l'éditeur reste muet et seul l'aperçu trahit le
 * problème. L'espacement intérieur d'un jeton VALIDE reste toléré (`.trim()`
 * dans `bracePlaceholders`), pour ne pas crier au loup sur `{{ client }}` qui
 * fonctionne parfaitement.
 */
export function unknownTokens(body: string, def: TemplateDefinition): string[] {
  const declared = new Set([...def.tokens, ...def.blocks]);
  return bracePlaceholders(body).filter((t) => !declared.has(t));
}

/**
 * Les jetons que ce corps utilise et que le registre déclare, mais que le
 * contexte OMET (absents à la fois de `tokens` et de `blocks`) plutôt que de
 * leur donner une valeur vide. Une omission n'est pas une valeur vide : voir
 * le contrat documenté sur `RenderContext` dans render.ts. `renderTemplate`
 * ne peut pas se garder lui-même contre ça (il ne voit jamais la
 * déclaration) ; ceci sert de garde-fou dans les tests d'un constructeur de
 * contexte, pour transformer un oubli silencieux en échec de test bruyant.
 */
export function missingFromContext(
  body: string,
  def: TemplateDefinition,
  ctx: RenderContext,
): string[] {
  const declared = new Set([...def.tokens, ...def.blocks]);
  return tokensUsed(body).filter(
    (name) => declared.has(name) && !hasKey(ctx.tokens, name) && !hasKey(ctx.blocks, name),
  );
}
