import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Four screens let staff edit a customer's delivery address: the Clients page,
// the manual order sheet, "Modifier le client" on an order, and "Modifier la
// commande". Each used to carry its own copy of the form, and they had drifted —
// different grids, "Appartement" against "Appt", two of them missing the
// building code or the delivery notes entirely.
//
// Converting them once does not keep them converted. This test fails the moment
// a fifth screen hand-rolls the form again, which is how the drift started.

const SRC = join(process.cwd(), "src");
const OWNER = join("components", "customers", "CustomerDeliveryFields.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

test("only CustomerDeliveryFields renders the delivery address form", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    if (file.endsWith(OWNER)) continue;
    const src = readFileSync(file, "utf8");
    // A screen rendering its own building-code field is rendering its own copy
    // of the address form: that field exists nowhere else.
    if (/label=\{t\('buildingCode'\)\}/.test(src)) {
      offenders.push(file.slice(SRC.length + 1));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these files hand-roll the delivery address form instead of using ` +
      `CustomerDeliveryFields:\n  ${offenders.join("\n  ")}`,
  );
});

test("the guard actually looks at the component that owns the form", () => {
  // If the owner file were renamed or the field renamed, the test above would
  // pass vacuously by finding nothing anywhere. Pin that it finds it here.
  const owner = readFileSync(join(SRC, OWNER), "utf8");
  assert.match(owner, /label=\{t\('buildingCode'\)\}/);
});
