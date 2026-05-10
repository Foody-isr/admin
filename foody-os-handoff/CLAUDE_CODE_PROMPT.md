# Claude Code — Implementation Prompt

**Paste this as your first message to Claude Code after opening it in the Foody codebase.**

---

## Task

I'm handing off a high-fidelity redesign of the Foody Admin dashboard. Your job is to recreate it in this codebase, screen by screen, using our existing patterns.

The design reference lives in `./foody-os-handoff/` (or wherever you've unzipped the bundle). It contains:

- `README.md` — overview
- `DESIGN_TOKENS.md` — complete token reference (colors, type, spacing, radii, shadows, motion)
- `SCREENS.md` — inventory of all screens and their purpose
- `BRUT_VS_PREPARATION.md` — the critical UX fix for the ingredient creation flow
- `design-reference/` — HTML/JSX/CSS prototypes. **Reference only — do not copy wholesale.**

---

## Ground rules

1. **Read before writing.** Before implementing any screen:
   - Read `DESIGN_TOKENS.md` and port tokens to our codebase's theme system.
   - Read `SCREENS.md` for the specific screen you're building.
   - Open the matching file in `design-reference/screens/` — this is the source of truth for layout, copy, states, and interactions.
   - Inspect `design-reference/index.html` to see the live component.

2. **Follow THIS codebase's conventions, not the reference's.** The reference is inline React with CSS variables. Our codebase may use [React + TypeScript + Tailwind / CSS Modules / styled-components — you'll figure this out by reading it]. **Match our patterns**, don't introduce new ones.

3. **Port tokens first.** Before any component work, translate `design-reference/tokens.css` into our theme format. Every color, spacing value, font size, radius, and shadow in the design is a token. No hardcoded values.

4. **One screen at a time.** Don't try to build everything at once. Pick a screen, implement it, verify against the reference, move on. I'll review as you go.

5. **Preserve the interaction model.** Drawers are drawers, not routes. Modals are modals, not drawers. The reference encodes real UX decisions — ask before deviating.

6. **Ask when unclear.** If a pattern in the reference doesn't map cleanly to our codebase, surface the question rather than guessing.

---

## Implementation order

Build in this order. Earlier steps unblock later ones.

### Phase 1 — Foundation
1. **Port tokens** from `design-reference/tokens.css` to our theme system. Preserve every variable name if possible (`--brand-500`, `--surface-2`, `--s-4`, etc.) so the reference files remain useful.
2. **Port component primitives** from `design-reference/components.css` — buttons, inputs, cards, badges, tables, tabs, KPI. These are the building blocks of every screen.
3. **Set up dark/light theming**. The design supports both via a `[data-theme='dark']` attribute on `<html>` (or whatever approach we use). Verify both themes work on the button/card/input primitives before moving on.

### Phase 2 — App shell
4. **Sidebar + topbar** (reference: `chrome.jsx`). Nav items, collapse behavior, active states. The sidebar can collapse to 72px (icons only).
5. **Routing**. Wire up routes for each screen so you can navigate.

### Phase 3 — Main workflow screens
6. **Dashboard** (reference: `screens/dashboard.jsx`) — KPI cards, revenue chart, recent orders, top items. Validates the foundation.
7. **Library** (reference: `screens/library.jsx`) — items grid, search, filters, add button.
8. **Item Editor** (reference: `screens/item-editor.jsx`) — the big one. 4 tabs (Details / Modificateurs / Recette / Coût). Modal pattern with left rail + right content.
9. **The brut vs. préparation flow** (reference: `BRUT_VS_PREPARATION.md` + `item-editor.jsx` states `searchResults`, `searchEmpty`, `createPrep`, `helpOpen`). This is the **critical UX fix** — read the doc before starting.

### Phase 4 — Operational screens
10. **Orders** + **Order Details drawer** (references: `orders.jsx`, `order-details.jsx`)
11. **Stock** + **Stock Editor** (references: `stock.jsx`, `stock-editor.jsx`)
12. **Préparations** + **Prep Editor** (references: `preparations.jsx`, `prep-editor.jsx`)
13. **Reports** (reference: `reports.jsx`)

### Phase 5 — Settings
14. **Settings shell + 6 sub-pages** (reference: `settings.jsx`). Général, Image de marque, Horaires, Paiements & TVA, Imprimantes & KDS, Équipe & rôles.

---

## Specific gotchas to avoid

- **Do not use emoji as icons.** Use our icon system. The reference's `<Icon>` component maps to custom SVG paths — treat it as a spec of *which* icon is used where, not *how* to render it.
- **Do not invent new colors.** If you need a color the tokens don't cover, ask. Likely candidates: subtle tints use `color-mix(in oklab, var(--brand-500) 8%, transparent)` — port this pattern.
- **Numbers must be tabular.** Every price/quantity/percentage renders in Geist Mono with `font-feature-settings: "tnum"`. The reference uses `.num` and `.mono` classes.
- **Do not use gradient backgrounds as a decorative default.** The design uses them sparingly — only for the manifesto card and the orange item thumbnail placeholder.
- **Modals over modals = forbidden.** The brut/préparation "Create preparation" sub-sheet is intentionally NOT a second modal. It's an inline overlay within the item editor's bounds. See `BRUT_VS_PREPARATION.md`.
- **RTL support.** Some Foody users are in Hebrew. Layouts must mirror correctly. No `margin-left: 16px` — use logical properties (`margin-inline-start`) or the equivalent in our system.

---

## Start command

Start by reading `foody-os-handoff/README.md` and `foody-os-handoff/DESIGN_TOKENS.md`, then show me your plan for porting tokens to this codebase. Don't write any component code until we've agreed on the token port.
