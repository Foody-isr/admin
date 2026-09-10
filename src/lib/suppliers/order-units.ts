import type { StockItem } from "@/lib/api";
import { convertToBaseUnit } from "@/lib/units";

export interface SupplierPackagingLike {
  packagingSet: boolean;
  unitsPerPack: number;
  unitSize: number;
  unitSizeUnit: string;
  containerType: string;
  unitType: string;
}

export type OrderUnitKind = "stock" | "custom" | "packaging";

export interface OrderUnitOption {
  value: string;
  kind: OrderUnitKind;
  baseQuantityPerUnit: number;
  abbreviation?: string;
}

function standardUnitsFor(baseUnit: string): string[] {
  if (baseUnit === "kg") return ["kg", "g"];
  if (baseUnit === "g") return ["g", "kg"];
  if (baseUnit === "l") return ["l", "ml"];
  if (baseUnit === "ml") return ["ml", "l"];
  return [baseUnit];
}

/** Returns the amount added to stock by one outer supplier package. */
export function packagingBaseQuantity(
  packaging: SupplierPackagingLike,
  stockItem: StockItem,
): number | null {
  if (!packaging.packagingSet) return null;
  let quantity = packaging.unitsPerPack > 0 ? packaging.unitsPerPack : 1;
  if (packaging.unitSize > 0) {
    quantity *= packaging.unitSize;
    return convertToBaseUnit(
      quantity,
      packaging.unitSizeUnit || stockItem.unit,
      stockItem.unit,
      stockItem.unit_conversions,
    );
  }
  if (packaging.unitsPerPack > 0 && packaging.unitType) {
    return convertToBaseUnit(
      quantity,
      packaging.unitType,
      stockItem.unit,
      stockItem.unit_conversions,
    );
  }
  return quantity;
}

/** Builds the units a chef can safely use for one supplier order line. */
export function buildOrderUnitOptions(
  stockItem: StockItem,
  packaging: SupplierPackagingLike,
): OrderUnitOption[] {
  const options = new Map<string, OrderUnitOption>();
  standardUnitsFor(stockItem.unit).forEach((unit) => {
    const baseQuantity = convertToBaseUnit(
      1,
      unit,
      stockItem.unit,
      stockItem.unit_conversions,
    );
    if (baseQuantity != null && baseQuantity > 0) {
      options.set(unit, {
        value: unit,
        kind: "stock",
        baseQuantityPerUnit: baseQuantity,
      });
    }
  });

  (stockItem.unit_conversions ?? []).forEach((conversion) => {
    const unit = conversion.custom_unit?.name?.trim();
    if (!unit || conversion.base_quantity <= 0) return;
    options.set(unit, {
      value: unit,
      kind: "custom",
      baseQuantityPerUnit: conversion.base_quantity,
      abbreviation: conversion.custom_unit?.abbreviation || undefined,
    });
  });

  const packageQuantity = packagingBaseQuantity(packaging, stockItem);
  if (packageQuantity != null && packageQuantity > 0) {
    const unit = packaging.containerType.trim() || "pack";
    options.set(unit, {
      value: unit,
      kind: "packaging",
      baseQuantityPerUnit: packageQuantity,
    });
  }
  return Array.from(options.values());
}

export function orderQuantityInBase(
  quantity: number,
  unit: string,
  options: OrderUnitOption[],
): number | null {
  const option = options.find((candidate) => candidate.value === unit);
  if (!option || quantity < 0) return null;
  return quantity * option.baseQuantityPerUnit;
}

export function preferredOrderUnit(
  savedUnit: string | undefined,
  options: OrderUnitOption[],
): string {
  if (savedUnit && options.some((option) => option.value === savedUnit)) {
    return savedUnit;
  }
  return (
    options.find((option) => option.kind === "packaging")?.value ??
    options[0]?.value ??
    ""
  );
}
