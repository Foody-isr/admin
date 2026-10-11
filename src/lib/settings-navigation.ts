import { requiredPermissionsForPath } from './route-permissions';

export interface SettingsDestination {
  href: string;
  labelKey: string;
  exact?: boolean;
  desktopOnly?: boolean;
  perm?: string[];
}

export interface SettingsNavigationGroup {
  labelKey: string;
  items: SettingsDestination[];
}

/** One settings hierarchy shared by the app rail and settings breadcrumbs. */
export function settingsNavigation(restaurantId: number): SettingsNavigationGroup[] {
  const base = `/${restaurantId}`;
  return [
    { labelKey: 'settingsGroupAccount', items: [
      { href: `${base}/settings/branding`, labelKey: 'branding' },
      { href: `${base}/settings/language`, labelKey: 'language' },
      { href: `${base}/settings/notifications`, labelKey: 'notifications' },
      { href: `${base}/settings/security`, labelKey: 'security' },
    ] },
    { labelKey: 'settingsGroupRestaurant', items: [
      { href: `${base}/settings`, labelKey: 'general', exact: true },
      { href: `${base}/settings/orders/availability`, labelKey: 'settingsHours' },
      { href: `${base}/settings/orders/processing`, labelKey: 'ordersProcessingShort' },
      { href: `${base}/settings/orders/workflow`, labelKey: 'orderWorkflow' },
      { href: `${base}/settings/stock`, labelKey: 'stockSettings' },
      { href: `${base}/restaurant/floor-plans`, labelKey: 'floorPlans', desktopOnly: true },
      { href: `${base}/restaurant/sections`, labelKey: 'sections' },
      { href: `${base}/settings/table-assistance`, labelKey: 'tableServiceSettings' },
      { href: `${base}/restaurant/table-status`, labelKey: 'tableStatus' },
      { href: `${base}/restaurant/table-qr`, labelKey: 'tableQrCodes' },
    ] },
    { labelKey: 'settingsGroupOrdering', items: [
      { href: `${base}/settings/orders`, labelKey: 'settingsOrderTaking', exact: true },
      { href: `${base}/settings/delivery`, labelKey: 'deliveryZones' },
      { href: `${base}/settings/ai-assistant`, labelKey: 'aiOrderAssistant' },
    ] },
    { labelKey: 'paymentsAndVat', items: [
      { href: `${base}/settings/payments`, labelKey: 'paymentsAndVat' },
      { href: `${base}/settings/cibus`, labelKey: 'cibusSettings' },
    ] },
    { labelKey: 'settingsGroupDevices', items: [
      { href: `${base}/settings/devices`, labelKey: 'deviceManagementTitle' },
      { href: `${base}/settings/printers`, labelKey: 'printerProfilesTitle' },
    ] },
    { labelKey: 'settingsGroupCommunications', items: [
      { href: `${base}/settings/stories`, labelKey: 'reels' },
      { href: `${base}/settings/whatsapp`, labelKey: 'whatsapp' },
      { href: `${base}/settings/message-templates`, labelKey: 'messageTemplates' },
    ] },
    { labelKey: 'settingsGroupOrg', items: [
      { href: `${base}/settings/team`, labelKey: 'staffAndRoles', perm: ['staff.view', 'staff.manage', 'roles.manage'] },
    ] },
  ];
}

/** Match a leaf without marking a settings overview active on every subpage. */
export function isSettingsDestinationActive(pathname: string, destination: SettingsDestination): boolean {
  return pathname === destination.href || (!destination.exact && pathname.startsWith(`${destination.href}/`));
}

/** Keep each offered destination consistent with its route guard and page scope. */
export function visibleSettingsNavigation(restaurantId: number, hasAnyPermission: (...permissions: string[]) => boolean): SettingsNavigationGroup[] {
  return settingsNavigation(restaurantId).map(group => ({
    ...group,
    items: group.items.filter(item => {
      const required = requiredPermissionsForPath(item.href);
      return (!required.length || hasAnyPermission(...required)) && (!item.perm || hasAnyPermission(...item.perm));
    }),
  })).filter(group => group.items.length > 0);
}
