import type { FoodyCommercialCatalog, FoodyModule, FoodySeatLimits } from './api';

export const licenceTariffs = { pos: 'extraPos', employees: 'extraEmployee', chef: 'extraChef', pos_devices: 'extraPOSDevice', kds: 'extraKDS' } as const;

/** Combines independent licence allowances; an unlimited allowance remains unlimited. */
export function combineLicenceLimits(a: FoodySeatLimits, b: FoodySeatLimits): FoodySeatLimits {
  return { pos: a.pos + b.pos, chef: a.chef + b.chef, kds: a.kds + b.kds,
    employees: a.employees == null || b.employees == null ? null : a.employees + b.employees,
    pos_devices: a.pos_devices == null || b.pos_devices == null ? null : a.pos_devices + b.pos_devices };
}

/** Previews a public selection. The API independently calculates the accepted price and rights. */
export function commercialSelection(catalog: FoodyCommercialCatalog, modules: FoodyModule[], planId = '') {
  const plan = catalog.plans?.find(row => row.id === planId && row.published);
  const products = catalog.products.filter(product => modules.includes(product.id));
  const empty: FoodySeatLimits = { pos: 0, chef: 0, kds: 0, employees: 0, pos_devices: 0 };
  return {
    modules: plan?.modules ?? modules,
    seats: plan?.included ?? products.reduce((sum, product) => combineLicenceLimits(sum, product.included), empty),
    capabilities: plan?.capabilities ?? Array.from(new Set(products.flatMap(product => product.capabilities ?? []))),
    monthlyMinor: plan?.monthly_minor ?? products.reduce((sum, product) => sum + product.monthly_minor, 0),
  };
}
