import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPurchaseOrderMessage,
  buildWhatsAppUrl,
  formatOrderQuantity,
  formatPurchaseOrderDeliveryWindow,
  localizedOrderItemName,
  normalizeWhatsAppPhone,
} from "./order-message";

test("formats an exact localized delivery window with a helpful relative day", () => {
  const now = new Date("2026-09-10T07:00:00.000Z");
  const start = "2026-09-11T05:00:00.000Z";
  const end = "2026-09-11T07:00:00.000Z";
  assert.equal(
    formatPurchaseOrderDeliveryWindow(start, end, "fr", "Asia/Jerusalem", now),
    "demain, vendredi 11 septembre 2026, 08:00–10:00",
  );
  assert.equal(
    formatPurchaseOrderDeliveryWindow(start, end, "he", "Asia/Jerusalem", now),
    "מחר, יום שישי, 11 בספטמבר 2026, 08:00–10:00",
  );
});

test("falls back to the original item name when no translation exists", () => {
  const message = buildPurchaseOrderMessage(
    {
      restaurantName: "Sea You",
      supplierName: "Moshe",
      items: [{ name: "אבוקדו האס", quantity: 12, unit: "kg" }],
    },
    "fr",
  );
  assert.match(message, /Voici la commande de Sea You/);
  assert.match(message, /אבוקדו האס — 12 kg/);
});

test("normalizes Israeli local numbers and encodes a WhatsApp deep link", () => {
  assert.equal(normalizeWhatsAppPhone("050-123 45 67"), "972501234567");
  assert.equal(
    buildWhatsAppUrl("+972 50-123-4567", "Bonjour & merci"),
    "https://wa.me/972501234567?text=Bonjour%20%26%20merci",
  );
});

test("rejects an unusable WhatsApp number", () => {
  assert.equal(buildWhatsAppUrl("123", "hello"), null);
});

test("uses the selected packaging in supplier messages", () => {
  const item = {
    name: "Tomates",
    quantity: 9.6,
    unit: "kg",
    packaging_set: true,
    package_count: 2,
    units_per_pack: 12,
    unit_size: 400,
    unit_size_unit: "g",
    container_type: "cartons",
    unit_type: "barquettes",
  };

  assert.equal(
    formatOrderQuantity(item, "fr"),
    "2 cartons × 12 barquettes × 400 g (9,6 kg au total)",
  );
  assert.match(
    buildPurchaseOrderMessage(
      {
        restaurantName: "Sea You",
        supplierName: "Moshé",
        items: [item],
      },
      "he",
    ),
    /2 cartons × 12 barquettes × 400 גרם \(סה״כ 9\.6 ק״ג\)/,
  );
});

test("uses the item name translated for the selected message language", () => {
  const item = {
    name: "Oignon vert",
    quantity: 1,
    unit: "kg",
    translations: {
      name: { en: "Spring onion", he: "בצל ירוק" },
    },
  };

  assert.equal(localizedOrderItemName(item, "he"), "בצל ירוק");
  assert.equal(localizedOrderItemName(item, "en"), "Spring onion");
  assert.equal(localizedOrderItemName(item, "fr"), "Oignon vert");
  assert.match(
    buildPurchaseOrderMessage(
      {
        restaurantName: "Sea You",
        supplierName: "Moshé",
        items: [item],
      },
      "he",
    ),
    /בצל ירוק — 1 ק״ג/,
  );
});

test("uses and localizes the chef-selected unit in supplier messages", () => {
  const item = {
    name: "Tomates",
    quantity: 1,
    unit: "kg",
    order_quantity: 8,
    order_unit: "unité",
  };

  assert.equal(formatOrderQuantity(item, "fr"), "8 unités");
  assert.equal(formatOrderQuantity(item, "en"), "8 units");
  assert.equal(formatOrderQuantity(item, "he"), "8 יחידות");
});

test("translates standard stock units and keeps Hebrew lines RTL", () => {
  assert.equal(
    formatOrderQuantity({ name: "Tomato", quantity: 2, unit: "kg" }, "he"),
    "2 ק״ג",
  );
  assert.equal(
    formatOrderQuantity({ name: "Herbs", quantity: 80, unit: "g" }, "he"),
    "80 גרם",
  );
  assert.equal(
    formatOrderQuantity({ name: "Oil", quantity: 1, unit: "l" }, "he"),
    "1 ליטר",
  );
  assert.equal(
    formatOrderQuantity({ name: "Sauce", quantity: 250, unit: "ml" }, "he"),
    "250 מ״ל",
  );

  const message = buildPurchaseOrderMessage(
    {
      restaurantName: "Sea You",
      supplierName: "Moshé",
      items: [{ name: "Tomato", quantity: 2, unit: "kg" }],
    },
    "he",
  );
  for (const line of message.split("\n").filter(Boolean)) {
    assert.ok(line.startsWith("\u200F"));
  }
  assert.match(message, /• Tomato — 2 ק״ג/);
});
