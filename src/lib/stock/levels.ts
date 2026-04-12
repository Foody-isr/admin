import type { StockItem } from '@/lib/api';

export type Level = 'L1' | 'L2' | 'L3';

export interface Packaging {
  mode: 'nested' | 'direct' | 'simple';
  levels: Level[];
  defaultLevel: Level;
}

export function getPackaging(item: StockItem): Packaging {
  const pack = item.pack_size ?? 0;
  const content = item.unit_content ?? 0;
  const outer = item.container_type || '';
  const inner = item.unit_type || '';

  if (outer && inner && pack > 0 && content > 0) {
    return { mode: 'nested', levels: ['L1', 'L2', 'L3'], defaultLevel: 'L2' };
  }
  if (outer && content > 0 && pack === 0) {
    return { mode: 'direct', levels: ['L1', 'L3'], defaultLevel: 'L1' };
  }
  return { mode: 'simple', levels: ['L3'], defaultLevel: 'L3' };
}

export function cycleLevel(current: Level, levels: Level[]): Level {
  const idx = levels.indexOf(current);
  return levels[(idx + 1) % levels.length];
}

function pluralize(word: string, count: number): string {
  if (!word) return word;
  if (count === 1) return word;
  if (word.endsWith('s')) return word;
  return word + 's';
}

function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function formatBaseAmount(amount: number, unit: string): string {
  if (unit === 'g' && amount >= 1000) return `${fmtCount(amount / 1000)} kg`;
  if (unit === 'ml' && amount >= 1000) return `${fmtCount(amount / 1000)} L`;
  return `${fmtCount(amount)} ${unit}`;
}

export function formatQuantityAtLevel(item: StockItem, level: Level): string {
  const pack = item.pack_size ?? 0;
  const content = item.unit_content ?? 0;
  const outer = item.container_type || '';
  const inner = item.unit_type || '';
  const contentUnit = item.unit_content_unit || item.unit || '';
  const baseUnit = item.unit || '';

  if (level === 'L3') {
    const unit = content > 0 ? contentUnit : baseUnit;
    return formatBaseAmount(item.quantity, unit);
  }

  if (level === 'L2') {
    const count = content > 0 ? item.quantity / content : item.quantity;
    return `${fmtCount(count)} ${pluralize(inner, count)}`.trim();
  }

  // L1
  if (pack > 0 && content > 0) {
    const count = item.quantity / (pack * content);
    const descriptor = ` (of ${pack} ${pluralize(inner, pack)} × ${fmtCount(content)}${contentUnit})`;
    return `${fmtCount(count)} ${pluralize(outer, count)}${descriptor}`;
  }
  if (content > 0) {
    const count = item.quantity / content;
    const descriptor = ` (of ${fmtCount(content)}${contentUnit})`;
    return `${fmtCount(count)} ${pluralize(outer, count)}${descriptor}`;
  }
  return formatBaseAmount(item.quantity, baseUnit);
}

export function formatUnitPriceAtLevel(
  item: StockItem,
  level: Level,
  costPerBase: number,
): string {
  const pack = item.pack_size ?? 0;
  const content = item.unit_content ?? 0;
  const outer = item.container_type || '';
  const inner = item.unit_type || '';
  const baseUnit = item.unit_content_unit || item.unit || '';

  if (!(costPerBase > 0)) return '—';

  if (level === 'L3') {
    if (baseUnit === 'g') return `${(costPerBase * 1000).toFixed(2)} ₪ / kg`;
    if (baseUnit === 'ml') return `${(costPerBase * 1000).toFixed(2)} ₪ / L`;
    return `${costPerBase.toFixed(2)} ₪ / ${baseUnit}`;
  }

  if (level === 'L2') {
    const price = costPerBase * (content > 0 ? content : 1);
    const label = inner || baseUnit;
    return `${price.toFixed(2)} ₪ / ${label}`;
  }

  // L1
  if (pack > 0 && content > 0) {
    return `${(costPerBase * pack * content).toFixed(2)} ₪ / ${outer}`;
  }
  if (content > 0) {
    return `${(costPerBase * content).toFixed(2)} ₪ / ${outer || baseUnit}`;
  }
  return `${costPerBase.toFixed(2)} ₪`;
}

export function loadLevel(rid: number, itemId: number): Level | null {
  try {
    const v = localStorage.getItem(`foody.stock.level.${rid}.${itemId}`);
    if (v === 'L1' || v === 'L2' || v === 'L3') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveLevel(rid: number, itemId: number, level: Level): void {
  try {
    localStorage.setItem(`foody.stock.level.${rid}.${itemId}`, level);
  } catch {
    /* ignore */
  }
}
