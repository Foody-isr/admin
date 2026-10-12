type Kind = 'order_recap' | 'delivery_reminder';
type Locale = 'en' | 'he' | 'fr';

const templates: Record<Locale, Record<Kind, string>> = {
  fr: {
    order_recap: 'Confirmation de commande — {{1}}\nCommande n° {{2}}\n\nBonjour {{3}}, votre commande est confirmée ✅\n\n🗓️ Créneau prévu : {{4}}\n📍 Adresse ou lieu de remise : {{5}}\n\nTotal de votre commande : {{6}}\nPaiement : {{7}}\n\nRetrouvez les articles, les remises et votre récapitulatif complet ici : {{8}}\n\nMerci pour votre commande.',
    delivery_reminder: 'Bonjour {{1}},\n\nNous avons le plaisir de vous confirmer votre livraison chez {{2}}, prévue pour {{3}}.\n\nPour toute question concernant votre livraison, merci de contacter directement le livreur {{4}} au {{5}} et de rester joignable pendant toute la durée du créneau de livraison.\n\nEncore un grand merci pour votre commande.',
  },
  en: {
    order_recap: 'Order confirmation — {{1}}\nOrder #{{2}}\n\nHello {{3}}, your order is confirmed ✅\n\n🗓️ Scheduled time: {{4}}\n📍 Delivery or collection address: {{5}}\n\nOrder total: {{6}}\nPayment: {{7}}\n\nView your items, discounts and full order summary here: {{8}}\n\nThank you for your order.',
    delivery_reminder: 'Hello {{1}},\n\nWe are pleased to confirm your delivery from {{2}}, scheduled for {{3}}.\n\nFor questions about your delivery, please contact your courier {{4}} at {{5}} and remain available throughout the delivery window.\n\nThank you for your order.',
  },
  he: {
    order_recap: 'אישור הזמנה — {{1}}\nהזמנה מספר {{2}}\n\nשלום {{3}}, ההזמנה שלך אושרה ✅\n\n🗓️ מועד מתוכנן: {{4}}\n📍 כתובת למסירה או לאיסוף: {{5}}\n\nסכום ההזמנה: {{6}}\nתשלום: {{7}}\n\nאפשר לצפות בפריטים, בהנחות ובסיכום ההזמנה המלא כאן: {{8}}\n\nתודה על ההזמנה.',
    delivery_reminder: 'שלום {{1}},\n\nאנו שמחים לאשר את המשלוח שלך מ-{{2}}, המתוכנן ל-{{3}}.\n\nלשאלות בנוגע למשלוח, נא לפנות ישירות לשליח {{4}} בטלפון {{5}} ולהישאר זמינים לאורך כל חלון המשלוח.\n\nתודה על ההזמנה.',
  },
};

/** Suggested Utility text whose numbered variables match Foody's dedicated order contracts. */
export function orderTwilioTemplate(kind: Kind, locale: Locale): string {
  return templates[locale][kind];
}
