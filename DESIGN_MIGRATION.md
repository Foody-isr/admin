# Foody Admin — Design Migration Guide

## The rule above all rules

**Consistency > novelty.** Every screen must use the same page-head, same filter chips, same table style, same button hierarchy. If you find yourself inventing a new pattern, it's already wrong — go find it in `design-reference/design/screens/` first.

## The 6 principles (do not break these)

1. **Tokens-only.** No hex codes, no px literals for spacing, no magic numbers. Everything goes through `var(--brand-500)`, `var(--s-4)`, `var(--r-md)`, etc.
2. **Orange is rare.** `--brand-500` only on: primary buttons, active tabs, active nav, focused inputs, progress bars. Never on decoration, never on borders.
3. **Hierarchy through typography.** Instrument Serif only for big numbers (KPI values, totals, prices >2xl). Geist for everything else. Geist Mono for tabular numbers.
4. **Dark-first, Light-equal.** Every component works in both. Test both before merging.
5. **RTL-ready.** Never use `padding-left`/`margin-right`. Use logical properties (`padding-inline-start`) or flex `gap`. Test with `dir="rtl"` on the root.
6. **44px hit targets.** Anything tappable in the kitchen UI must be ≥44px tall.

## Editor pattern — CRITICAL

This is where the old app was inconsistent. Rule now:

| Intent | Pattern | Component |
|---|---|---|
| Creating or editing a record | **Full-screen modal** | `FullScreenEditor` |
| Viewing a record + quick actions | **Right drawer** | `Drawer` |
| Confirming a destructive action | **Centered alert dialog** | (shadcn AlertDialog is fine) |

Full-screen editor anatomy (see `design-reference/design/drawer.jsx`):
- Inset 24–32px from viewport, rounded corner, border
- 60px header bar: close-X (left) · centered title + subtitle · save/cancel (right)
- Body: optional 280px left rail (image + summary) + main scrollable content
- Main content uses 3px brand-colored accent bar on section headers

Examples in the canvas:
- `editor-cost-d`, `editor-recipe-d` → Item Editor (4 tabs)
- `stock-editor-d` → Stock Item Editor
- `prep-editor-d` → Preparation Editor

Drawer examples:
- `order-details-d` → Order Details (view + actions)

## Screen-by-screen mapping

Map my current routes to the redesigned screens:

| My route (adjust) | Reference artboard | Key changes |
|---|---|---|
| `/` or `/dashboard` | `dashboard-d` | New KPI strip, activity feed, top items |
| `/orders` | `orders-d` | Status tabs with live counts, new filter chips, inline customer |
| `/orders/:id` | `order-details-d` | **NEW: right drawer**, timeline, modifiers pills |
| `/menu/items` | `library-d` | Bulk select, saved views, column picker |
| `/menu/items/:id` | `editor-*-d` | **4 tabs: Détails, Modificateurs, Recette, Coût** |
| `/kitchen/stock` | `stock-d` | Category chip row, low-stock KPI |
| `/kitchen/stock/:id` | `stock-editor-d` | **Full-screen, 280px rail, recent purchases table** |
| `/kitchen/prep` | `prep-d` | **NEW: preparations are first-class** |
| `/kitchen/prep/:id` | `prep-editor-d` | **Full-screen, ingredients table, live cost** |
| `/reports` | `reports-d` | Date range, KPI strip, breakdowns |
| `/settings` | `settings-*-d` | **6 sub-pages, nav rail inside main** |

## Shared building blocks to create first

Before touching any screen, implement these 10 components:

1. `<Sidebar>` — collapsed/expanded states, active indicator, counts, dot-pulse
2. `<Topbar>` — breadcrumbs, search with ⌘K, bell, avatar
3. `<PageHead title desc>` + right actions slot
4. `<Kpi label value sub />` + variants (neutral, success, warning, danger)
5. `<Badge>` — success/warning/danger/info/neutral, with optional dot
6. `<Chip active>` — for filter pills (`button.chip[aria-pressed]`)
7. `<Table>` — sticky header, hover, checkbox column, 44px rows
8. `<FullScreenEditor>` — the pattern above
9. `<Drawer>` — right-anchored
10. `<Section title desc aside>` + `<Field label hint>` — form primitives

Build and Storybook these **before** rewriting any page.

## Don't do these

- ❌ Don't keep the current inconsistent modal styles — rewrite all modals to use `FullScreenEditor` or `Drawer`
- ❌ Don't invent new spacing values — use `--s-1..--s-10`
- ❌ Don't style inline `style={{color:'red'}}` — use `var(--danger-500)`
- ❌ Don't ship a screen without checking it in dark AND light themes
- ❌ Don't add emoji unless explicitly in a data field
- ❌ Don't use icon libraries (lucide/heroicons are fine) but match the stroke weight from `chrome.jsx` — 1.75

## How to verify a screen is done

For each migrated screen, confirm:

- [ ] Matches the reference artboard visually at the same viewport
- [ ] Works in dark AND light
- [ ] No hex codes or hard-coded spacing in the final diff
- [ ] All interactive elements ≥44px tall
- [ ] Keyboard-navigable (Tab order, focus rings visible)
- [ ] Tables have sticky headers when overflowing
- [ ] Loading states use skeletons (not spinners) that match the row layout
- [ ] Empty states have an illustration + explanation + primary action
