# Foody OS — Design Handoff

This bundle contains everything a developer (human or Claude Code) needs to implement the redesigned **Foody Admin** in your real codebase.

---

## 👀 Want to see the designs?

**Double-click `OPEN-IN-BROWSER.html`** — it's a single self-contained file that opens in any browser via `file://` and shows all 46 artboards on a pannable/zoomable canvas. Click the ⛶ icon on any artboard to view it fullscreen.

---

## What's in this bundle

| File / folder | What it is |
|---|---|
| **`OPEN-IN-BROWSER.html`** | **Standalone viewer — double-click to see all designs.** |
| `README.md` | You are here. Start with this. |
| `CLAUDE_CODE_PROMPT.md` | **Copy-paste this into Claude Code** to kick off implementation. |
| `DESIGN_TOKENS.md` | Complete reference for colors, typography, spacing, radii, shadows, motion. Every value used in the design. |
| `SCREENS.md` | Inventory of every screen/state in the design, with purpose + key components + interactions. |
| `BRUT_VS_PREPARATION.md` | The mental-model / education pattern for the ingredient-creation flow (the 3-minute workflow fix). |
| `design-reference/` | The design source — HTML + JSX + CSS. Claude Code reads these to extract exact tokens, component structures, and implementation details. **Reference only, not production code.** |

---

## About the design files

The files in `design-reference/` are **design references created in HTML/React** — high-fidelity prototypes showing intended look and behavior. They are **not production code to copy wholesale**.

Your job is to **recreate these designs in the Foody codebase's existing environment** (React, Vue, etc.) using its established patterns, component library, routing, and state management.

If your codebase doesn't have an environment yet, pick the most appropriate framework for the project. A good default for a Foody-scale admin panel:

- **React + TypeScript** with Vite
- **CSS Modules** or **Tailwind** (both work — tokens translate directly)
- **TanStack Query** for server state
- **Zustand** or **Redux Toolkit** for client state
- **react-router** or **TanStack Router**

---

## Fidelity

**High-fidelity (hifi).** Pixel-perfect mockups with final colors, typography, spacing, borders, shadows, and states. Recreate the UI pixel-perfectly using your codebase's existing libraries and patterns — don't re-invent layouts.

---

## How to use this bundle with Claude Code

1. **Unzip this folder into your codebase** (or alongside it — Claude Code can read both)
2. Open Claude Code **in your codebase root**
3. Paste the contents of `CLAUDE_CODE_PROMPT.md` as your first message
4. Point Claude at a specific screen to start (recommended order below)
5. Let Claude read the design reference, then iterate screen-by-screen

### Recommended implementation order

Build in this order — earlier steps unblock later ones:

1. **Foundation** — `tokens.css` + `components.css` → port to your theme system
2. **Chrome** — sidebar + topbar (`chrome.jsx`) → app shell
3. **Dashboard** → validates that the foundation works
4. **Library + Item Editor** (tabs: Details, Mods, Recipe, Cost) → the main workflow
5. **The brut/préparation flow** (see `BRUT_VS_PREPARATION.md`) → the critical UX fix
6. **Orders + Order Details drawer** → operational view
7. **Stock + Stock Editor**
8. **Preparations + Prep Editor**
9. **Reports**
10. **Settings** (6 sub-pages)

---

## Key design principles (non-negotiable)

Read these before touching code. They explain why the design is the way it is.

1. **Single design system, applied everywhere.** All screens share one grammar: same spacing rhythm, same card treatment, same table style, same badge vocabulary. Differences appear only where the data demands it.

2. **Numbers are tabular.** Every price, quantity, percentage, and count uses `font-family: var(--font-mono)` (Geist Mono) with `font-feature-settings: "tnum"`. This makes columns scannable.

3. **Semantic color, not decorative.** Orange = brand/primary. Green = success. Amber = warning. Red = danger. Blue = info. Never use these colors for decoration.

4. **Dark + Light parity.** Every screen must work in both themes. The design system defines both; never hardcode a color that isn't a token.

5. **Respect density.** This is a pro tool for restaurant operators, not a consumer app. Favor information density over whitespace, but keep rhythm consistent (4pt grid).

6. **Inline over modal-on-modal.** When the user needs to create a related entity (e.g. a préparation while editing a recipe), provide an inline sub-sheet within the current context. Never force navigation away.

---

## Files to read first (in order)

1. `CLAUDE_CODE_PROMPT.md` — what to ask Claude Code to do
2. `DESIGN_TOKENS.md` — the foundation values
3. `SCREENS.md` — what screens exist and what they do
4. `BRUT_VS_PREPARATION.md` — the key UX fix
5. `design-reference/tokens.css` — source of truth for all tokens
6. `design-reference/components.css` — primitive component styles
7. `design-reference/index.html` — canonical viewer of all screens

---

## Questions you (or Claude Code) should ask before coding

- What's the current codebase stack (React/Vue/etc.)?
- Is there an existing component library to extend, or start fresh?
- What's the icon system? (The design uses custom SVG paths in `chrome.jsx` — you may want to swap for Lucide/Tabler/Heroicons.)
- What fonts are licensed? Geist + Geist Mono are free; Instrument Serif is free. Confirm before shipping.
- What's the i18n setup? All copy is French; some flows must also support Hebrew (RTL).
- What's the existing backend contract? The design shows UI states — map to your real API.
