import type { FoodyCommercialCatalog, FoodyModule, FoodySeatLimits } from './api';

export const licenceTariffs = { pos: 'extraPos', employees: 'extraEmployee', chef: 'extraChef', pos_devices: 'extraPOSDevice', kds: 'extraKDS' } as const;

/** Combines independent licence allowances; an unlimited allowance remains unlimited. */
export function combineLicenceLimits(a: FoodySeatLimits, b: FoodySeatLimits): FoodySeatLimits {
  return { pos_users_unlimited: !!(a.pos_users_unlimited || b.pos_users_unlimited), pos: a.pos_users_unlimited || b.pos_users_unlimited ? 0 : a.pos + b.pos, chef: a.chef + b.chef, kds: a.kds + b.kds,
    employees: a.employees == null || b.employees == null ? null : a.employees + b.employees,
    pos_devices: a.pos_devices == null || b.pos_devices == null ? null : a.pos_devices + b.pos_devices };
}

/** Previews a public selection. The API independently calculates the accepted price and rights. */
export function commercialSelection(catalog: FoodyCommercialCatalog, modules: FoodyModule[], planId = '') {
  const products = catalog.products.filter(product => modules.includes(product.id));
  const empty: FoodySeatLimits = { pos: 0, chef: 0, kds: 0, employees: 0, pos_devices: 0 };
  const included = products.reduce((total, product) => combineLicenceLimits(total, product.included), empty);
  const sum = products.reduce((total, product) => total + product.monthly_minor, 0);
  const capabilities = Array.from(new Set(products.flatMap(product => product.capabilities ?? [])));
  const covers = (a: number | null | undefined, b: number | null | undefined) => a == null || b != null && a >= b;
  const automatic = !planId ? catalog.plans?.filter(p => p.published && p.automatic &&
    p.modules.length === modules.length && p.modules.every(id => modules.includes(id)) && p.monthly_minor < sum &&
    capabilities.every(key => p.capabilities?.includes(key)) &&
    (p.included.pos_users_unlimited || !included.pos_users_unlimited && p.included.pos >= included.pos) &&
    p.included.chef >= included.chef && p.included.kds >= included.kds &&
    covers(p.included.employees, included.employees) && covers(p.included.pos_devices, included.pos_devices)
  ).sort((a, b) => a.monthly_minor - b.monthly_minor || a.id.localeCompare(b.id))[0] : undefined;
  const plan = catalog.plans?.find(row => row.id === planId && row.published) ?? automatic;
  return {
    planName: plan?.name,
    modules: plan?.modules ?? modules,
    seats: plan?.included ?? included,
    capabilities: plan?.capabilities ?? capabilities,
    monthlyMinor: plan?.monthly_minor ?? sum,
  };
}
