type Kind = 'order_recap' | 'delivery_reminder' | 'order_status' | 'receipt' | 'satisfaction';
type Locale = 'en' | 'he' | 'fr';

const templates: Record<Locale, Record<Kind, string>> = {
  fr: {
    satisfaction: 'Chavoua tov {{1}} 🧡 Nous espérons que vous avez passé un agréable Shabbat et de bonnes fêtes. Tout s’est-il bien passé avec votre commande n° {{2}} ? Tous vos commentaires, petits comme grands, sont précieux alors n’hésitez pas à nous partager votre avis 🌸 Merci encore pour votre confiance 🫶',
    order_status: 'Votre commande n° {{1}} chez {{2}} : {{3}}. Merci pour votre commande.',
    receipt: 'Reçu de votre commande n° {{1}} chez {{2}}. Total : {{3}}. Consultez votre reçu ici : {{4}}. Merci pour votre commande.',
    order_recap: 'Confirmation de commande — {{1}}\nCommande n° {{2}}\n\nBonjour {{3}}, votre commande est confirmée ✅\n\n🗓️ Créneau prévu : {{4}}\n📍 Adresse ou lieu de remise : {{5}}\n\nTotal de votre commande : {{6}}\nPaiement : {{7}}\n\nRetrouvez les articles, les remises et votre récapitulatif complet ici : {{8}}\n\nMerci pour votre commande.',
    delivery_reminder: 'Boker tov {{1}} 🧡 Nous avons le plaisir de vous confirmer votre livraison de demain, prévue entre {{2}}. Pour toute question concernant votre livraison, merci de bien vouloir contacter directement le livreur ({{3}}) et de rester joignable pendant toute la durée du créneau de livraison. Encore un grand merci d’avoir choisi {{4}} pour votre Shabbat ✨',
  },
  en: {
    satisfaction: 'Shavua tov {{1}} 🧡 We hope you enjoyed Shabbat and the holidays. Did everything go well with your order #{{2}}? Every comment matters to us, so please share your feedback 🌸 Thank you again for your trust 🫶',
    order_status: 'Your order #{{1}} at {{2}}: {{3}}. Thank you for your order.',
    receipt: 'Receipt for your order #{{1}} at {{2}}. Total: {{3}}. View your receipt here: {{4}}. Thank you for your order.',
    order_recap: 'Order confirmation — {{1}}\nOrder #{{2}}\n\nHello {{3}}, your order is confirmed ✅\n\n🗓️ Scheduled time: {{4}}\n📍 Delivery or collection address: {{5}}\n\nOrder total: {{6}}\nPayment: {{7}}\n\nView your items, discounts and full order summary here: {{8}}\n\nThank you for your order.',
    delivery_reminder: 'Boker tov {{1}} 🧡 We are pleased to confirm your delivery tomorrow, scheduled between {{2}}. For any questions about your delivery, please contact your courier directly ({{3}}) and remain available throughout the delivery window. Thank you again for choosing {{4}} for your Shabbat ✨',
  },
  he: {
    satisfaction: 'שבוע טוב {{1}} 🧡 מקווים שעברו עליכם שבת וחגים נעימים. האם הכול היה לשביעות רצונכם בהזמנה מספר {{2}}? כל משוב, קטן כגדול, חשוב לנו, ונשמח לשמוע את דעתכם 🌸 תודה שוב על האמון 🫶',
    order_status: 'הזמנה מספר {{1}} אצל {{2}}: {{3}}. תודה על ההזמנה.',
    receipt: 'קבלה להזמנה מספר {{1}} אצל {{2}}. סכום: {{3}}. לצפייה בקבלה: {{4}}. תודה על ההזמנה.',
    order_recap: 'אישור הזמנה — {{1}}\nהזמנה מספר {{2}}\n\nשלום {{3}}, ההזמנה שלך אושרה ✅\n\n🗓️ מועד מתוכנן: {{4}}\n📍 כתובת למסירה או לאיסוף: {{5}}\n\nסכום ההזמנה: {{6}}\nתשלום: {{7}}\n\nאפשר לצפות בפריטים, בהנחות ובסיכום ההזמנה המלא כאן: {{8}}\n\nתודה על ההזמנה.',
    delivery_reminder: 'בוקר טוב {{1}} 🧡 אנו שמחים לאשר את המשלוח שלך מחר, המתוכנן בין {{2}}. לכל שאלה בנוגע למשלוח, נא לפנות ישירות לשליח ({{3}}) ולהישאר זמינים לאורך כל חלון המשלוח. שוב תודה שבחרתם ב-{{4}} לשבת שלכם ✨',
  },
};

/** Suggested Utility text whose numbered variables match Foody's dedicated order contracts. */
export function orderNotificationTemplate(kind: Kind, locale: Locale): string {
  return templates[locale][kind];
}

/** Backward-compatible name used by the existing Twilio settings form. */
export const orderTwilioTemplate = orderNotificationTemplate;
