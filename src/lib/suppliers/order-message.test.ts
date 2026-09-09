import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPurchaseOrderMessage,
  buildWhatsAppUrl,
  formatOrderQuantity,
  localizedOrderItemName,
  normalizeWhatsAppPhone,
} from "./order-message";

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
    /2 cartons × 12 barquettes × 400 g \(9\.6 kg סה"כ\)/,
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
    /בצל ירוק — 1 kg/,
  );
});
