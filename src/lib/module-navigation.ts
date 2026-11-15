import type { FoodyModuleAccess } from './api';

/** Filters UI destinations for the resolved sandbox workspace. The API owns access. */
export function allowsModulePath(access: FoodyModuleAccess | undefined, href: string): boolean {
  if (!access) return true;
  const path = href.replace(/^\/\d+(?=\/|$)/, '').split('?')[0];
  if (path === '/billing') return true;
  if (!access.modules.length) return false;

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
