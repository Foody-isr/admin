import type { Locale } from './i18n';

const labels = {
  terminalName: {"en":"Terminal name","fr":"Nom du terminal","he":"שם מסוף"},
  terminalId: {"en":"Terminal number","fr":"Numéro de terminal","he":"מספר מסוף"},
  merchantId: {"en":"Merchant number","fr":"Numéro commerçant","he":"מספר בית עסק"},
  transactionDateTime: {"en":"Date and time","fr":"Date et heure","he":"תאריך ושעה"},
  transactionType: {"en":"Transaction type","fr":"Type de transaction","he":"סוג עסקה"},
  creditTerms: {"en":"Credit terms","fr":"Conditions de crédit","he":"סוג אשראי"},
  cardName: {"en":"Card brand","fr":"Marque de la carte","he":"מותג הכרטיס"},
  pan: {"en":"Card number","fr":"Numéro de carte","he":"מספר כרטיס"},
  panEntryMode: {"en":"Card entry mode","fr":"Mode de lecture de la carte","he":"אופן קריאת הכרטיס"},
  currency: {"en":"Currency","fr":"Devise","he":"מטבע"},
  transactionAmount: {"en":"Transaction amount","fr":"Montant de la transaction","he":"סכום עסקה"},
  transactionTotalAmount: {"en":"Total amount","fr":"Montant total","he":"סכום כולל"},
  issuerApprovalNumber: {"en":"Issuer approval number","fr":"Numéro d’autorisation de l’émetteur","he":"מספר אישור מנפיק"},
  issuerResponseCode: {"en":"Issuer response code","fr":"Code de réponse de l’émetteur","he":"קוד תשובת מנפיק"},
  authorizationNumber: {"en":"Authorization number","fr":"Numéro d’autorisation","he":"מספר אישור"},
  uid: {"en":"Transaction reference","fr":"Référence de transaction","he":"מזהה עסקה"},
  transId: {"en":"Ashrait transaction ID","fr":"Identifiant de transaction Ashrait","he":"מזהה עסקה באשראית"},
  rrn: {"en":"Retrieval reference (RRN)","fr":"Référence de rapprochement (RRN)","he":"אסמכתת אחזור (RRN)"},
  systemTraceNumber: {"en":"System trace number","fr":"Numéro de trace système","he":"מספר מעקב מערכת"},
  emvApplicationIdentifier: {"en":"EMV application identifier (AID)","fr":"Identifiant d’application EMV (AID)","he":"מזהה יישום EMV (AID)"},
  emvApplicationTransactionCounter: {"en":"EMV transaction counter (ATC)","fr":"Compteur de transactions EMV (ATC)","he":"מונה עסקאות EMV (ATC)"},
  emvTerminalVerificationResult: {"en":"EMV terminal verification (TVR)","fr":"Résultat de vérification EMV (TVR)","he":"תוצאת אימות מסוף (TVR)"},
  emvTransactionStatusInformation: {"en":"EMV transaction status (TSI)","fr":"Statut de transaction EMV (TSI)","he":"סטטוס עסקת EMV (TSI)"},
  softwareVersion: {"en":"Software version","fr":"Version logicielle","he":"גרסת תוכנה"},
  isSignatureRequired: {"en":"Signature required","fr":"Signature requise","he":"נדרשת חתימה"},
  isCustomerPhoneRequired: {"en":"Customer phone required","fr":"Téléphone client requis","he":"נדרש טלפון לקוח"},
} as const;

type Field = keyof typeof labels;

/** Printable customer and merchant copies for one recorded terminal result. */
export interface AshraitCardReceipt {
  transaction: Partial<Record<Field, string>>;
  customer?: Partial<Record<Field, string>>;
  merchant?: Partial<Record<Field, string>>;
}

/** The browser prints only the selected copy. */
export type AshraitCopy = 'customer' | 'merchant';

const envelopeFields = new Set(['uid', 'authorizationNumber', 'transId']);
const unsafe = /[\x00-\x1f\x7f<>|\u202a-\u202e\u2066-\u2069]/;
const panLike = /(?:[0-9][ -]?){12}[0-9]/;
const secret = /(^|[^a-z])(cvv|cvc|pin[ _-]?(block|code)|track[ _-]?[12]|access[ _-]?token|refresh[ _-]?token|password)($|[^a-z])/i;
const safeReference = (value: string) =>
  /^[a-z0-9_-]{1,64}$/i.test(value) && (/^[0-9]{23}$/.test(value) || !panLike.test(value)) && !secret.test(value);
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function decodeFields(raw: unknown, reference: string, envelope: boolean) {
  if (!isObject(raw)) throw new Error('ashraitReceiptLoadError');
  const entries = Object.entries(raw);
  if (entries.length === 0 || entries.length > (envelope ? 3 : 24)) {
    throw new Error('ashraitReceiptLoadError');
  }
  const result: Partial<Record<Field, string>> = {};
  for (const [key, value] of entries) {
    if (!Object.hasOwn(labels, key) || typeof value !== 'string' || value.length === 0 ||
        value.length > 120 || unsafe.test(value) || (envelope && !envelopeFields.has(key)) ||
        (!envelope && key !== 'uid' && envelopeFields.has(key))) {
      throw new Error('ashraitReceiptLoadError');
    }
    const valid = key === 'uid' ? value === reference
      : key === 'transId' ? safeReference(value)
      : key === 'pan' ? /^\*{4} [0-9]{4}$/.test(value)
      : key === 'emvApplicationIdentifier' ? /^[A-Fa-f][0-9A-Fa-f]{9,31}$/.test(value) && value.length % 2 === 0
      : !panLike.test(value) && !secret.test(value);
    if (!valid) throw new Error('ashraitReceiptLoadError');
    result[key as Field] = value;
  }
  return result;
}

/** Decodes the masked projection for the exact selected payment reference. */
export function decodeAshraitCardReceipt(raw: unknown, reference: string): AshraitCardReceipt {
  if (!safeReference(reference) || !isObject(raw) ||
      Object.keys(raw).some(key => !['transaction', 'customer', 'merchant'].includes(key))) {
    throw new Error('ashraitReceiptLoadError');
  }
  const transaction = decodeFields(raw.transaction, reference, true);
  const customer = raw.customer === undefined ? undefined : decodeFields(raw.customer, reference, false);
  const merchant = raw.merchant === undefined ? undefined : decodeFields(raw.merchant, reference, false);
  if (transaction.uid !== reference || (!customer && !merchant)) throw new Error('ashraitReceiptLoadError');
  return { transaction, customer, merchant };
}

/** Produces the ordered screen and paper rows for one copy. */
export function ashraitReceiptFields(receipt: AshraitCardReceipt, copy: AshraitCopy, locale: Locale) {
  const fields = receipt[copy];
  if (!fields) return [];
  const rows: Array<{ key: Field; label: string; value: string }> = [];
  for (const key of Object.keys(labels) as Field[]) {
    const value = fields[key] ?? receipt.transaction[key];
    if (value === undefined) continue;
    const inAgorot = (key === 'transactionAmount' || key === 'transactionTotalAmount') &&
      ['ILS', '376', 'ש"ח', 'ש״ח', '₪'].includes(fields.currency ?? '') && /^-?[0-9]{1,12}$/.test(value);
    rows.push({
      key,
      label: labels[key][locale],
      value: inAgorot ? (Number(value) / 100).toFixed(2) + ' ILS' : value,
    });
  }
  return rows;
}
