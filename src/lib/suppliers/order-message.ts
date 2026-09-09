import type { PurchaseOrderItemInput, SupplierOrderLanguage } from "@/lib/api";

interface PurchaseOrderMessageInput {
  restaurantName: string;
  supplierName: string;
  expectedDeliveryAt?: string | null;
  items: Pick<
    PurchaseOrderItemInput,
    | "name"
    | "quantity"
    | "unit"
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
    total: 'סה"כ',
    confirm: "נא לאשר זמינות. תודה.",
  },
} satisfies Record<SupplierOrderLanguage, Record<string, string>>;

const packagingLabels: Record<SupplierOrderLanguage, Record<string, string>> = {
  en: {
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

function packagingLabel(
  value: string | undefined,
  language: SupplierOrderLanguage,
): string {
  if (!value) return "";
  return packagingLabels[language][value] || value;
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
  if (!item.packaging_set || !item.package_count) {
    return `${formatQuantity(item.quantity, language)} ${item.unit || ""}`.trim();
  }

  const parts = [
    `${formatQuantity(item.package_count, language)} ${packagingLabel(item.container_type, language) || item.unit || ""}`.trim(),
  ];
  if (item.units_per_pack) {
    parts.push(
      `× ${formatQuantity(item.units_per_pack, language)} ${packagingLabel(item.unit_type, language)}`.trim(),
    );
  }
  if (item.unit_size) {
    parts.push(
      `× ${formatQuantity(item.unit_size, language)} ${item.unit_size_unit || item.unit || ""}`.trim(),
    );
  }
  parts.push(
    `(${formatQuantity(item.quantity, language)} ${item.unit || ""} ${copy[language].total})`.replace(
      /\s+/g,
      " ",
    ),
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
    const date = new Date(input.expectedDeliveryAt);
    if (!Number.isNaN(date.getTime())) {
      lines.push(
        `${t.delivery}: ${new Intl.DateTimeFormat(localeByLanguage[language], {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: input.timeZone || "Asia/Jerusalem",
        }).format(date)}`,
      );
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
