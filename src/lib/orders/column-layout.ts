import type { OrdersTableConfig } from '@/lib/api';
import { orderBy } from '@/lib/partial-order';

/**
 * Pure layout resolution for a configurable table: which columns show, in what
 * order, and which one heads the card on mobile.
 *
 * Kept free of JSX so it can be tested on its own — the column definitions it
 * operates on pull in the whole order-detail component tree.
 */
export interface ColumnSpec {
  key: string;
  /** Shown to a restaurant that has not customised its table. */
  defaultVisible: boolean;
  /** Eligible to head the card when the table collapses on mobile. */
  mobilePrimary?: boolean;
}

export type Resolved<T> = T & { visible: boolean };
export type Rendered<T> = T & { isMobilePrimary: boolean };

/**
 * Arrange `all` per `config` and resolve each column's visibility.
 *
 * `config` is a partial preference: a column it does not mention keeps its
 * natural position and its `defaultVisible`. That is what lets a column added
 * in a later release appear correctly for restaurants that had already saved a
 * layout, instead of silently going missing for exactly those who customised.
 */
export function resolveColumns<T extends ColumnSpec>(
  all: T[],
  config?: OrdersTableConfig | null,
): Resolved<T>[] {
  const byKey = new Map(all.map((c) => [c.key, c] as const));
  const saved = Array.isArray(config?.order) ? config.order : [];
  const visible = config?.visible && typeof config.visible === 'object' ? config.visible : {};
  return orderBy(
    all.map((c) => c.key),
    saved,
  )
    .map((key) => byKey.get(key))
    .filter((c): c is T => !!c)
    .map((c) => ({ ...c, visible: visible[c.key] ?? c.defaultVisible }));
}

/**
 * The columns actually rendered, with exactly one marked as the mobile card
 * heading. The heading is normally the column that opted in; if that one is
 * hidden the leading visible column takes over, so a card is never left
 * title-less. Returns an empty list if every column is hidden.
 */
export function visibleColumns<T extends ColumnSpec>(
  all: T[],
  config?: OrdersTableConfig | null,
): Rendered<T>[] {
  const shown = resolveColumns(all, config).filter((c) => c.visible);
  const primaryKey = (shown.find((c) => c.mobilePrimary) ?? shown[0])?.key;
  return shown.map((c) => ({ ...c, isMobilePrimary: c.key === primaryKey }));
}

/** Whether this restaurant customised anything. Drives the reset action. */
export function hasCustomLayout(config?: OrdersTableConfig | null): boolean {
  if (!config) return false;
  return (config.order?.length ?? 0) > 0 || Object.keys(config.visible ?? {}).length > 0;
}
