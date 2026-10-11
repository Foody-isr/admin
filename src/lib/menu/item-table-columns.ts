export const ITEM_TABLE_COLUMNS = [
  { key: 'images', labelKey: 'itemTableImages' },
  { key: 'category', labelKey: 'category' },
  { key: 'availability', labelKey: 'availability' },
  { key: 'price', labelKey: 'price' },
] as const;

export type ItemTableColumn = typeof ITEM_TABLE_COLUMNS[number]['key'];
export type ItemTableVisibility = Record<ItemTableColumn, boolean>;

/** Accepts only known boolean preferences; new or invalid columns stay visible. */
export function resolveItemTableVisibility(value: unknown): ItemTableVisibility {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(ITEM_TABLE_COLUMNS.map(({ key }) => [key, typeof saved[key] === 'boolean' ? saved[key] : true])) as ItemTableVisibility;
}
