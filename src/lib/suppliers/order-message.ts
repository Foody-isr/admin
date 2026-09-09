import type { PurchaseOrderItemInput, SupplierOrderLanguage } from "@/lib/api";

interface PurchaseOrderMessageInput {
  restaurantName: string;
  supplierName: string;
  expectedDeliveryAt?: string | null;
  items: Pick<PurchaseOrderItemInput, "name" | "quantity" | "unit">[];
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
    confirm: "Please confirm availability. Thank you.",
  },
  fr: {
    hello: "Bonjour",
    order: "Voici la commande de",
    delivery: "Livraison souhaitée",
    notes: "Notes",
    confirm: "Merci de confirmer la disponibilité.",
  },
  he: {
    hello: "שלום",
    order: "להלן ההזמנה של",
    delivery: "משלוח מבוקש",
    notes: "הערות",
    confirm: "נא לאשר זמינות. תודה.",
  },
} satisfies Record<SupplierOrderLanguage, Record<string, string>>;

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

/** Builds the human-readable supplier message. Product names remain untouched
 * so the order uses the supplier's own catalogue terminology. */
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
      `• ${item.name} — ${formatQuantity(item.quantity)} ${item.unit || ""}`.trim(),
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
