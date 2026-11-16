import type { FoodyModuleAccess } from './api';

/** Filters UI destinations for the resolved sandbox workspace. The API owns access. */
export function allowsModulePath(access: FoodyModuleAccess | undefined, href: string): boolean {
  if (!access) return true;
  const path = href.replace(/^\/\d+(?=\/|$)/, '').split('?')[0];
  if (path === '/billing') return true;
  if (!access.modules.length) return false;

  if (access.enforced) { const feature = requiredCapability(access, href); return !feature || !!access.capabilities?.includes(feature); }

  const restaurant = access.modules.includes('restaurant');
  const orders = access.modules.includes('ordering');
  const kitchen = access.modules.includes('kitchen');
  const at = (base: string) => path === base || path.startsWith(base + '/');
  if (at('/kitchen') || at('/menu/stock')) return kitchen;
  if (at('/orders/deliveries') || at('/orders/courier-mode') || at('/website-v3') || at('/customers')) return orders;
  if (at('/restaurant') || at('/tables') || at('/staff/table-service') || at('/settings/modes') || at('/settings/printers')) return restaurant;
  if (at('/orders') || at('/transactions')) return restaurant || orders;
  if (at('/menu/menus') || at('/menu/pos-discounts')) return restaurant || orders;
  if (at('/marketing') || at('/settings/whatsapp')) return false;
  return true;
}

/** Finds the most specific product feature for an Admin destination. */
export function requiredCapability(access: FoodyModuleAccess | undefined, href: string): string | undefined {
 const path = href.replace(/^\/\d+(?=\/|$)/, '').split('?')[0];
 return Object.entries(access?.feature_paths ?? {}).filter(([prefix])=>path===prefix||path.startsWith(prefix+'/')).sort(([a],[b])=>b.length-a.length)[0]?.[1];
}
