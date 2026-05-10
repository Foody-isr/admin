# The Brut vs. Préparation Flow

The most important UX fix in this redesign. Read this before implementing the Item Editor's Recipe tab.

---

## The problem (before)

When a Foody operator was building a recipe for a menu item, they'd get stuck in a 3-minute detour:

1. Open Item Editor → Recipe tab → search for "OR ROUGE" (a homemade sauce)
2. Nothing matches (because "OR ROUGE" is a **préparation**, and preparations live in a separate section)
3. The operator hits a dead end. No clear path forward.
4. They close the editor, navigate to Cuisine → Préparations, create the prep from scratch
5. Navigate back to the menu item, reopen the editor, reopen Recipe tab, search again
6. **Mental context lost. 3 minutes gone. Frustration.**

Worse: many operators didn't even know the distinction between a "raw ingredient" (brut) and a "preparation" (préparation). They'd try to force a sauce into the ingredients list as a brut, which broke cost tracking.

---

## The fix (after)

Three layered changes. Each does part of the work.

### 1. Inline creation from the recipe tab ⭐ biggest impact

When the ingredient search returns no match, surface **two creation paths right there in the composer**:

```
┌────────────────────────────────────────────────────────────┐
│ + Ajouter un ingrédient            ? Comment choisir ?  × │
├────────────────────────────────────────────────────────────┤
│ 🔍 or rouge                                    0 résultat │
│                                                            │
│ ⚠ Aucun ingrédient ou préparation pour « or rouge ».      │
│   Créez-le maintenant :                                    │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 🟢 Créer Ingrédient brut  « or rouge »          →   │  │
│ │    Un produit que vous achetez et utilisez tel quel. │  │
│ │    ≫ Tomate, huile, sel, pain, bœuf cru…             │  │
│ └──────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 🟣 Créer Préparation  « or rouge »              →   │  │
│ │    Une recette que vous fabriquez en cuisine.        │  │
│ │    ≫ Sauce maison, fond, vinaigrette, pâte…          │  │
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

Picking "Préparation" opens a **sub-sheet inside the Item Editor modal** (not a new page, not a second modal-over-modal). The sub-sheet has everything needed to define the prep: name, yield, DLC, ingredients, cost preview. On save, returns to the recipe tab with the new prep already selected as an ingredient.

**Reference files:**
- Empty state: `design-reference/screens/item-editor.jsx` → `SearchEmptyCreateCards` component
- Two create cards: `CreateCards` component
- Create-prep sub-sheet: `CreatePrepSheet` component

### 2. Smart search that shows both + creates either

When the user types something that matches existing items:

```
┌────────────────────────────────────────────────────────────┐
│ 🔍 or                                          2 résultats │
│                                                            │
│ RÉSULTATS EXISTANTS                                        │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 🟢 Huile d'OLIVE             [Brut]      ₪28/L   ↵  │  │
│ │ 🟣 PRÉPARATION OR ROUGE      [Prép]   Recette       │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ CRÉER NOUVEAU                                              │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 🟢 Créer Ingrédient brut  « or »                →   │  │
│ │ 🟣 Créer Préparation  « or »                    →   │  │
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Reference:** `SearchResultsList` component in `item-editor.jsx`.

### 3. Contextual help — "Comment choisir ?"

A small `(?)` button next to the search triggers a popover explaining the distinction in plain language:

```
┌─────────────────────────────────────────┐
│ ℹ Brut ou Préparation ?                │
│                                         │
│ 🟢 Ingrédient brut                     │
│    Vous l'achetez tel quel.            │
│    Stock en kg, L ou unités.           │
│    Ex: tomate, huile, pain, bœuf cru… │
│                                         │
│ 🟣 Préparation                         │
│    Vous la fabriquez en cuisine.       │
│    Elle a sa propre recette.           │
│    Ex: sauce maison, fond, vinaigrette│
│                                         │
│ 💡 Une préparation peut contenir       │
│    d'autres préparations.              │
└─────────────────────────────────────────┘
```

**Reference:** `HelpPopover` component in `item-editor.jsx`.

---

## The mental model (memorize this)

This is the one-line rule to put in front of every operator:

> **Ingrédient brut = vous l'achetez. Préparation = vous la fabriquez (elle a sa propre recette).**

Everything else follows from this.

| | Ingrédient brut | Préparation |
|---|---|---|
| **Mental question** | "Je l'achète et le mets tel quel dans le plat ?" | "Je le fabrique en cuisine avant de l'utiliser ?" |
| **Data shape** | Has a supplier, purchase price, stock unit | Has its own recipe, yield, DLC |
| **Cost source** | Fournisseur | Calculé depuis sa recette |
| **Icon/color** | 🟢 Green (`#10b981` / `#4ade80` dark) | 🟣 Purple (`#7c3aed` / `#a78bfa` dark) |
| **Examples** | Tomate, huile d'olive, sel, pain, filet de bœuf | Sauce tomate maison, fond de volaille, vinaigrette, pâte à pizza |

The purple/green split is **intentional and must be preserved** — operators will learn it fast because it's consistent everywhere:

- Ingredient rows carry these colors as a 28-30px circular icon badge
- The "Créer" cards use them for the icon circle and the kind label
- Search result rows use them as a type badge

---

## States to implement

The reference's `ItemEditor` component takes these props to render each state:

| Props | State |
|---|---|
| `tab="recipe" composer={true}` | Composer open, ingredient picked |
| `tab="recipe" composer={true} composerState="searchResults"` | User typed, matches + create CTAs |
| `tab="recipe" composer={true} composerState="searchEmpty"` | No match, only 2 create cards |
| `tab="recipe" composer={true} composerState="searchEmpty" helpOpen={true}` | Help popover visible |
| `tab="recipe" composer={true} composerState="searchEmpty" createPrep={true}` | Sub-sheet open over editor |

See the canvas in `design-reference/index.html` — the "02 · Écrans principaux" section has every state laid out side-by-side.

---

## Implementation notes

- **The create-prep sub-sheet is NOT a second modal.** It overlays the Item Editor modal (`position: absolute; inset: 0; z-index: 20`) and is contained by it. Closing it returns you to the recipe tab, not to the list.
- **Accessibility:** When the sub-sheet opens, move focus into its first input. Trap focus. Escape closes it (not the parent modal).
- **State preservation:** If the user opens the sub-sheet, edits for a minute, then hits Escape, don't lose their work silently — confirm with a small "Annuler les modifications ?" prompt.
- **Post-save behavior:** On successful prep creation, close the sub-sheet, insert the new prep as the selected ingredient in the composer, set focus to the quantity input.
- **Don't forget the permanent type badge.** Every ingredient row in the recipe list shows `[Brut]` or `[Prép]` — hover it to see the definition again. This keeps the teaching present without being noisy.

---

## Why this matters more than "a tutorial"

An earlier idea was to add a tutorial explaining the distinction. I rejected it. Tutorials:

- Get skipped by most users
- Solve the symptom (not knowing) not the cause (having to leave the current screen)
- Age badly when flows change
- Are expensive to maintain in FR + HE

**Inline creation + contextual help removes the dead-end entirely.** The user doesn't need to learn the system before using it — the system teaches through use.

This is also the approach Notion takes with nested pages, and Figma with local components: "create this thing here" instead of "go somewhere else to create a thing, then come back."
