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
import { tokensUsed } from './render';

export interface TemplateDefinition {
  key: string;
  /** Jetons remplacés par une valeur simple. */
  tokens: string[];
  /** Jetons remplacés par un bloc composé par Foody. */
  blocks: string[];
  defaults: Record<RecapLocale, string>;
}

const ORDER_RECAP: TemplateDefinition = {
  key: 'order_recap',
  tokens: ['restaurant', 'client', 'numero_commande', 'creneau', 'lien_suivi'],
  blocks: ['type_commande', 'articles', 'totaux', 'adresse', 'statut_paiement'],
  defaults: {
    fr: [
      '*{{restaurant}}*',
      'Commande #{{numero_commande}}',
      '',
      'Bonjour {{client}}, votre commande est confirmée ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '',
      '*Votre commande*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '',
      'Suivre votre commande : {{lien_suivi}}',
    ].join('\n'),
    he: [
      '*{{restaurant}}*',
      'הזמנה #{{numero_commande}}',
      '',
      'שלום {{client}}, ההזמנה שלך אושרה ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '',
      '*ההזמנה שלך*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '',
      'מעקב אחר ההזמנה : {{lien_suivi}}',
    ].join('\n'),
    en: [
      '*{{restaurant}}*',
      'Order #{{numero_commande}}',
      '',
      'Hello {{client}}, your order is confirmed ✅',
      '',
      '{{type_commande}}',
      '🗓️ {{creneau}}',
      '📍 {{adresse}}',
      '',
      '*Your order*',
      '{{articles}}',
      '',
      '{{totaux}}',
      '{{statut_paiement}}',
      '',
      'Track your order : {{lien_suivi}}',
    ].join('\n'),
  },
};

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [ORDER_RECAP];

export function findTemplate(key: string): TemplateDefinition | undefined {
  return TEMPLATE_REGISTRY.find((d) => d.key === key);
}

/** Les jetons d'un corps que le registre ne déclare pas. C'est ce que
 *  l'éditeur signale pendant la frappe. */
export function unknownTokens(body: string, def: TemplateDefinition): string[] {
  const declared = new Set([...def.tokens, ...def.blocks]);
  return tokensUsed(body).filter((t) => !declared.has(t));
}
