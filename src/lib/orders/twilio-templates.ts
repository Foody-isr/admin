type Kind = 'order_recap' | 'delivery_reminder';
type Locale = 'en' | 'he' | 'fr';

const templates: Record<Locale, Record<Kind, string>> = {
  fr: {
    order_recap: 'Confirmation de commande — {{1}}\nCommande n° {{2}}\n\nBonjour {{3}}, votre commande est confirmée ✅\n\n🗓️ Créneau prévu : {{4}}\n📍 Adresse ou lieu de remise : {{5}}\n\nTotal de votre commande : {{6}}\nPaiement : {{7}}\n\nRetrouvez les articles, les remises et votre récapitulatif complet ici : {{8}}\n\nMerci pour votre commande.',
    delivery_reminder: 'Boker tov {{1}} 🧡 Nous avons le plaisir de vous confirmer votre livraison de demain, prévue entre {{2}}. Pour toute question concernant votre livraison, merci de bien vouloir contacter directement le livreur ({{3}}) et de rester joignable pendant toute la durée du créneau de livraison. Encore un grand merci d’avoir choisi {{4}} pour votre Shabbat ✨',
  },
  en: {
    order_recap: 'Order confirmation — {{1}}\nOrder #{{2}}\n\nHello {{3}}, your order is confirmed ✅\n\n🗓️ Scheduled time: {{4}}\n📍 Delivery or collection address: {{5}}\n\nOrder total: {{6}}\nPayment: {{7}}\n\nView your items, discounts and full order summary here: {{8}}\n\nThank you for your order.',
    delivery_reminder: 'Boker tov {{1}} 🧡 We are pleased to confirm your delivery tomorrow, scheduled between {{2}}. For any questions about your delivery, please contact your courier directly ({{3}}) and remain available throughout the delivery window. Thank you again for choosing {{4}} for your Shabbat ✨',
  },
  he: {
    order_recap: 'אישור הזמנה — {{1}}\nהזמנה מספר {{2}}\n\nשלום {{3}}, ההזמנה שלך אושרה ✅\n\n🗓️ מועד מתוכנן: {{4}}\n📍 כתובת למסירה או לאיסוף: {{5}}\n\nסכום ההזמנה: {{6}}\nתשלום: {{7}}\n\nאפשר לצפות בפריטים, בהנחות ובסיכום ההזמנה המלא כאן: {{8}}\n\nתודה על ההזמנה.',
    delivery_reminder: 'בוקר טוב {{1}} 🧡 אנו שמחים לאשר את המשלוח שלך מחר, המתוכנן בין {{2}}. לכל שאלה בנוגע למשלוח, נא לפנות ישירות לשליח ({{3}}) ולהישאר זמינים לאורך כל חלון המשלוח. שוב תודה שבחרתם ב-{{4}} לשבת שלכם ✨',
  },
};

/** Suggested Utility text whose numbered variables match Foody's dedicated order contracts. */
export function orderTwilioTemplate(kind: Kind, locale: Locale): string {
  return templates[locale][kind];
}
