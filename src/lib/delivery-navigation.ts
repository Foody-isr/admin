import type { FoodyModuleAccess } from './api';
import { allowsModulePath } from './module-navigation';

const pages = [
  { path: '/orders/deliveries', label: 'deliveryNavDispatch', permissions: ['orders.manage'] },
  { path: '/orders/courier-mode', label: 'courierMode', permissions: ['orders.manage'] },
  { path: '/settings/delivery', label: 'deliveryNavZones', permissions: ['orders.manage', 'settings.view', 'settings.edit'] },
] as const;

/** Recognizes pages which share the restaurant's Deliveries navigation. */
export function isDeliveryPage(pathname: string): boolean {
  return pages.some(page => pathname.replace(/^\/\d+/, '') === page.path);
}

/** Lists the workspaces staff may open, with the default landing page first. */
export function deliveryDestinations(rid: number, access: FoodyModuleAccess | undefined, permits: (...permissions: string[]) => boolean) {
  return pages.filter(page => permits(...page.permissions) && allowsModulePath(access, `/${rid}${page.path}`));
}
