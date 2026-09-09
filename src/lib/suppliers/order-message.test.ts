import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPurchaseOrderMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
} from "./order-message";

test("keeps supplier product names while translating the surrounding message", () => {
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
