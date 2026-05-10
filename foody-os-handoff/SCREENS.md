# Screens Inventory

Every screen and state in the redesigned Foody Admin. Each entry points to the source file in `design-reference/` that contains the canonical layout and behavior.

All screens support **dark** and **light** themes. The `theme="dark" | "light"` prop on each reference component toggles it.

---

## 00 — Foundation

### Audit (UX critique)
- **File:** `design-reference/screens/audit.jsx`
- **Purpose:** Internal document — the 11 UX issues identified in the current Foody Admin and their fixes. Not a user-facing screen.
- **Use it:** As a checklist during review. Don't implement.

### Design System
- **File:** `design-reference/screens/design-system.jsx`
- **Purpose:** Visual catalog of every token, primitive, and pattern. Not a user-facing screen.
- **Use it:** As a living style guide to validate your port.

---

## 01 — Dashboard

**Route:** `/` (home)
**File:** `design-reference/screens/dashboard.jsx`

### Purpose
Operator's morning glance. Summary of today's performance + alerts that need action.

### Layout
- Top: page title "Accueil" (3xl, -0.02em) + date/greeting
- KPI row — 4 cards: Revenu, Commandes, Panier moyen, Clients
  - Each card shows label (xs uppercase muted), value (3xl mono), delta (xs with arrow)
- Revenue chart — line chart, ~240px tall, last 7 days
- Two-column split:
  - **Recent orders** — compact table
  - **Top items** — ranked list with qty + revenue

### Key components
- `.kpi` card with delta pill (`.badge-success` / `.badge-danger` depending on sign)
- Simple sparkline / area chart (the reference uses inline SVG — feel free to use Recharts, Visx, or similar)
- Table rows with hover state (`--surface-2`)

### States to implement
- Default (data loaded)
- Loading (skeleton shimmer)
- Empty (first-day-on-job — prominent empty state with CTA)

---

## 02 — Orders

**Route:** `/commandes`
**Files:** `screens/orders.jsx`, `screens/order-details.jsx`

### Purpose
Live operational view. Operator sees all orders across channels (POS, online, phone) and can advance their status.

### Layout
- Sticky header: status filter tabs (Toutes / En cours / Prêtes / Livrées) + search + date picker
- Main: orders table
  - Columns: N°, Heure, Canal, Client, Articles, Total, Statut, Actions
  - Row height: 56px
  - Numbers (total) in mono
  - Status = `.badge` with dot

### Interactions
- Click row → slide-in drawer with order details (right side, `--r-xl` top-left radius, `--shadow-3`)
- Drawer shows: items list, customer info, timeline, actions (imprimer, annuler, re-envoyer)
- Escape or click-outside closes drawer

### States
- Default, filter applied, selected order in drawer, empty filter result

---

## 03 — Library (Bibliothèque d'articles)

**Route:** `/bibliotheque`
**File:** `screens/library.jsx`

### Purpose
Browse + manage the menu. Every dish, drink, side.

### Layout
- Page header with "Nouveau article" primary CTA
- Category rail (horizontal scroller) — Salades, Entrées, Plats, Desserts, etc.
- Grid of item cards
  - 240px wide, image top (aspect-square), title, price, category badge, status dot
  - Hover: raise (`--shadow-2`), show quick-edit icon

### Interactions
- Click card → opens **Item Editor** modal (see below)
- Search + filter by category, status, price range

---

## 04 — Item Editor (Modifier l'article) ⭐ critical screen

**File:** `screens/item-editor.jsx`

### Purpose
The main workflow. Edit a menu item: details, modifiers, recipe (ingredients), cost breakdown.

### Layout
- Modal pattern (NOT drawer, NOT full page) — centered, ~85% viewport, `--r-xl` radius, `--shadow-3`
- Head (60px): close × | title "Modifier l'article" + last-edited meta | "Enregistré" badge + Cancel + Save
- Body grid: `280px (left rail) | 1fr (content)`
- **Left rail:** item thumbnail, name + price + category, cost summary (food cost, margin, % cost), 7-day sales, quick actions (Aperçu, Dupliquer, Archiver)
- **Right content:** tab bar → (Détails, Modificateurs, Recette, Coût)

### Tabs

#### Tab: Détails
Name, description, category, price, image, visibility toggles, tags.

#### Tab: Modificateurs
Groups of add-ons (sauces, cuisson, taille). Each group has min/max selection rules.

#### Tab: Recette ⭐ The workflow we fixed
List of ingredients with qty + unit + cost contribution.

**States to build:**
- Default — rows of ingredients, "+ Ajouter un ingrédient" button
- Row in edit mode — inline editing
- **Composer open** (`composer={true}`) — inline panel replaces the "+" button with a search+select surface. Has 4 sub-states:
  - `composerState="default"` — an ingredient is picked, usage-mode chips visible
  - `composerState="searchResults"` — user typed, matches visible + "create new" CTAs below
  - `composerState="searchEmpty"` — no matches, only 2 "create" cards (brut / préparation)
  - `helpOpen={true}` — "Comment choisir ?" popover visible next to search
- **`createPrep={true}`** — Create-preparation sub-sheet overlaid inside the modal (not a second modal, not a route). Lets user create a préparation inline then return to the recipe.

**See `BRUT_VS_PREPARATION.md` for the full flow and rationale.**

#### Tab: Coût
Visual breakdown: cost per ingredient, total cost, selling price, margin, food cost %. Includes warnings if % cost > 35%.

---

## 05 — Stock (Cuisine · Stock)

**Route:** `/cuisine/stock`
**Files:** `screens/stock.jsx`, `screens/stock-editor.jsx`

### Purpose
Raw-goods inventory. Track what's on hand, reorder points, supplier, last count.

### Layout
- Page header with "Compter le stock" + "Ajouter ingrédient" CTAs
- KPI row: Valeur totale, Articles en rupture, À réapprovisionner, Dernier inventaire
- Table: ingredient name, current qty, unit, value, reorder point, supplier, last count date
- Row severity: red for below reorder point, amber for within 20%, neutral otherwise

### Editor (right-side drawer, `screens/stock-editor.jsx`)
Name, unit, current qty, cost per unit, supplier, reorder point, supplier reference code. Notes textarea.

---

## 06 — Préparations

**Route:** `/cuisine/preparations`
**Files:** `screens/preparations.jsx`, `screens/prep-editor.jsx`

### Purpose
Kitchen preps — sub-recipes used as ingredients in other dishes. Sauce maison, fond, vinaigrette, pâte à pizza, etc.

### Layout
- Page header with "Nouvelle préparation" CTA
- Grid or list of prep cards — name, yield, DLC, cost/unit, used-in count

### Editor (drawer)
Name, yield (qty + unit), DLC (days), ingredients list (can include other preps), cost calculation, notes.

---

## 07 — Reports (Rapports)

**Route:** `/rapports`
**File:** `screens/reports.jsx`

### Purpose
Analytics overview. Revenue, costs, best-sellers, trends.

### Layout
- Date range picker, granularity toggle (jour / semaine / mois)
- KPIs
- Multi-series chart
- Top/bottom movers table

---

## 08 — Settings (Paramètres)

**Route:** `/parametres` with sub-routes
**File:** `screens/settings.jsx` (exports 6 subcomponents)

### Sub-pages

1. **Général** (`SettingsGeneral`) — nom du restaurant, adresse, fuseau horaire, devise, langue
2. **Image de marque** (`SettingsBranding`) — logo, couleurs principales, favicon, photo de couverture
3. **Horaires** (`SettingsHours`) — ouverture par jour, exceptions, période vacances
4. **Paiements & TVA** (`SettingsPayments`) — méthodes de paiement acceptées, taux TVA, intégrations (Stripe, etc.)
5. **Imprimantes & KDS** (`SettingsPrinters`) — ticket printers, KDS stations, impression auto par catégorie
6. **Équipe & rôles** (`SettingsTeam`) — liste des membres, invitations, permissions

### Layout pattern (all sub-pages)
- Left rail: settings nav (sticky)
- Right: form sections grouped with headers + helper text
- Sticky footer with save button (only visible when dirty)

---

## Shared shell elements

### Sidebar (`chrome.jsx` — exported as `Sidebar`)
- 260px expanded, 72px collapsed
- Logo + workspace switcher top
- Nav items grouped: Opérations (Accueil, Commandes, Bibliothèque) · Cuisine (Stock, Préparations) · Analyses (Rapports) · Compte (Paramètres)
- Active item: brand rail on left, brand text color, subtle fill
- Counts in `.badge-neutral` pill
- Bottom: user avatar + name + settings shortcut

### Topbar (`chrome.jsx` — exported as `Topbar`)
- 56px tall
- Breadcrumbs left
- Command palette trigger (⌘K) center
- Notification bell + avatar right
