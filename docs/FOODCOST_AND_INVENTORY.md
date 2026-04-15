# Food Cost & Inventory — Flows by Case

> End-to-end setup guide for configuring a menu item so that (a) its food cost
> computes correctly on the **Cost** tab, and (b) inventory is properly tracked
> as orders come in.
>
> Cases below use the user's real numbers (OR ROUGE prep, Hamburger Normal/Grand,
> Hamburger + Extra Cheddar modifier) so you can sanity-check the app against
> the math as you go.

## Concepts cheat-sheet

| Term | What it is | Where it lives |
|---|---|---|
| **Stock item** | Raw inventory (tomatoes, cheese, beef, sunflower oil) with a purchase price | `/kitchen/stock` |
| **Prep item** | Something you cook in a batch and track as finished inventory (OR ROUGE, sauces) | `/kitchen/preparations` |
| **Menu item** | What the customer orders | `/menu/items` |
| **Ingredient** | Link between a menu item and a stock or prep item with a base quantity | Recipe tab on the menu item |
| **Variant** | A size of a menu item (Normal / Grand) stored as an Option Set attached to the item | `/menu/items/:id/variants` |
| **Modifier** | A customization (+extra cheddar, no onions) — can also consume stock | `/menu/modifier-sets/:id` |
| **Recipe yield** | For batch recipes: how much one batch produces (e.g. 1.2 kg of OR ROUGE) | Menu item → Recipe tab, or Prep item |
| **Portion size** | For per-portion items: the base portion (matches the "default" variant's size) | Menu item → Details → Stock Management |

### The core formula

For each ingredient on a menu item, at order time:

```
effective_qty = base_qty
              × (scales_with_variant ? variant.portion / item.portion : 1)
              × (item has batch yield ? variant.portion / item.recipe_yield : 1)

line_cost = convert(effective_qty → stock.unit) × stock.cost_per_unit
```

Plus, per selected modifier at order time:

```
mod_cost = mod.quantity × selected_count × source.cost_per_unit
```

Rules:
- **Per-portion mode** (`recipe_yield = 0`): only the variant ratio applies. `scales_with_variant` on an ingredient opts it into that ratio; unflagged ingredients stay fixed.
- **Batch mode** (`recipe_yield > 0`): only the batch ratio applies. All ingredients prorate uniformly by `variant.portion / yield`. The per-ingredient scales flag is hidden and ignored.
- **Same unit family required** for the variant ratio: `unit` vs `unit`, or `g/kg`, or `ml/l`. Cross-family (e.g. item in `unit`, variant in `g`) falls back to 1× with a warning banner on the Cost tab.

---

## Case A — OR ROUGE as a **Prep** (shared recipe, batch tracked)

> OR ROUGE is cooked in a 1.2 kg batch and used as an ingredient by other menu
> items (and possibly also sold as its own plate — see Case C for that side).
> First set up the **prep** so its unit cost is known everywhere it's used.

### 1. Stock items (raw inputs)

`/kitchen/stock` → create each raw input with a purchase price:

| Stock item | Example price |
|---|---|
| Huile de tournesol | ₪8 / L |
| Ail haché fin | ₪25 / kg |
| Poivron rouge | ₪15 / kg |
| Poivron vert | ₪12 / kg |
| Polpa Mutti | ₪10 / kg |
| Sel fin | ₪3 / kg |
| Poivre noir moulu | ₪120 / kg |

(Prices illustrative — the batch-cost line below uses the user's actual total.)

### 2. Prep item

`/kitchen/preparations` → "New":

- **Name**: L'OR ROUGE
- **Rendement par lot**: **1.2 kg** (or 1200 g — same thing)
- **Ingredients (per batch)**:

| Ingredient | Qty per batch |
|---|---:|
| Huile de tournesol | 330 g (or 0.33 L) |
| Ail haché fin | 40 g |
| Poivron rouge | 2.5 kg |
| Poivron vert | 500 g |
| Polpa Mutti | 600 g |
| Sel fin | 18 g |
| Poivre noir moulu | 4 g |

### 3. Expected cost

The batch cost (user's numbers):

```
Cost per batch      = ₪55.42
Cost per gram       = 55.42 / 1200 g = 0.04618 ₪/g
Cost per kg (display) ≈ 46.18 ₪/kg
```

Check on the prep's page — it should display `46.18 ₪/kg` (or your currency's equivalent).

---

## Case B — OR ROUGE as a **plated menu item** (served Normal / Grand)

> Same OR ROUGE, but sold at the counter in 250 g and 500 g portions. The
> menu item *consumes* from the OR ROUGE prep inventory.

### 1. Menu item Details

`/menu/items` → "New":

- **Name**: L'OR ROUGE
- **Price (Normal)**: ₪35 (the 250 g price)
- **Details** tab → *Gestion des stocks*:
  - Recipe type: **Portion unique**
  - **Portion par défaut**: **250 g** (editable; same unit as your variants)

### 2. Variants

Variantes → "Ajouter":

- Group name: `Taille`
- Rows:

| Variant | Prix | Portion |
|---|---:|---:|
| Normal | ₪35 | **250 g** |
| Grand | ₪70 | **500 g** |

> The variant portion unit now defaults to the item's unit (g), so you no
> longer have to change it per row.

### 3. Recipe tab → Ingredients

Single ingredient on this menu item — the OR ROUGE prep itself:

| Ingredient | Qté | Unité | Adapter à la variante |
|---|---:|---|---|
| L'OR ROUGE (Prép.) | **250** | g | ✅ |

### 4. Expected cost (matches user's numbers)

Formula: `effective_qty = 250 g × (variant.portion / 250) = variant.portion`.

| Variant | Effective qty | Cost |
|---|---:|---:|
| Normal (250 g) | 250 g | 250 × 0.04618 = **₪11.55** |
| Grand (500 g) | 500 g | 500 × 0.04618 = **₪23.09** |

Toggle between pills on the Cost tab to verify.

### 5. Inventory on sale

Each Normal sold → prep inventory decrements by 250 g. Each Grand → 500 g.
When the prep runs low, the kitchen cooks another 1.2 kg batch (which
decrements the raw stock inputs).

---

## Case C — Hamburger (per-portion, variants scale the beef)

> This is the canonical "assembled item with size variants" case.

### 1. Stock

All raw inputs in `/kitchen/stock`:

- Bœuf haché — buy price / kg
- Tomate, Laitue — buy price / kg
- (OR ROUGE prep, already created in Case A)

### 2. Menu item Details

- **Name**: Hamburger
- **Price (Normal)**: ₪70 (example)
- **Details** tab → *Gestion des stocks*:
  - Recipe type: **Portion unique**
  - **Portion par défaut**: **200 g** (the Normal size — same unit family as the variants)

### 3. Variants

`Variantes` → "Ajouter":

| Variant | Prix | Portion |
|---|---:|---:|
| Normal | ₪70 | **200 g** |
| Grand | ₪140 | **400 g** |

### 4. Ingredients (user's exact list)

| Ingredient | Qté | Unité | Adapter à la variante |
|---|---:|---|---|
| Tomate | 1 | g | ❌ |
| Laitue | 1 | g | ❌ |
| **Bœuf haché** | **200** | g | ✅ |
| L'OR ROUGE (Prép.) | 1 | g | ❌ |

### 5. Expected cost (user's numbers)

| Variant | Beef qty | Approx total |
|---|---:|---:|
| Normal (200 g) | 200 × (200/200) = 200 g | **~₪23** |
| Grand (400 g) | 200 × (400/200) = 400 g | **~₪43** |

> Δ (Grand − Normal) ≈ ₪20 ⇒ beef ≈ ₪100/kg. Fixed ingredients (tomate 1 g,
> laitue 1 g, OR ROUGE 1 g) contribute a few cents and stay constant between
> variants.

### 6. Inventory on sale

- Normal sold → 1 g tomate + 1 g laitue + 200 g bœuf + 1 g OR ROUGE prep.
- Grand sold → same list, but 400 g bœuf.
- The OR ROUGE prep inventory is decremented (1 g per sale); the OR ROUGE
  raw ingredients are *not* decremented until the next prep batch is cooked.

---

## Case D — Hamburger + "Extra Cheddar" modifier

> Customer taps a ✓ next to "Extra cheddar" and another 30 g of cheddar is drawn.
> Modifier stock consumption is applied at order time, on top of the base
> menu item cost.

### 1. Stock

Add `Cheddar` to `/kitchen/stock` with a price (e.g. ₪80 / kg = 0.08 ₪/g).

### 2. Modifier set

`/menu/modifier-sets` → "New":

- Name: `Suppléments`
- Autoriser plusieurs sélections: ✅ (so a customer can add 2× if they want)
- Add modifier row:
  - Name: `Extra cheddar`
  - Price: ₪7 (what you charge the customer)
- On that row click **"+ Lier une consommation de stock"** (the subrow below expands):
  - Consomme: **Cheddar** (from the Stock group)
  - Qté: **30**
  - Unité: **g**

Save the set.

### 3. Attach to the Hamburger

Hamburger → Modificateurs → "Ajouter" → pick `Suppléments`.

### 4. Expected cost

Cost tab now shows two sections:

**Food cost** (from ingredients, independent of modifier picks):

| Variant | Food cost |
|---|---:|
| Normal (200 g) | ~₪23 |
| Grand (400 g) | ~₪43 |

**Consommation des modificateurs**:

| Modifier | Consomme | Qté | Par sélection |
|---|---|---:|---:|
| Extra cheddar (Suppléments) | Cheddar (stock) | 30 g | 30 × 0.08 ≈ **₪2.4** (example) |

At order time:
- 1× Hamburger Normal + 1× Extra cheddar → food cost + 1 × modifier cost.
- 1× Hamburger Grand + 2× Extra cheddar → food cost (Grand) + 2 × modifier cost.

Inventory:
- Normal + cheddar ×1 → 1 g tomate + 1 g laitue + 200 g bœuf + 1 g OR ROUGE + **30 g cheddar**.
- Normal + cheddar ×2 → … + **60 g cheddar**.

> The user's "₪30 for Normal with cheese" and "₪40 for Grand with cheese"
> examples imply a specific cheese price that gives a ~₪7 per-selection draw.
> Adjust the cheddar stock price to match your real purchasing.

---

## Case E — Soup (batch item, served in multiple sizes)

> For true batch dishes where you cook a pot and serve portions. Variants
> pick the serving size; ingredients are authored per batch and the app
> prorates automatically.

### 1. Menu item Details

- Recipe type: **En lot**
- **Rendement**: `5 L`
- **Portion par défaut**: `250 ml` (hidden when variants exist)

### 2. Variants

| Variant | Prix | Portion |
|---|---:|---:|
| Bol | ₪18 | 250 ml |
| Grand bol | ₪32 | 500 ml |

### 3. Ingredients — per batch

| Ingredient | Qty per batch |
|---|---:|
| Tomate | 2 kg |
| Oignon | 500 g |
| Ail | 30 g |
| Huile d'olive | 100 ml |

> In batch mode, the "Adapter à la variante" toggle is **hidden** on each
> ingredient — all ingredients prorate uniformly by `variant.portion / yield`.

### 4. Expected cost

For each variant: `line_cost = ing.qty × (variant.portion / yield) × unit_cost`.

- 250 ml portion: each ingredient × 250/5000 = 0.05 of its batch qty.
- 500 ml portion: × 500/5000 = 0.10 of its batch qty.

Cost tab shows both.

---

## Case F — Triple burger with non-linear scaling

> Triple burger has 550 g of meat — not 600 g (3×). Use a fractional portion.

- Item portion: 200 g
- Variants: Normal 200 g, Double 400 g, **Triple** 550 g
- Beef ingredient: Qté 200 g, ✅ Adapter à la variante

Ratios: Normal 1×, Double 2×, Triple 2.75×. Beef: 200 / 400 / 550 g. ✓

---

## Step-by-step checklist (for any new dish)

1. **List raw ingredients** → add to `/kitchen/stock` with purchase prices.
2. **Any sub-recipes?** (sauce, oil mix, OR ROUGE, caramelized onions…) → create
   in `/kitchen/preparations` with a batch yield and per-batch ingredient list.
3. **Create the menu item** in `/menu/items`:
   - Pick the recipe type:
     - **Portion unique** for assembled dishes (hamburger, sandwich, plated dish that draws from a prep).
     - **En lot** only for things cooked as a pot (soup, stew) where you also author raw ingredients per batch.
   - Set **Portion par défaut** — base portion size (use the same unit as your variants).
4. **Add variants** (if any sizing). The Portion column auto-defaults to the
   item's unit, so they'll line up.
5. **Recipe** tab → add ingredients:
   - Fixed ingredients (bun, 1 g sauce, etc.): just the base qty.
   - Scaling ingredients (beef, sauce in proportion to size): tick **Adapter à la variante**.
6. **Modifiers** with inventory impact:
   - `/menu/modifier-sets` → open the set → per modifier, click **"+ Lier une consommation de stock"** → pick stock/prep + qty + unit.
   - Attach the set to the menu item.
7. **Verify on the Cost tab**: click between variant pills; ingredient table
   shows the effective qty per variant; modifier consumption section lists the
   per-selection cost of each linked modifier.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Cost is 0 | Ingredient `Qté` is 0 (was hidden under the old UI) | Recipe tab → fill `Qté` on each row, save |
| All variants show the same cost | Unit-family mismatch (item portion in `unit`, variants in `g`) — a yellow banner explains this | Details tab → set item portion to the same unit as your variants (e.g. 200 g), save |
| Grand costs 2× *all* ingredients (bun included) | Item is in "En lot" (batch) mode → uniform proration | Details tab → switch to **Portion unique**, then flag only the scaling ingredients |
| Toggle "Adapter à la variante" missing on an ingredient | Item has a recipe yield > 0 (batch mode) | Either clear the yield (Recipe tab) or accept batch proration |
| Warning "Unités incompatibles" | Item portion and variant portion are in different unit families | Make them both in the same family (both g, or both unit, etc.) |
| Prep cost shows 0 | Prep has no ingredients, or yield = 0 | Fix the prep first |
| Modifier cost isn't added to base food cost | By design — it's customer-selected at order time | See the "Consommation des modificateurs" section on the Cost tab for per-selection cost |

## Where things live

| What | Path |
|---|---|
| Stock items | `foodyadmin/src/app/[restaurantId]/kitchen/stock/` |
| Prep items | `foodyadmin/src/app/[restaurantId]/kitchen/preparations/` |
| Menu item editor | `foodyadmin/src/app/[restaurantId]/menu/items/[itemId]/` |
| Variants editor | `foodyadmin/src/app/[restaurantId]/menu/items/[itemId]/variants/` |
| Modifier sets | `foodyadmin/src/app/[restaurantId]/menu/modifier-sets/[setId]/` |
| Cost tab / panel | `foodyadmin/src/components/menu-item/MenuItemCostPanel.tsx` |
| Ingredient editor | `foodyadmin/src/components/food-cost/MenuItemIngredientsEditor.tsx` |
| Cost math | `calcLineCost` + `calcVariantLineCost` in `MenuItemCostPanel.tsx` |
| Unit helpers | `foodyadmin/src/lib/units.ts` (`toBaseUnit`, `convertQuantity`, `sameUnitFamily`) |
| Modifier model | `foodyserver/internal/common/models.go` (`MenuItemModifier`) |
| Modifier migration | `foodyserver/migrations/055_modifier_stock_link.sql` |
