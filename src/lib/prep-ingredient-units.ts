import type { StockItem } from './api';

export interface PrepIngredientUnitOption {
  unit: string;
  basePerUnit: number;
}

function standardFactor(from: string, to: string): number | null {
  if (from === to) return 1;
  const families: Record<string, number>[] = [{ g: 1, kg: 1000 }, { ml: 1, l: 1000 }];
  for (const family of families) {
    const fromFactor = family[from];
    const toFactor = family[to];
    if (fromFactor !== undefined && toFactor !== undefined) return fromFactor / toFactor;
  }
  return null;
}

/** Units with a known conversion to this stock item's base unit. */
export function prepIngredientUnitOptions(item: StockItem): PrepIngredientUnitOption[] {
  const options: PrepIngredientUnitOption[] = [{ unit: item.unit, basePerUnit: 1 }];
  const add = (unit: string, basePerUnit: number) => {
    if (unit && Number.isFinite(basePerUnit) && basePerUnit > 0 && !options.some((x) => x.unit === unit)) {
      options.push({ unit, basePerUnit });
    }
  };

  for (const unit of ['g', 'kg', 'ml', 'l']) {
    const factor = standardFactor(unit, item.unit);
    if (factor !== null) add(unit, factor);
  }
  for (const conversion of item.unit_conversions ?? []) {
    if (conversion.custom_unit?.name) add(conversion.custom_unit.name, conversion.base_quantity);
  }

  const content = item.unit_content ?? 0;
  const contentFactor = standardFactor(item.unit_content_unit || '', item.unit);
  if (content > 0 && contentFactor !== null) {
    if (item.unit_type && item.pack_size > 0) {
      add(item.unit_type, content * contentFactor);
    }
    if (item.container_type) {
      const unitsPerPackage = item.unit_type && item.pack_size > 0 ? item.pack_size : 1;
      add(item.container_type, unitsPerPackage * content * contentFactor);
    }
  }
  return options;
}

/** Preview of the stock deduction and cost for one recipe ingredient. */
export function prepIngredientBaseQuantity(item: StockItem, quantity: number, unit: string): number | null {
  const option = prepIngredientUnitOptions(item).find((x) => x.unit === unit);
  return option && Number.isFinite(quantity) ? quantity * option.basePerUnit : null;
}
