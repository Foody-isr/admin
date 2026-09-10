import type { PurchaseOrderItemInput, SupplierOrderLanguage } from "@/lib/api";

interface PurchaseOrderMessageInput {
  restaurantName: string;
  supplierName: string;
  expectedDeliveryAt?: string | null;
  expectedDeliveryEndAt?: string | null;
  items: Pick<
    PurchaseOrderItemInput,
    | "name"
    | "quantity"
    | "unit"
    | "order_quantity"
    | "order_unit"
    | "packaging_set"
    | "package_count"
    | "units_per_pack"
    | "unit_size"
    | "unit_size_unit"
    | "container_type"
    | "unit_type"
    | "translations"
  >[];
  notes?: string;
  timeZone?: string;
}

const localeByLanguage: Record<SupplierOrderLanguage, string> = {
  en: "en-GB",
  fr: "fr-FR",
  he: "he-IL",
};

const copy = {
  en: {
    hello: "Hello",
    order: "Here is the order from",
    delivery: "Requested delivery",
    notes: "Notes",
    total: "total",
    confirm: "Please confirm availability. Thank you.",
  },
  fr: {
    hello: "Bonjour",
    order: "Voici la commande de",
    delivery: "Livraison souhaitée",
    notes: "Notes",
    total: "au total",
    confirm: "Merci de confirmer la disponibilité.",
  },
  he: {
    hello: "שלום",
    order: "להלן ההזמנה של",
    delivery: "משלוח מבוקש",
    notes: "הערות",
    total: "סה״כ",
    confirm: "נא לאשר זמינות. תודה.",
  },
} satisfies Record<SupplierOrderLanguage, Record<string, string>>;

const relativeDays: Record<SupplierOrderLanguage, readonly string[]> = {
  en: ["today", "tomorrow", "the day after tomorrow"],
  fr: ["aujourd’hui", "demain", "après-demain"],
  he: ["היום", "מחר", "מחרתיים"],
};

function calendarDayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return (
    Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) /
    86_400_000
  );
}

export function formatPurchaseOrderDeliveryWindow(
  expectedDeliveryAt: string,
  expectedDeliveryEndAt: string | null | undefined,
  language: SupplierOrderLanguage,
  timeZone = "Asia/Jerusalem",
  now = new Date(),
): string {
  const start = new Date(expectedDeliveryAt);
  if (Number.isNaN(start.getTime())) return "";
  const dateLabel = new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(localeByLanguage[language], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  let timeLabel = timeFormatter.format(start);
  if (expectedDeliveryEndAt) {
    const end = new Date(expectedDeliveryEndAt);
    if (!Number.isNaN(end.getTime()) && end > start) {
      const sameDay =
        calendarDayNumber(start, timeZone) === calendarDayNumber(end, timeZone);
      timeLabel += sameDay
        ? `–${timeFormatter.format(end)}`
        : `–${new Intl.DateTimeFormat(localeByLanguage[language], {
            dateStyle: "medium",
            timeStyle: "short",
            hourCycle: "h23",
            timeZone,
          }).format(end)}`;
    }
  }
  const dayDifference =
    calendarDayNumber(start, timeZone) - calendarDayNumber(now, timeZone);
  const relative =
    dayDifference >= 0 && dayDifference <= 2
      ? relativeDays[language][dayDifference]
      : "";
  return [relative, dateLabel, timeLabel].filter(Boolean).join(", ");
}

const packagingLabels: Record<SupplierOrderLanguage, Record<string, string>> = {
  en: {
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    unit: "unit",
    units: "units",
    piece: "piece",
    pieces: "pieces",
    unité: "unit",
    unités: "units",
    paquet: "pack",
    paquets: "packs",
    carton: "carton",
    pack: "pack",
    crate: "crate",
    sack: "sack",
    case: "case",
    tray: "tray",
    plaquette: "tray",
    bottle: "bottle",
    can: "can",
    jar: "jar",
    bag: "bag",
    brick: "brick",
    packet: "packet",
    box: "box",
    sachet: "sachet",
    tub: "tub",
    pot: "pot",
    jug: "jug",
  },
  fr: {
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
    unit: "unité",
    units: "unités",
    piece: "pièce",
    pieces: "pièces",
    unité: "unité",
    unités: "unités",
    paquet: "paquet",
    paquets: "paquets",
    carton: "carton",
    pack: "pack",
    crate: "cageot",
    sack: "sac",
    case: "caisse",
    tray: "plateau",
    plaquette: "plaquette",
    bottle: "bouteille",
    can: "conserve",
    jar: "pot",
    bag: "sac",
    brick: "brique",
    packet: "paquet",
    box: "boîte",
    sachet: "sachet",
    tub: "pot",
    pot: "pot",
    jug: "bidon",
  },
  he: {
    g: "גרם",
    gram: "גרם",
    grams: "גרם",
    gramme: "גרם",
    grammes: "גרם",
    kg: "ק״ג",
    kilogram: "ק״ג",
    kilograms: "ק״ג",
    kilogramme: "ק״ג",
    kilogrammes: "ק״ג",
    ml: "מ״ל",
    milliliter: "מ״ל",
    milliliters: "מ״ל",
    millilitre: "מ״ל",
    millilitres: "מ״ל",
    l: "ליטר",
    liter: "ליטר",
    liters: "ליטר",
    litre: "ליטר",
    litres: "ליטר",
    unit: "יחידה",
    units: "יחידות",
    piece: "יחידה",
    pieces: "יחידות",
    unité: "יחידה",
    unités: "יחידות",
    paquet: "חבילה",
    paquets: "חבילות",
    carton: "קרטון",
    pack: "חבילה",
    crate: "ארגז",
    sack: "שק",
    case: "מארז",
    tray: "תבנית",
    plaquette: "מארז",
    bottle: "בקבוק",
    can: "קופסת שימור",
    jar: "צנצנת",
    bag: "שקית",
    brick: "קרטונית",
    packet: "חבילה",
    box: "קופסה",
    sachet: "שקיק",
    tub: "קופסת פלסטיק",
    pot: "כלי",
    jug: "מיכל",
  },
};

const pluralPackagingLabels: Record<
  SupplierOrderLanguage,
  Record<string, string>
> = {
  en: {
    unit: "units",
    unité: "units",
    piece: "pieces",
    pièce: "pieces",
    pack: "packs",
    packet: "packets",
    paquet: "packs",
    botte: "bunches",
  },
  fr: {
    unit: "unités",
    unité: "unités",
    piece: "pièces",
    pièce: "pièces",
    pack: "packs",
    packet: "paquets",
    paquet: "paquets",
    botte: "bottes",
  },
  he: {
    unit: "יחידות",
    unité: "יחידות",
    piece: "יחידות",
    pièce: "יחידות",
    pack: "חבילות",
    packet: "חבילות",
    paquet: "חבילות",
    botte: "צרורות",
  },
};

function packagingLabel(
  value: string | undefined,
  language: SupplierOrderLanguage,
  quantity = 1,
): string {
  if (!value) return "";
  const key = value.trim().toLocaleLowerCase();
  if (quantity !== 1 && pluralPackagingLabels[language][key]) {
    return pluralPackagingLabels[language][key];
  }
  return packagingLabels[language][key] || value;
}

function formatQuantity(
  value: number,
  language: SupplierOrderLanguage,
): string {
  return new Intl.NumberFormat(localeByLanguage[language], {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatOrderQuantity(
  item: PurchaseOrderMessageInput["items"][number],
  language: SupplierOrderLanguage,
): string {
  if (
    item.order_quantity &&
    item.order_unit &&
    (!item.packaging_set || !item.package_count)
  ) {
    return `${formatQuantity(item.order_quantity, language)} ${packagingLabel(item.order_unit, language, item.order_quantity)}`.trim();
  }
  if (!item.packaging_set || !item.package_count) {
    return `${formatQuantity(item.quantity, language)} ${packagingLabel(item.unit, language, item.quantity)}`.trim();
  }

  const parts = [
    `${formatQuantity(item.package_count, language)} ${packagingLabel(item.container_type, language, item.package_count) || item.unit || ""}`.trim(),
  ];
  if (item.units_per_pack) {
    parts.push(
      `× ${formatQuantity(item.units_per_pack, language)} ${packagingLabel(item.unit_type, language, item.units_per_pack)}`.trim(),
    );
  }
  if (item.unit_size) {
    parts.push(
      `× ${formatQuantity(item.unit_size, language)} ${packagingLabel(item.unit_size_unit || item.unit, language, item.unit_size)}`.trim(),
    );
  }
  const totalQuantity = formatQuantity(item.quantity, language);
  const totalUnit = packagingLabel(item.unit, language, item.quantity);
  parts.push(
    language === "he"
      ? `(${copy.he.total} ${totalQuantity} ${totalUnit})`
      : `(${totalQuantity} ${totalUnit} ${copy[language].total})`,
  );
  return parts.join(" ");
}

export function localizedOrderItemName(
  item: PurchaseOrderMessageInput["items"][number],
  language: SupplierOrderLanguage,
): string {
  return item.translations?.name?.[language]?.trim() || item.name;
}

/** Builds the human-readable supplier message with localized item snapshots,
 * falling back to the original stock name when a translation is unavailable. */
export function buildPurchaseOrderMessage(
  input: PurchaseOrderMessageInput,
  language: SupplierOrderLanguage,
): string {
  const t = copy[language];
  const lines = [
    `${t.hello} ${input.supplierName},`,
    "",
    `${t.order} ${input.restaurantName}:`,
  ];

  if (input.expectedDeliveryAt) {
    const delivery = formatPurchaseOrderDeliveryWindow(
      input.expectedDeliveryAt,
      input.expectedDeliveryEndAt,
      language,
      input.timeZone,
    );
    if (delivery) {
      lines.push(`${t.delivery}: ${delivery}`);
    }
  }

  lines.push("");
  input.items.forEach((item) => {
    lines.push(
      `• ${localizedOrderItemName(item, language)} — ${formatOrderQuantity(item, language)}`.trim(),
    );
  });
  if (input.notes?.trim()) {
    lines.push("", `${t.notes}: ${input.notes.trim()}`);
  }
  lines.push("", t.confirm);
  if (language === "he") {
    // WhatsApp decides direction per line. A right-to-left mark keeps bullets,
    // punctuation and quantities stable even when names contain Latin text.
    return lines.map((line) => (line ? `\u200F${line}` : line)).join("\n");
  }
  return lines.join("\n");
}

/** Converts common local phone formats to the digits-only format wa.me expects. */
export function normalizeWhatsAppPhone(
  phone: string,
  defaultCountryCode = "972",
): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0"))
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppUrl(
  phone: string,
  message: string,
): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (normalized.length < 8) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
