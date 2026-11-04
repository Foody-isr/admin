import type { CheckoutError, CheckoutStep } from './checkout-validation';

interface CheckoutCopy {
  steps: Record<CheckoutStep, string>;
  progress: string;
  previous: string;
  next: string;
  errorsTitle: string;
  detailsByClient: string;
  detailsByClientHint: string;
  additional: string;
  requirements: string;
  sameDate: string;
  useAddress: string;
  useContact: string;
  timingWarning: string;
  production: string;
  productionDate: string;
  productionUnscheduled: string;
  productionPending: string;
  productionIncluded: string;
  productionAutomatic: string;
  errors: Record<CheckoutError, string>;
}

/** Localized copy for the staff checkout steps and actionable field errors. */
export const checkoutStepCopy: Record<'fr' | 'en' | 'he', CheckoutCopy> = {
  fr: {
    steps: { reception: 'Réception et client', event: 'Événement', payment: 'Paiement et confirmation' },
    progress: 'Étape {current} sur {total}', previous: 'Précédent', next: 'Continuer', errorsTitle: '{count} points à corriger',
    detailsByClient: 'Le client complétera ses informations via le lien Foody', detailsByClientHint: 'Les coordonnées et les informations événement manquantes seront demandées au client avant confirmation.',
    additional: 'Informations complémentaires', requirements: 'Informations à demander au client', sameDate: 'Utiliser la date de retrait ou de livraison', useAddress: 'Reprendre l’adresse de livraison', useContact: 'Reprendre le contact client',
    timingWarning: 'Le créneau de réception se termine après le début de l’événement. Vérifiez les horaires prévus.',
    production: 'Plan de production', productionDate: 'Date retenue : {date}', productionUnscheduled: 'Cette commande n’a pas de date de production planifiée.',
    productionPending: 'En attente de confirmation des informations et du paiement prévu.', productionIncluded: 'Cette commande sera incluse au plan de production après sa création.', productionAutomatic: 'L’inclusion dépend de la programmation et du règlement. L’ajout manuel se règle à la dernière étape.',
    errors: {
      date: 'Choisissez une date de retrait ou de livraison valide.', time: 'Renseignez l’heure de début du créneau.', windowEnd: 'Renseignez l’heure de fin du créneau.', windowOrder: 'La fin du créneau doit être après le début. Choisissez une heure de fin plus tardive.',
      name: 'Renseignez le nom du client.', phone: 'Renseignez le téléphone du client.', address: 'Renseignez l’adresse de livraison.', fee: 'Saisissez des frais de livraison positifs ou nuls, avec deux décimales maximum.', feePending: 'Les frais de livraison sont en cours de calcul. Attendez le résultat.', feeUnavailable: 'Les frais de livraison sont indisponibles. Réessayez ou définissez des frais fixes.',
      intent: 'Choisissez comment régler cette commande.', capability: 'Ce mode de paiement est indisponible. Choisissez un autre mode.', received: 'Confirmez avoir reçu le montant actuel de la commande.', manualValue: 'Saisissez une réduction supérieure à zéro, au maximum 100 pour un pourcentage.', manualReason: 'Indiquez le motif de la réduction.',
      guests: 'Indiquez un nombre entier de personnes entre 1 et 100 000 si obligatoire.', eventDate: 'Renseignez une date d’événement valide.', eventTime: 'Renseignez une heure d’événement valide.', eventName: 'Limitez le nom de l’événement à 120 caractères.', venue: 'Limitez le lieu à 500 caractères.', contact: 'Limitez le contact sur place à 200 caractères.', notes: 'Limitez les consignes à 1 000 caractères.',
      deposit: 'L’acompte doit être supérieur à zéro et inférieur au total de la commande.', hold: 'L’empreinte doit être supérieure à zéro et ne pas dépasser le solde restant.', holdUnavailable: 'L’empreinte bancaire est indisponible pour ce compte. Modifiez les conditions de paiement.', balanceDate: 'Renseignez une date limite du solde valide.', total: 'Le montant de la commande doit être supérieur à zéro pour ce règlement.',
    },
  },
  en: {
    steps: { reception: 'Handover and customer', event: 'Event', payment: 'Payment and confirmation' },
    progress: 'Step {current} of {total}', previous: 'Previous', next: 'Continue', errorsTitle: '{count} things to correct',
    detailsByClient: 'The customer will complete their details through the Foody link', detailsByClientHint: 'Missing contact and event details will be requested from the customer before confirmation.',
    additional: 'Additional information', requirements: 'Information to request from the customer', sameDate: 'Use the pickup or delivery date', useAddress: 'Use the delivery address', useContact: 'Use the customer contact',
    timingWarning: 'The handover window ends after the event starts. Check the planned times.',
    production: 'Production plan', productionDate: 'Selected date: {date}', productionUnscheduled: 'This order has no scheduled production date.', productionPending: 'Awaiting confirmation of the details and agreed payment.', productionIncluded: 'This order will be included in the production plan after creation.', productionAutomatic: 'Inclusion depends on scheduling and payment. Manual inclusion is available on the final step.',
    errors: {
      date: 'Choose a valid pickup or delivery date.', time: 'Enter the start of the time window.', windowEnd: 'Enter the end of the time window.', windowOrder: 'The window must end after it starts. Choose a later end time.',
      name: 'Enter the customer name.', phone: 'Enter the customer phone number.', address: 'Enter the delivery address.', fee: 'Enter a delivery fee of zero or more, with up to two decimal places.', feePending: 'The delivery fee is being calculated. Wait for the result.', feeUnavailable: 'The delivery fee is unavailable. Retry or enter a fixed fee.',
      intent: 'Choose how to pay for this order.', capability: 'This payment option is unavailable. Choose another option.', received: 'Confirm receipt of the current order amount.', manualValue: 'Enter a discount greater than zero, up to 100 for a percentage.', manualReason: 'Enter the reason for the discount.',
      guests: 'Enter a whole number of guests between 1 and 100,000 if required.', eventDate: 'Enter a valid event date.', eventTime: 'Enter a valid event time.', eventName: 'Limit the event name to 120 characters.', venue: 'Limit the venue to 500 characters.', contact: 'Limit the on-site contact to 200 characters.', notes: 'Limit instructions to 1,000 characters.',
      deposit: 'The deposit must be greater than zero and less than the order total.', hold: 'The authorization must be greater than zero and no greater than the remaining balance.', holdUnavailable: 'Bank authorization is unavailable for this account. Change the payment terms.', balanceDate: 'Enter a valid balance due date.', total: 'The order amount must be greater than zero for this payment option.',
    },
  },
  he: {
    steps: { reception: 'קבלת ההזמנה ופרטי לקוח', event: 'אירוע', payment: 'תשלום ואישור' },
    progress: 'שלב {current} מתוך {total}', previous: 'הקודם', next: 'המשך', errorsTitle: '{count} פרטים לתיקון',
    detailsByClient: 'הלקוח ישלים את הפרטים דרך קישור Foody', detailsByClientHint: 'פרטי קשר ואירוע חסרים יתבקשו מהלקוח לפני האישור.',
    additional: 'מידע נוסף', requirements: 'פרטים לבקשה מהלקוח', sameDate: 'שימוש בתאריך האיסוף או המשלוח', useAddress: 'העתקת כתובת המשלוח', useContact: 'העתקת פרטי הקשר של הלקוח',
    timingWarning: 'חלון קבלת ההזמנה מסתיים אחרי תחילת האירוע. בדקו את השעות המתוכננות.',
    production: 'תוכנית ייצור', productionDate: 'התאריך שנבחר: {date}', productionUnscheduled: 'להזמנה זו אין תאריך ייצור מתוכנן.', productionPending: 'ממתין לאישור הפרטים והתשלום שנקבע.', productionIncluded: 'ההזמנה תיכלל בתוכנית הייצור לאחר יצירתה.', productionAutomatic: 'ההכללה תלויה בתזמון ובתשלום. ניתן לבקש הוספה בשלב האחרון.',
    errors: {
      date: 'בחרו תאריך איסוף או משלוח תקין.', time: 'הזינו את שעת תחילת החלון.', windowEnd: 'הזינו את שעת סיום החלון.', windowOrder: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה. בחרו שעת סיום מאוחרת יותר.',
      name: 'הזינו את שם הלקוח.', phone: 'הזינו את מספר הטלפון של הלקוח.', address: 'הזינו את כתובת המשלוח.', fee: 'הזינו דמי משלוח של אפס ומעלה, עד שתי ספרות אחרי הנקודה.', feePending: 'דמי המשלוח מחושבים כעת. המתינו לתוצאה.', feeUnavailable: 'דמי המשלוח אינם זמינים. נסו שוב או קבעו סכום קבוע.',
      intent: 'בחרו כיצד לשלם עבור ההזמנה.', capability: 'אפשרות תשלום זו אינה זמינה. בחרו אפשרות אחרת.', received: 'אשרו שקיבלתם את הסכום הנוכחי של ההזמנה.', manualValue: 'הזינו הנחה גדולה מאפס, עד 100 בהנחה באחוזים.', manualReason: 'הזינו סיבה להנחה.',
      guests: 'הזינו מספר אורחים שלם בין 1 ל־100,000 אם נדרש.', eventDate: 'הזינו תאריך אירוע תקין.', eventTime: 'הזינו שעת אירוע תקינה.', eventName: 'שם האירוע מוגבל ל־120 תווים.', venue: 'המקום מוגבל ל־500 תווים.', contact: 'איש הקשר במקום מוגבל ל־200 תווים.', notes: 'ההנחיות מוגבלות ל־1,000 תווים.',
      deposit: 'המקדמה חייבת להיות גדולה מאפס וקטנה מסכום ההזמנה.', hold: 'תפיסת המסגרת חייבת להיות גדולה מאפס ולא לעלות על היתרה.', holdUnavailable: 'תפיסת מסגרת אינה זמינה בחשבון זה. שנו את תנאי התשלום.', balanceDate: 'הזינו תאריך תקין לתשלום היתרה.', total: 'סכום ההזמנה חייב להיות גדול מאפס עבור אפשרות תשלום זו.',
    },
  },
};
