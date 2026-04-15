# Food Cost & Inventory — Flows by Case

> End-to-end setup guide for configuring a menu item so that (a) its food cost
> computes correctly on the **Cost** tab, and (b) inventory is properly tracked
> as orders come in.
>
> Uses the unified scaling model: `effective_qty = base_qty × variantRatio × batchRatio`
> where each ratio defaults to 1 when not applicable.

## Concepts cheat-sheet

| Term | What it is | Where it lives |
|---|---|---|
| **Stock item** | Raw inventory (tomatoes, cheese, chicken breast) with a purchase price | `/kitchen/stock` |
| **Prep item** | Something you cook in a batch and track as finished inventory (OR ROUGE, caramelized onions, special sauce) | `/kitchen/preparations` |
| **Menu item** | What the customer orders | `/menu/items` |
| **Ingredient** | Link between a menu item and a stock or prep item with a base quantity | Cost/Recipe tab on the menu item |
| **Variant** | A size or version of a menu item (Normal / Grand, 250 ml / 500 ml) — stored as an Option Set attached to the item | `/menu/items/:id/variants` |
| **Modifier** | A customization the customer can add (+extra cheese, no onions) | `/menu/modifier-sets/:id` |
| **Recipe yield** | For batch items: how much one batch produces (e.g. 1.21 kg of OR ROUGE) | Menu item → Details → Stock Management → "En lot" |
| **Portion size** | For per-portion items: what one sale represents (1 unit for a burger; 250 ml for a soup bowl) | Menu item → Details → Stock Management |

### The core formula

For each ingredient on a menu item, at order time:

```
effective_qty = base_qty
              × (scales_with_variant ? variant.portion / item.portion : 1)
              × (item has batch yield ? variant.portion / item.recipe_yield : 1)

line_cost = convert(effective_qty → stock.unit) × stock.cost_per_unit
```

Plus, per selected modifier:

```
mod_cost = mod.quantity × selected_count × source.cost_per_unit
```

Everything else is UI around these two lines.

---

## Case A — Simple assembled item (Hamburger)

> Sold per unit. Fixed recipe. No variants.

### 1. Stock

1. `/kitchen/stock` → "Add stock item" for each raw component:
   - Viande hachée — 5 kg carton, ₪X/kg
   - Pain burger — 20 unit box, ₪X/unit
   - Laitue, tomate, oignon, fromage, etc.
2. Enter purchase price and packaging (carton / pack / direct).

### 2. Menu item

1. `/menu/items` → "New" → Hamburger, category "Sandwichs", price ₪70.
2. On the **Details** tab → *Gestion des stocks* section:
   - Recipe type: **1 portion** (hardcodes `portion_size = 1 unit`).
3. Save.

### 3. Recipe / Ingredients

Switch to **Recipe** (or **Cost**) tab → Ingredients:

| Ingredient | Qty | Unit | Scale with variant? |
|---|---:|---|---|
| Viande hachée | 200 | g | — (no variants yet) |
| Pain burger | 1 | unit | — |
| Laitue | 15 | g | — |
| Tomate | 20 | g | — |
| Sauce burger | 10 | g | — |

Save (auto-saves on change).

### 4. Verify on Cost tab

- Cost = sum of each line (`qty × cost_per_unit`, with g↔kg / ml↔l conversion).
- Marge shown as **Prix TTC − TVA − Cost** so everything is on the same VAT basis.
- No variants → no pills, mini P&L shown.

### 5. At order time

- POS / web sends an OrderItem referencing the menu item ID.
- Inventory decrements by the ingredient list (one ingredient at a time).

---

## Case B — Hamburger with size variants (Normal / Grand)

> Meat scales 2×, buns stay 1×. Same recipe scaled.

Start from Case A, then add variants.

### 1. Variants

1. On the item's Edit modal → **Variantes** → "Modifier" (or "Ajouter"):
   - Variant group name: "Taille"
   - Row 1: **Normal**, Prix = 70, Portion = **1 unit**
   - Row 2: **Grand**, Prix = 140, Portion = **2 unit**
2. Save.

> **Why `unit`?** The item is in "1 portion" mode. The variant portion is the
> scale factor: `2 unit` means "2× the base portion." Fractional values are
> fine (Triple = **2.75 unit** produces 550 g of meat from a 200 g base).

### 2. Flag the ingredients that should scale

Back on Ingredients:

| Ingredient | Qty | Scale with variant? |
|---|---:|---|
| Viande hachée | 200 g | ✅ |
| Pain burger | 1 unit | ❌ (one bun either way) |
| Laitue | 15 g | ❌ |
| Tomate | 20 g | ❌ |
| Sauce burger | 10 g | ✅ (more meat → more sauce) |

### 3. Verify on Cost tab

- Variant pills appear (Normal / Grand).
- Click **Normal** → Viande 200 g, Sauce 10 g, Total ₪X.
- Click **Grand** → Viande 400 g, Sauce 20 g, Pain still 1 unit, Total ₪Y.
- Marge per variant verified against the variant's price.

### 4. At order time

- OrderItem records the selected variant ID.
- Inventory decrement uses the scaled qty: Grand consumes 400 g meat.

---

## Case C — Batch item / soup / OR ROUGE

> Cooked in a pot, served in portions. Ingredients authored per batch, the
> system prorates to each sold portion.

### 1. Menu item Details

1. Create the menu item (price = portion price, e.g. ₪35).
2. Details tab → Stock Management:
   - Recipe type: **En lot**
   - Rendement de la recette (yield): e.g. **1.21 kg** (what one batch produces)
   - Portion par défaut: e.g. **250 g** (default serving)
3. Save.

### 2. Recipe / Ingredients (authored per batch)

Enter ingredient quantities for the **whole batch**, not per portion:

| Ingredient | Qty per batch | Unit | Scale with variant? |
|---|---:|---|---|
| Tomate | 2000 | g | ❌ (batch-proration handles it) |
| Oignon | 500 | g | ❌ |
| Ail | 30 | g | ❌ |
| Huile d'olive | 100 | ml | ❌ |
| Épices | 20 | g | ❌ |

> **For batch items, leave "Scale with variant" off on every ingredient.** The
> Cost panel detects `recipe_yield > 0` and scales all ingredients by
> `variant.portion / yield`. The scales flag is hidden in the editor for batch
> items to avoid contradictory setups.

### 3. Optional — size variants

If you sell multiple serving sizes (250 g bowl / 500 g plate):

1. Variants editor → "Taille":
   - Normal, ₪35, Portion = **250 g**
   - Grand, ₪65, Portion = **500 g**
2. Variant portion unit should match the yield unit (g/kg/ml/l) so proration is
   clean. Variants in `unit` against a batch in `kg` give a degenerate ratio.

### 4. Cost tab — what you see

- Variant pills with portion sizes.
- Normal (250 g of 1.21 kg batch): each ingredient × 250/1210 ≈ 20.7%.
- Grand (500 g): each ingredient × 500/1210 ≈ 41.3%.
- The per-variant cost breakdown table lists the portion, cost, price, margin.

### 5. Prep vs. menu-item — when to use which

- **Menu item (batch mode)** — sold to customers directly. Used when the batch
  yield exists only to cook efficiently; once plated it's an order.
- **Prep item** — a production batch that *other menu items* reference as an
  ingredient (see Case D). Has its own yield and kitchen inventory.

OR ROUGE can be *both*: a menu item (sold as a plate) AND a prep (referenced
by other items). Configure the menu item per this case and, separately,
configure a Prep item in `/kitchen/preparations` with the same batch recipe.
Keep their yields identical so cost-per-portion matches across both.

### 6. At order time

- Each OrderItem drawing from a batch menu item decrements a **pro-rated
  slice** of each raw ingredient (250 g serving of 1.21 kg batch → 20.7% of
  each ingredient's per-batch qty).

---

## Case D — Menu item using a prep (Hamburger with special sauce from a prep)

> The burger uses "Sauce spéciale" which is its own prep batch.

### 1. Prep item setup

1. `/kitchen/preparations` → "New":
   - Name: Sauce spéciale
   - Yield per batch: e.g. 500 ml
   - Ingredients (per batch): mayo 300 ml, mustard 50 g, spices 20 g, etc.
2. Save. System computes `cost_per_unit = batch_cost / yield_per_batch` (per ml).

### 2. Menu item Ingredient list

On Hamburger → Ingredients:

| Ingredient | Qty | Unit | Scale with variant? |
|---|---:|---|---|
| … all raw stock items as in Case A/B … |
| **Sauce spéciale** (prep) | 10 | g | ✅ if scales with meat, else ❌ |

Pick from the "Prep items" group in the ingredient picker.

### 3. Cost behavior

- The Cost tab reads `prep.cost_per_unit` (VAT-normalized from raw stock ex-VAT).
- Click the prep row → "Show cost breakdown" popup explains
  `batch cost ÷ yield = cost/ml`, then `cost/ml × 10 = line cost`.
- A swap banner may suggest replacing raw ingredients with a prep when the
  system detects overlap (≥60% of the raw items match a prep's recipe).

### 4. Inventory impact

- Each order decrements the prep's on-hand inventory (10 g × scale factor).
- When the prep runs low, kitchen cooks another batch (which decrements raw stock).

---

## Case E — Modifier that consumes stock (+extra cheese)

> Customer taps "+extra cheese" and another 30 g of cheese is drawn.

### 1. Modifier set

1. `/menu/modifier-sets` → "New":
   - Name: Suppléments
   - Allow multiple: ✅ (so customer can pick more than one)
2. Add a modifier row:
   - Name: Extra cheese
   - Price: ₪5
3. On that row, click **"+ Link stock consumption"** (the subrow below each
   modifier expands).
   - Source: **Cheese** (from the stock picker — groups by Stock / Prep)
   - Qty: 30
   - Unit: g
4. Save the modifier set.

### 2. Attach the modifier set to the menu item

On Hamburger's Edit modal → Modificateurs section → "Add" → pick "Suppléments."

### 3. Cost tab

A new **"Modifier consumption"** section appears, listing:

| Modifier | Consumes | Qty | Per selection |
|---|---|---:|---:|
| Extra cheese (Suppléments) | Cheese (stock) | 30 g | ₪X |

"Per selection" = cost of one pick. Multi-pick is applied at order time
(2× extra cheese on one burger = 2 × 30 g = 60 g consumed).

### 4. At order time

- OrderItem's selected modifiers each apply `mod.quantity × selected_count × source.cost_per_unit`.
- Inventory is decremented by the same amount for the linked stock/prep item.

### Special cases

- **Modifier that consumes a prep** (e.g. "+extra sauce spéciale"): pick the
  source from the Prep items group instead of stock. Math uses `prep.cost_per_unit`.
- **Free modifier** (ketchup included): leave `price_delta = 0` and still link
  the stock so inventory is tracked.
- **"No cheese"** (subtractive modifier): not yet supported — today
  consumption is additive only. To model it, either lower the base ingredient
  qty or accept the small cost overstatement.

---

## Case F — Everything together (Double hamburger + extra cheese + sauce-prep)

A realistic composed order:

1. **Stock**: viande, pain, laitue, tomate, oignon, fromage, mayo, mustard, spices.
2. **Prep**: Sauce spéciale (500 ml batch).
3. **Menu item**: Hamburger, 1 portion mode, portion = 1 unit.
4. **Ingredients**: viande 200 g (scale), pain 1 unit, laitue/tomate fixed, sauce spéciale 10 g (scale).
5. **Variants**: Normal (1 unit / ₪70), Grand (2 unit / ₪140).
6. **Modifier set** "Suppléments" with "Extra cheese" → cheese 30 g.
7. Attach set to the hamburger.

Cost tab shows:
- Pills for Normal / Grand.
- Ingredient table with scaled qty per variant (click Grand → 400 g meat).
- Modifier consumption table showing "+ Extra cheese → 30 g cheese = ₪X per selection."

Order arrives: 1× Grand hamburger with 2× extra cheese.
- Viande hachée: 400 g
- Sauce spéciale (prep): 20 g → prep decremented → prep's raw sources decremented proportionally when the next batch is cooked
- Cheese: 60 g (2 × 30 g)
- Other raw: bun 1, laitue 15 g, tomate 20 g.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Cost tab shows 0 or "missing variant portion" warning | Variants have no `portion_size` set | Variants editor → fill the Portion column |
| Grand costs the same as Normal | "Scale with variant" not checked on the scaling ingredients | Toggle it on the ingredients that should scale |
| All ingredients doubled in Grand (even the bun) | Item is in "En lot" (batch) mode — proration applies to everything | Switch to "1 portion" mode, then flag only the scaling ingredients |
| Prep cost shows 0 | Prep has no ingredients, or `yield_per_batch = 0` | Set yield and add at least one ingredient |
| Margin is negative / nonsensical | Mixing ex-VAT and inc-VAT in the same row | Use the "Show ex-VAT / inc-VAT" toggle and verify mini P&L is on the same basis |
| "Type de recette" toggle doesn't persist | Legacy bug — requires server-side fix deployed | Covered by migration + ItemUpdateInput pointer fields (already shipped) |
| Non-linear variant scaling needed (Triple = 550 g, not 600 g) | Use fractional variant portion: **2.75 unit** | Any positive float works in the Portion column |

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
| Cost math (formula) | `calcLineCost` in `MenuItemCostPanel.tsx` |
| Unit helpers | `foodyadmin/src/lib/units.ts` (`toBaseUnit`, `convertQuantity`, `sameUnitFamily`) |
| Modifier model | `foodyserver/internal/common/models.go` (`MenuItemModifier`) |
| Modifier migration | `foodyserver/migrations/055_modifier_stock_link.sql` |
