# Production Sheet — Crosshair Focus + Mark-Done Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a crosshair hover highlight (row + column) and a per-customer mark-done control (dim + strikethrough + sink to bottom, persisted per-device per-day) to the foodyadmin "Plan de production" table.

**Architecture:** Frontend-only, foodyadmin. Crosshair is local React state inside `ProductionMatrix`. Done state is a new `useProductionDone(restaurantId, date)` hook backed by `localStorage`, called once at the page level and passed down to every `ProductionMatrix` instance (flat, split-by-category, split-by-customer). No backend, no migrations, no API changes.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Radix UI `Checkbox`, existing shared `DataTable` component.

## Global Constraints

- **No test runner exists in foodyadmin.** Do NOT add jest/vitest/@testing-library. The verification gate for every task is: `npm run check:i18n && npm run lint && npx tsc --noEmit` (plus `npm run build` on the final task), run from `foodyadmin/`, followed by the manual checks listed in the task.
- **i18n gate:** every `t('key')` must exist in all three locale blocks in `src/lib/i18n.tsx` (en ≈ line 1000+, he ≈ line 4000+, fr ≈ line 7000+) or `npm run check:i18n` fails and blocks CI.
- **No em dash** as a separator in any UI label or copy. Use natural phrasing.
- **Branch:** work on `develop` (already checked out). Commit directly to `develop`; do not create a feature branch, do not push to `main`. Do not `git add -A` — stage explicit paths only (the user co-edits these repos live).
- **Follow existing patterns:** the new hook mirrors `src/lib/production-column-order.ts`; the checkbox uses the existing `@/components/ui/checkbox`.
- **Persistence is a convenience:** all `localStorage` access must be wrapped in try/catch and degrade to in-memory only — never throw.
- **Totals are the full-day plan (Option A):** the "À préparer" header totals must NOT change when orders are marked done. Do not touch the totals/box-packing logic.

---

## File Structure

- `src/lib/i18n.tsx` — **modify.** Add 2 keys × 3 locales.
- `src/lib/production-done.ts` — **create.** The `useProductionDone` hook. Single responsibility: load/save/toggle the per-day done set in `localStorage`. Modeled on `production-column-order.ts`.
- `src/components/production/ProductionMatrix.tsx` — **modify.** Crosshair hover state + classes; the done checkbox, row dim/strike, active/done split + divider; new props.
- `src/app/[restaurantId]/orders/production/page.tsx` — **modify.** Call `useProductionDone` and pass `doneIds` + `onToggleDone` (+ `reorderDone={false}` for the customer split) to each `ProductionMatrix`.

---

## Task 1: i18n keys for mark-done

**Files:**
- Modify: `src/lib/i18n.tsx` (three locale blocks)

**Interfaces:**
- Produces: translation keys `productionDoneDivider` and `productionMarkDone`, available via `t(...)` in all three locales.

- [ ] **Step 1: Add the English keys**

In `src/lib/i18n.tsx`, find the English block line (≈1053):

```
    productionResetColumns: 'Reset column order',
```

Insert immediately AFTER it:

```
    productionDoneDivider: 'Done',
    productionMarkDone: 'Mark as ready',
```

- [ ] **Step 2: Add the Hebrew keys**

Find the Hebrew block line (≈4079):

```
    productionResetColumns: 'איפוס סדר העמודות',
```

Insert immediately AFTER it:

```
    productionDoneDivider: 'הושלם',
    productionMarkDone: 'סמן כמוכן',
```

- [ ] **Step 3: Add the French keys**

Find the French block line (≈7071):

```
    productionResetColumns: 'Réinitialiser les colonnes',
```

Insert immediately AFTER it:

```
    productionDoneDivider: 'Terminé',
    productionMarkDone: 'Marquer comme prêt',
```

- [ ] **Step 4: Run the i18n + type gate**

Run: `cd foodyadmin && npm run check:i18n && npx tsc --noEmit`
Expected: check:i18n reports no missing/extra keys; tsc exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "i18n(production): add mark-done divider + checkbox labels (en/he/fr)"
```

---

## Task 2: `useProductionDone` hook

**Files:**
- Create: `src/lib/production-done.ts`

**Interfaces:**
- Produces:
  ```ts
  function useProductionDone(restaurantId: number, date: string): {
    doneIds: Set<number>;
    isDone: (orderId: number) => boolean;
    toggle: (orderId: number) => void;
    setDone: (orderId: number, done: boolean) => void;
  }
  ```
  `doneIds` is the current set of done order ids for `(restaurantId, date)`; `toggle` flips one order; state persists to `localStorage` key `foody.production.done.<restaurantId>.<date>` (JSON array of numbers). Consumed by Task 5.

- [ ] **Step 1: Create the hook file**

Create `src/lib/production-done.ts` with exactly:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Per-restaurant, per-day set of orders a cook has marked prepared on the
// production sheet. Client-only, stored in localStorage; keyed by date so each
// day naturally starts with a clean sheet. Mirrors the storage-key convention
// used by production-column-order.ts (foody.production.colorder.<rid>).
function storageKey(restaurantId: number, date: string): string {
  return `foody.production.done.${restaurantId}.${date}`;
}

function load(restaurantId: number, date: string): Set<number> {
  if (typeof window === 'undefined' || !date) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId, date));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((n): n is number => typeof n === 'number'))
      : new Set();
  } catch {
    return new Set();
  }
}

export interface ProductionDone {
  /** Order ids marked done for the active restaurant + date. */
  doneIds: Set<number>;
  /** Whether a given order is marked done. */
  isDone: (orderId: number) => boolean;
  /** Flip one order's done state and persist. */
  toggle: (orderId: number) => void;
  /** Set one order's done state explicitly and persist. */
  setDone: (orderId: number, done: boolean) => void;
}

/**
 * Owns the production sheet's per-day "done" set for one restaurant: loads it on
 * mount / date change, and persists toggles to localStorage. Failures (quota,
 * private mode) degrade to in-memory only and never throw.
 */
export function useProductionDone(restaurantId: number, date: string): ProductionDone {
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  // Latest set for the event-handler mutators, so they compute from current
  // state without adding it to their dependency lists.
  const ref = useRef(doneIds);
  ref.current = doneIds;

  useEffect(() => {
    setDoneIds(load(restaurantId, date));
  }, [restaurantId, date]);

  const commit = useCallback(
    (next: Set<number>) => {
      ref.current = next;
      setDoneIds(next);
      if (!date) return;
      try {
        window.localStorage.setItem(
          storageKey(restaurantId, date),
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore quota / private-mode errors — done state is a convenience */
      }
    },
    [restaurantId, date],
  );

  const setDone = useCallback(
    (orderId: number, done: boolean) => {
      const next = new Set(ref.current);
      if (done) next.add(orderId);
      else next.delete(orderId);
      commit(next);
    },
    [commit],
  );

  const toggle = useCallback(
    (orderId: number) => setDone(orderId, !ref.current.has(orderId)),
    [setDone],
  );

  const isDone = useCallback((orderId: number) => doneIds.has(orderId), [doneIds]);

  return { doneIds, isDone, toggle, setDone };
}
```

- [ ] **Step 2: Type-check**

Run: `cd foodyadmin && npx tsc --noEmit`
Expected: exits 0 (the hook is not imported yet; this only verifies it compiles).

- [ ] **Step 3: Commit**

```bash
git add src/lib/production-done.ts
git commit -m "feat(production): per-day mark-done localStorage hook"
```

---

## Task 3: Crosshair hover (row + column) in ProductionMatrix

**Files:**
- Modify: `src/components/production/ProductionMatrix.tsx`

**Interfaces:**
- Consumes: nothing new (self-contained state).
- Produces: internal hover behavior; no prop/signature change. Task 4 builds on the modified body-cell / customer-cell markup.

- [ ] **Step 1: Add highlight style constants**

In `ProductionMatrix.tsx`, directly after the existing `DROP_TARGET` constant (line 64):

```ts
// Crosshair hover: the whole hovered row and column get a translucent tint;
// sticky cells use an opaque variant so scrolling body content never shows
// through them; the exact hovered cell gets a 1px brand border.
const CROSS_TINT = 'bg-orange-100/60 dark:bg-orange-900/25';
const CROSS_STICKY = 'bg-orange-100 dark:bg-orange-950';
const CELL_BORDER = 'shadow-[inset_0_0_0_1px_var(--brand-500)]';
```

- [ ] **Step 2: Add hover state**

Immediately after the drag-state block (after the `clearDrag` definition, ~line 144), add:

```ts
  // ── Crosshair hover state (row = order_id, col = menu_item_id) ──
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const clearHover = () => {
    setHoverRow(null);
    setHoverCol(null);
  };
```

- [ ] **Step 3: Clear hover when the mouse leaves the table**

On the `<DataTable ...>` element (opening tag ~line 147), add an `onMouseLeave` handler. Change:

```tsx
    <DataTable
      ref={scrollRef}
      responsive={false}
```

to:

```tsx
    <DataTable
      ref={scrollRef}
      responsive={false}
      onMouseLeave={clearHover}
```

- [ ] **Step 4: Highlight the hovered column on the item-name header**

In the item-names header row, the item-name `<DataTableHeadCell>` (~line 229) currently has no mouse handler and a className ending `${overItem === id && dragItem ? DROP_TARGET : ''}`. Add a column-hover handler and swap `HEAD_BG` for the highlight when the column is active. Replace the opening of that cell:

```tsx
                <DataTableHeadCell
                  key={`n-${id}`}
                  align="center"
                  draggable={editable}
```

with:

```tsx
                <DataTableHeadCell
                  key={`n-${id}`}
                  align="center"
                  draggable={editable}
                  onMouseEnter={() => {
                    setHoverCol(id);
                    setHoverRow(null);
                  }}
```

Then, in that same cell's `className`, replace the token `${HEAD_BG}` with:

```
${hoverCol === id ? `${CROSS_STICKY} ${BRAND_TXT}` : HEAD_BG}
```

(so the full className expression becomes
`` `${stickyRow} ${hoverCol === id ? `${CROSS_STICKY} ${BRAND_TXT}` : HEAD_BG} group whitespace-nowrap ${editable ? 'cursor-grab active:cursor-grabbing select-none' : ''} ${overItem === id && dragItem ? DROP_TARGET : ''}` ``).

- [ ] **Step 5: Highlight the hovered column on the "À préparer" totals header**

In the totals header row, the total `<DataTableHeadCell key={`tt-${id}`}>` (~line 304) has `className={`${stickyRow} ${HEAD_BG} ${BRAND_TXT}`}`. It is already brand-colored, so only swap its background. Replace:

```tsx
                  className={`${stickyRow} ${HEAD_BG} ${BRAND_TXT}`}
```

with:

```tsx
                  className={`${stickyRow} ${hoverCol === id ? CROSS_STICKY : HEAD_BG} ${BRAND_TXT}`}
```

- [ ] **Step 6: Highlight the row via the sticky customer cell**

The customer cell (~line 333) currently is:

```tsx
            <DataTableCell className="sticky left-0 z-10 bg-white dark:bg-[#111111] font-medium whitespace-nowrap">
```

Replace that opening tag with a row-hover handler and a conditional background/emphasis:

```tsx
            <DataTableCell
              onMouseEnter={() => {
                setHoverRow(o.order_id);
                setHoverCol(null);
              }}
              className={`sticky left-0 z-10 font-medium whitespace-nowrap transition-colors ${
                hoverRow === o.order_id
                  ? `${CROSS_STICKY} ${BRAND_TXT} font-semibold`
                  : 'bg-white dark:bg-[#111111]'
              }`}
            >
```

- [ ] **Step 7: Highlight the hovered row + column on each body value cell**

The value `<DataTableCell key={`${o.order_id}-${id}`}>` (~line 351) is currently:

```tsx
                  <DataTableCell
                    key={`${o.order_id}-${id}`}
                    align="center"
                    className={`tabular-nums ${v ? '' : 'text-[var(--fg-subtle)]'}`}
                  >
```

Replace it with (adds `onMouseEnter` and the crosshair classes). Note the `const rowActive`/`const colActive` lines go just inside the `.map((id) => {` body, before `return (` — place them right after the existing `const prov = ...` line (~line 349):

```tsx
                const rowActive = hoverRow === o.order_id;
                const colActive = hoverCol === id;
```

and the cell becomes:

```tsx
                  <DataTableCell
                    key={`${o.order_id}-${id}`}
                    align="center"
                    onMouseEnter={() => {
                      setHoverRow(o.order_id);
                      setHoverCol(id);
                    }}
                    className={`tabular-nums transition-colors ${
                      v ? '' : 'text-[var(--fg-subtle)]'
                    } ${rowActive || colActive ? CROSS_TINT : ''} ${
                      rowActive && colActive ? CELL_BORDER : ''
                    }`}
                  >
```

- [ ] **Step 8: Type + lint gate**

Run: `cd foodyadmin && npx tsc --noEmit && npm run lint`
Expected: both exit 0, no errors or new warnings in `ProductionMatrix.tsx`.

- [ ] **Step 9: Manual verification**

Run: `cd foodyadmin && npm run dev` then open `http://localhost:3003/<restaurantId>/orders/production` for a date that has orders.
Confirm:
- Hovering a value cell tints its whole row AND whole column; the exact cell under the pointer shows a 1px orange border.
- The sticky customer cell (left) lights up and its text goes brand-orange + bold when its row is hovered (it does not stay white).
- The item-name header and the "À préparer" total light up when their column is hovered.
- Moving to another cell moves the crosshair; moving the pointer off the table clears it.

- [ ] **Step 10: Commit**

```bash
git add src/components/production/ProductionMatrix.tsx
git commit -m "feat(production): crosshair row+column hover focus"
```

---

## Task 4: Mark-done checkbox, dim/strike, sink-to-bottom in ProductionMatrix

**Files:**
- Modify: `src/components/production/ProductionMatrix.tsx`

**Interfaces:**
- Consumes: `useProductionDone` shape from Task 2 (via props, not a direct import).
- Produces: three new optional props on `ProductionMatrix`:
  - `doneIds?: Set<number>` — order ids currently marked done.
  - `onToggleDone?: (orderId: number) => void` — toggle callback; when omitted the whole done feature is inert (no checkbox, no reordering).
  - `reorderDone?: boolean` (default `true`) — when true, done rows sink below active rows under a "Terminé (N)" divider; pass `false` where rows are already grouped per customer.
  Consumed by Task 5.

- [ ] **Step 1: Import Checkbox and the order type**

At the top of `ProductionMatrix.tsx`, extend the `@/lib/api` import (line 6) to include `ProductionSheetOrder`:

```tsx
import {
  ProductionSheetResponse,
  ProductionSheetItem,
  ProductionSheetPortion,
  ProductionSheetOrder,
} from '@/lib/api';
```

Add the Checkbox import after the tooltip import (line 14):

```tsx
import { Checkbox } from '@/components/ui/checkbox';
```

- [ ] **Step 2: Add the new props to the interface**

In the `Props` interface (ends line 33), add before the closing brace:

```tsx
  /** Order ids marked prepared. Renders a done checkbox + dim/strike when set. */
  doneIds?: Set<number>;
  /** Toggle an order's done state. When omitted the done feature is inert. */
  onToggleDone?: (orderId: number) => void;
  /** When true (default) done rows sink below active ones under a divider.
   *  Pass false where rows are already grouped per customer (no reordering). */
  reorderDone?: boolean;
```

- [ ] **Step 3: Destructure the new props**

In the component parameter list (lines 70-78), add the three props:

```tsx
export function ProductionMatrix({
  sheet,
  onRowClick,
  availablePortions,
  boxSize,
  sticky = false,
  onReorderCategories,
  onReorderItems,
  doneIds,
  onToggleDone,
  reorderDone = true,
}: Props) {
```

- [ ] **Step 4: Compute done partitions and column count**

Immediately after `const editable = !!(onReorderCategories && onReorderItems);` (line 82), add:

```ts
  const doneEnabled = !!onToggleDone;
  const isDone = (orderId: number) => !!doneIds?.has(orderId);
  const activeOrders = doneEnabled
    ? sheet.orders.filter((o) => !isDone(o.order_id))
    : sheet.orders;
  const doneOrders = doneEnabled ? sheet.orders.filter((o) => isDone(o.order_id)) : [];
  // Total column span = the Client column + every item column across categories.
  const colCount = 1 + cats.reduce((n, c) => n + c.item_ids.length, 0);
```

- [ ] **Step 5: Extract the body row into a `renderRow` helper**

The body currently maps `sheet.orders` inline. Replace the ENTIRE `<DataTableBody> ... </DataTableBody>` block (lines 325-390) with a version that (a) defines `renderRow`, and (b) renders active → divider → done. Use this exact block — it preserves the crosshair code from Task 3 and adds the checkbox + done styling:

```tsx
      <DataTableBody>
        {(() => {
          const renderRow = (o: ProductionSheetOrder) => {
            const done = isDone(o.order_id);
            return (
              <DataTableRow
                key={o.order_id}
                striped={false}
                onClick={() => onRowClick(o.order_id)}
                className={`cursor-pointer transition-opacity ${
                  done ? 'opacity-60 line-through' : ''
                }`}
              >
                <DataTableCell
                  onMouseEnter={() => {
                    setHoverRow(o.order_id);
                    setHoverCol(null);
                  }}
                  className={`sticky left-0 z-10 font-medium whitespace-nowrap transition-colors ${
                    hoverRow === o.order_id
                      ? `${CROSS_STICKY} ${BRAND_TXT} font-semibold`
                      : 'bg-white dark:bg-[#111111]'
                  }`}
                >
                  <span className="inline-flex items-center">
                    {doneEnabled && (
                      <span
                        className="inline-flex align-middle me-2 no-underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => onToggleDone!(o.order_id)}
                          aria-label={t('productionMarkDone')}
                        />
                      </span>
                    )}
                    {o.customer_name}
                    <span
                      className={`ms-2 text-fs-micro px-2 py-0.5 rounded-r-sm no-underline ${
                        o.order_type === 'delivery'
                          ? 'bg-[var(--info-50)] text-[var(--info-500)]'
                          : 'bg-[var(--success-50)] text-[var(--success-500)]'
                      }`}
                    >
                      {o.order_type === 'delivery' ? '🚚' : '🛍'} {o.window_start ?? ''}
                    </span>
                  </span>
                </DataTableCell>
                {cats.flatMap((cat) =>
                  cat.item_ids.map((id) => {
                    const item = itemsById.get(id)!;
                    const v = o.cells[String(id)];
                    const prov = o.provenance?.[String(id)];
                    const rowActive = hoverRow === o.order_id;
                    const colActive = hoverCol === id;
                    return (
                      <DataTableCell
                        key={`${o.order_id}-${id}`}
                        align="center"
                        onMouseEnter={() => {
                          setHoverRow(o.order_id);
                          setHoverCol(id);
                        }}
                        className={`tabular-nums transition-colors ${
                          v ? '' : 'text-[var(--fg-subtle)]'
                        } ${rowActive || colActive ? CROSS_TINT : ''} ${
                          rowActive && colActive ? CELL_BORDER : ''
                        }`}
                      >
                        {prov ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-[var(--brand-500)] underline-offset-4">
                                {cellVal(v, item.measure)}
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]"
                                  aria-hidden
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {prov.combos.map((c) => (
                                <span key={c.name} className="block">
                                  {fmtProvQty(c.qty, item.measure, c.portions)} {item.name} ({c.name})
                                </span>
                              ))}
                              {prov.standalone > 0 && (
                                <span className="block opacity-80">
                                  {fmtProvQty(prov.standalone, item.measure, prov.standalone_portions)}{' '}
                                  {item.name} ({t('productionIndividual')})
                                </span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          cellVal(v, item.measure)
                        )}
                      </DataTableCell>
                    );
                  }),
                )}
              </DataTableRow>
            );
          };

          if (reorderDone && doneEnabled) {
            return (
              <>
                {activeOrders.map(renderRow)}
                {doneOrders.length > 0 && (
                  <tr className="border-y border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a]">
                    <td
                      colSpan={colCount}
                      className="sticky left-0 bg-neutral-50 dark:bg-[#0a0a0a] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]"
                    >
                      {t('productionDoneDivider')} ({doneOrders.length})
                    </td>
                  </tr>
                )}
                {doneOrders.map(renderRow)}
              </>
            );
          }
          return <>{sheet.orders.map(renderRow)}</>;
        })()}
      </DataTableBody>
```

- [ ] **Step 6: Type + lint gate**

Run: `cd foodyadmin && npx tsc --noEmit && npm run lint`
Expected: both exit 0. (The feature is still inert in the UI because `page.tsx` does not pass `onToggleDone` yet — this task only proves it compiles and renders unchanged.)

- [ ] **Step 7: Commit**

```bash
git add src/components/production/ProductionMatrix.tsx
git commit -m "feat(production): mark-done checkbox, dim/strike, sink-to-bottom (inert until wired)"
```

---

## Task 5: Wire the done hook into the production page

**Files:**
- Modify: `src/app/[restaurantId]/orders/production/page.tsx`

**Interfaces:**
- Consumes: `useProductionDone` (Task 2) and the `doneIds` / `onToggleDone` / `reorderDone` props (Task 4).
- Produces: the live feature.

- [ ] **Step 1: Import the hook**

After the `useProductionColumnOrder` import (line 28), add:

```tsx
import { useProductionDone } from '@/lib/production-done';
```

- [ ] **Step 2: Call the hook**

After the `useProductionColumnOrder(restaurantId)` destructure block (ends line 56), add:

```tsx
  // Per-device, per-day "prepared" set for the active restaurant + date.
  const { doneIds, toggle: toggleDone } = useProductionDone(restaurantId, date);
```

- [ ] **Step 3: Pass props to the split-by-category matrices**

In the `splitMode === 'category'` branch (~lines 376-382), add the two done props:

```tsx
              <ProductionMatrix
                key={cat.id}
                sheet={cs}
                onRowClick={handleRowClick}
                availablePortions={availablePortions}
                boxSize={boxSize}
                doneIds={doneIds}
                onToggleDone={toggleDone}
              />
```

- [ ] **Step 4: Pass props to the split-by-customer matrices (no reordering)**

In the `splitMode === 'customer'` branch (~lines 401-406), add the done props with `reorderDone={false}` (rows are already grouped per customer):

```tsx
                <ProductionMatrix
                  sheet={cs}
                  onRowClick={handleRowClick}
                  availablePortions={availablePortions}
                  boxSize={boxSize}
                  doneIds={doneIds}
                  onToggleDone={toggleDone}
                  reorderDone={false}
                />
```

- [ ] **Step 5: Pass props to the main flat matrix**

In the default (flat) branch (~lines 411-419), add the done props:

```tsx
          <ProductionMatrix
            sheet={orderedSheet}
            onRowClick={handleRowClick}
            availablePortions={availablePortions}
            boxSize={boxSize}
            sticky
            onReorderCategories={setCategoryOrder}
            onReorderItems={setItemOrder}
            doneIds={doneIds}
            onToggleDone={toggleDone}
          />
```

- [ ] **Step 6: Full gate**

Run: `cd foodyadmin && npm run check:i18n && npm run lint && npx tsc --noEmit && npm run build`
Expected: all four succeed; `next build` completes with no type/lint errors.

- [ ] **Step 7: Manual verification**

Run: `cd foodyadmin && npm run dev`, open `/<restaurantId>/orders/production` on a date with several orders.
Confirm:
- A checkbox appears at the start of each customer cell. Clicking it does NOT open the order detail drawer (drawer still opens when clicking elsewhere on the row).
- Checking a customer: the row dims + strikes through and drops below a "Terminé (N)" divider; the count is correct.
- Unchecking restores the row above the divider, full opacity.
- The "À préparer" totals do NOT change when marking done.
- Reload the page: same-day done state persists. Switch to another day with the date stepper: that day starts with nothing done. Switch back: the first day's done state is still there.
- Toggle "Diviser par client" (split-by-customer): each customer's row can be checked (dim + strike) with no divider/reordering. Toggle "Diviser par catégorie": checking sinks the row to the bottom of that category table under a divider.
- Crosshair hover from Task 3 still works in all modes.

- [ ] **Step 8: Commit**

```bash
git add src/app/[restaurantId]/orders/production/page.tsx
git commit -m "feat(production): wire per-day mark-done into the production sheet"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Crosshair row+column + emphasized customer/item + sticky-cell background override → Task 3 (steps 4-7). ✓
- Mark-done checkbox in customer cell, stopPropagation vs drawer → Task 4 (step 5). ✓
- Dim + strikethrough + sink below "Terminé (N)" divider; un-check restores → Task 4 (steps 4-5). ✓
- Split-mode rule (reorder in flat/category, dim-only in customer split) → Task 4 `reorderDone` prop + Task 5 steps 3-5. ✓
- Per-device, per-day localStorage `foody.production.done.<rid>.<date>`, graceful fallback → Task 2. ✓
- Totals stay full-day (Option A) — totals/box-packing code untouched by all tasks. ✓
- i18n keys in all three locales → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code.

**Type consistency:** Hook returns `{ doneIds, isDone, toggle, setDone }` (Task 2); page destructures `{ doneIds, toggle: toggleDone }` (Task 5); matrix props `doneIds` / `onToggleDone` / `reorderDone` match between Task 4 interface and Task 5 call sites. `ProductionSheetOrder` imported in Task 4 for the `renderRow` param type. Constants `CROSS_TINT` / `CROSS_STICKY` / `CELL_BORDER` defined in Task 3 step 1 and used consistently in Tasks 3-4.
```
