# Design Tokens — Foody OS

Complete reference for every design value used in the Foody Admin redesign. Port these to your codebase's theme system before writing component code.

**Source file:** `design-reference/tokens.css` — always the source of truth.

---

## Color

### Brand scale
Primary orange. Used for primary CTAs, active nav, brand accents.

| Token | Hex | Use |
|---|---|---|
| `--brand-50`  | `#fff7ed` | Lightest tint — rarely used |
| `--brand-100` | `#ffedd5` | Subtle hover backgrounds |
| `--brand-200` | `#fed7aa` | — |
| `--brand-300` | `#fdba74` | — |
| `--brand-400` | `#fb923c` | — |
| `--brand-500` | `#f97316` | **Primary** — buttons, active states, links |
| `--brand-600` | `#ea580c` | Primary button hover |
| `--brand-700` | `#c2410c` | — |
| `--brand-800` | `#9a3412` | — |
| `--brand-900` | `#7c2d12` | — |

### Categorical (charts, avatars, item tags)
All share roughly equal chroma. Safe for color-blind viewers at adjacent positions.

| Token | Light hex | Dark hex | Semantic |
|---|---|---|---|
| `--cat-1` | `#f97316` | `#fb923c` | orange — brand |
| `--cat-2` | `#eab308` | `#facc15` | saffron |
| `--cat-3` | `#16a34a` | `#4ade80` | basil |
| `--cat-4` | `#0ea5e9` | `#38bdf8` | sky |
| `--cat-5` | `#7c3aed` | `#a78bfa` | plum |
| `--cat-6` | `#e11d48` | `#fb7185` | rose |
| `--cat-7` | `#0d9488` | `#2dd4bf` | teal |
| `--cat-8` | `#a16207` | `#d6b26a` | bistre |

### Semantic

| Token | Hex | Use |
|---|---|---|
| `--success-500` | `#16a34a` | Success states, positive deltas |
| `--success-50`  | `#dcfce7` (light) / `rgba(22,163,74,.14)` (dark) | Success badge backgrounds |
| `--warning-500` | `#d97706` | Warnings, stock low, cost alerts |
| `--warning-50`  | `#fef3c7` / `rgba(217,119,6,.14)` | Warning badge backgrounds |
| `--danger-500`  | `#dc2626` | Destructive, errors |
| `--danger-50`   | `#fee2e2` / `rgba(220,38,38,.14)` | Danger badge backgrounds |
| `--info-500`    | `#2563eb` | Informational |
| `--info-50`     | `#dbeafe` / `rgba(37,99,235,.14)` | Info badge backgrounds |

### Neutrals (theme-aware)

The design ships **dark** and **light** themes. Tokens change meaning depending on which theme is active.

#### Light theme (default)

| Token | Hex | Use |
|---|---|---|
| `--bg`            | `#fafaf9` | Page background — warm off-white |
| `--surface`       | `#ffffff` | Card, modal, drawer background |
| `--surface-2`     | `#f5f5f4` | Subtle panels, hover rows, section fills |
| `--surface-3`     | `#e7e5e4` | Deeper panels, table headers |
| `--line`          | `#e7e5e4` | Default border |
| `--line-strong`   | `#d6d3d1` | Emphasized border (inputs) |
| `--fg`            | `#1c1917` | Primary text |
| `--fg-muted`      | `#57534e` | Secondary text |
| `--fg-subtle`     | `#a8a29e` | Tertiary text, placeholders, disabled |
| `--sidebar-bg`    | `#ffffff` | Sidebar |
| `--sidebar-hover` | `#f5f5f4` | Sidebar item hover |
| `--topbar-bg`     | `#ffffff` | Top bar |

#### Dark theme

Applied via `[data-theme='dark']` or `.dark` class.

| Token | Hex | Use |
|---|---|---|
| `--bg`            | `#0f0e0d` | Page background — warm near-black |
| `--surface`       | `#1a1917` | Card, modal, drawer background |
| `--surface-2`     | `#24221f` | Subtle panels |
| `--surface-3`     | `#2d2a26` | Deeper panels |
| `--line`          | `#2d2a26` | Default border |
| `--line-strong`   | `#44403c` | Emphasized border |
| `--fg`            | `#fafaf9` | Primary text |
| `--fg-muted`      | `#a8a29e` | Secondary text |
| `--fg-subtle`     | `#78716c` | Tertiary text |
| `--sidebar-bg`    | `#0a0908` | Sidebar |
| `--sidebar-hover` | `#1a1917` | Sidebar item hover |
| `--topbar-bg`     | `#0a0908` | Top bar |

### Shadows & rings

| Token | Light | Dark | Use |
|---|---|---|---|
| `--shadow-1` | subtle double shadow | `0 1px 2px rgba(0,0,0,.4)` | Resting cards |
| `--shadow-2` | `0 4px 12px + 0 2px 4px` | `0 4px 12px + 0 2px 4px` (darker) | Hover cards, dropdowns |
| `--shadow-3` | `0 16px 40px + 0 4px 12px` | `0 20px 50px rgba(0,0,0,.6)` | Modals, drawers |
| `--focus-ring` | `0 0 0 3px rgba(249,115,22,.25)` | `0 0 0 3px rgba(249,115,22,.35)` | Focus state on all interactive elements |

---

## Typography

### Families

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | Geist, ui-sans-serif, system stack | All body and UI |
| `--font-mono` | Geist Mono, ui-monospace, SF Mono | **All numbers**, code, kbd |
| `--font-display` | Instrument Serif, ui-serif | Reserved for editorial headings — sparingly |

Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif&display=swap" rel="stylesheet">
```

### Size scale

| Token | Value | Use |
|---|---|---|
| `--fs-micro` | `11px` | Timestamps, tiny meta |
| `--fs-xs`    | `12px` | Labels, badges, helper text |
| `--fs-sm`    | `13px` | Secondary UI, table body |
| `--fs-md`    | `14px` | Default body |
| `--fs-lg`    | `16px` | Emphasized body |
| `--fs-xl`    | `18px` | Card titles, drawer titles |
| `--fs-2xl`   | `22px` | Section headers |
| `--fs-3xl`   | `28px` | Page titles |
| `--fs-4xl`   | `36px` | Hero numbers |
| `--fs-5xl`   | `48px` | Marketing / audit title |

### Line heights

| Token | Value | Use |
|---|---|---|
| `--lh-tight` | `1.15` | Headings, display numbers |
| `--lh-snug`  | `1.3`  | Subheads |
| `--lh-base`  | `1.5`  | Body |

### Letter spacing

| Context | Value |
|---|---|
| Page titles (3xl+) | `-0.02em` to `-0.03em` |
| Card titles (xl/2xl) | `-0.01em` |
| Uppercase micro-labels | `+0.04em` to `+0.06em` |
| Body | default (`normal`) |

### Tabular numerics — important

Every number in a table, KPI, or price must use:

```css
font-family: var(--font-mono);
font-feature-settings: "tnum";
```

Utility class: `.num` or `.mono` or `.tabular`.

---

## Spacing (4pt grid)

| Token | Value | Typical use |
|---|---|---|
| `--s-1`  | `4px`  | Icon gap in a badge |
| `--s-2`  | `8px`  | Inline gap, padding inside chips |
| `--s-3`  | `12px` | Padding inside inputs, small cards |
| `--s-4`  | `16px` | Standard padding, section gap |
| `--s-5`  | `20px` | Larger card padding |
| `--s-6`  | `24px` | Drawer/modal padding |
| `--s-8`  | `32px` | Page inner padding |
| `--s-10` | `40px` | Section spacing |
| `--s-12` | `48px` | Page outer padding |
| `--s-16` | `64px` | Hero section spacing |

---

## Border radius

| Token | Value | Use |
|---|---|---|
| `--r-xs`  | `4px`  | `<kbd>`, micro chips |
| `--r-sm`  | `6px`  | Small badges |
| `--r-md`  | `10px` | **Default** — buttons, inputs, chips |
| `--r-lg`  | `14px` | Cards, KPI tiles |
| `--r-xl`  | `18px` | Modals, drawers |
| `--r-full`| `999px`| Pills, avatars |

---

## Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out`    | `cubic-bezier(.2,.8,.2,1)` | Default ease — entries, hovers |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)`  | Symmetric transitions |
| `--dur-fast`    | `120ms` | Hover/active states |
| `--dur-base`    | `200ms` | Most transitions |
| `--dur-slow`    | `320ms` | Drawer/modal enter/exit |

Respect `prefers-reduced-motion: reduce` — reduce durations to 0 or a 1ms minimum.

---

## Layout

| Token | Value |
|---|---|
| `--sidebar-w`           | `260px` (expanded) |
| `--sidebar-w-collapsed` | `72px`  (icons only) |
| `--topbar-h`            | `56px` |

---

## Component primitives (from `components.css`)

The reference defines these classes. Port the *behavior*, not necessarily the class names:

- **`.btn`** — 36px height, 10px radius, 2-unit gap, 4-unit padding
  - variants: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`
  - sizes: `.btn-sm` (28px), `.btn-lg` (44px), `.btn-icon` (square)
- **`.input`, `.select`, `.textarea`** — 36px, 10px radius, 1px border (`--line-strong`), focus ring on brand
- **`.input-group`** — wraps input with inline icon / suffix
- **`.card`** — `--surface`, 1px border (`--line`), 14px radius, `--shadow-1`
- **`.kpi`** — card with label (xs uppercase muted) + value (3xl or 4xl mono)
- **`.badge`** — pill, 22px height, xs font
  - variants: `.badge-neutral`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`
  - with `.badge-dot` prefix for status dots
- **`.tab` / `.tabs`** — underline tab bar
- **`.divider`** — 1px `--line` with standard margin
- **`.muted` / `.subtle`** — `--fg-muted` / `--fg-subtle` text colors
- **`.hstack` / `.vstack`** — flex layout helpers (gap: `--s-3` default)

---

## Accessibility

- All interactive elements get `--focus-ring` on `:focus-visible`.
- Contrast: `--fg` on `--bg` is ≥ 7:1 in both themes. `--fg-muted` is ≥ 4.5:1.
- Hit targets: buttons are 36px default (minimum 28px for `.btn-sm`, never below). Icon-only buttons are 36×36.
- Icons carry labels or `aria-label` — they are never the sole affordance.
