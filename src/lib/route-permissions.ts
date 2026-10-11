// Maps a feature section (the first path segment after /{restaurantId}) to the
// permissions that grant access to it. A user needs ANY one of the listed
// permissions. Sections not listed here are open to any authenticated staff
// member (e.g. the dashboard); the server still enforces per-action
// permissions regardless.
//
// Keep this in sync with the nav permission gates in components/Sidebar.tsx.
const SECTION_PERMISSIONS: Record<string, string[]> = {
  menu: ['menu.view', 'menu.edit'],
  kitchen: ['kitchen.view', 'kitchen.manage'],
  orders: ['orders.view', 'orders.manage'],
  'website-v3': ['settings.edit'],
  customers: ['customers.view', 'customers.manage'],
  analytics: ['analytics.view'],
  staff: ['staff.view', 'staff.manage', 'roles.manage'],
  roles: ['roles.manage', 'staff.manage'],
  settings: ['settings.view', 'settings.edit', 'tables.manage'],
  marketing: ['discounts.view', 'discounts.edit'],
  // Floor plans, sections, table status/QR live under /restaurant/*.
  restaurant: ['tables.view', 'tables.manage', 'settings.view', 'settings.edit'],
  catering: ['catering.view', 'catering.manage'],
  // Branch management page, reached directly from the main navigation. Owners bypass.
  chain: ['chain.manage'],
};

/** Read permissions shared with the server's physical-device inventory policy. */
export const DEVICE_INVENTORY_READ_PERMISSIONS = [
  'printers.view', 'printers.manage', 'shifts.view', 'shifts.manage',
  'payments.view', 'payments.manage', 'kitchen.view', 'kitchen.manage',
  'settings.view', 'settings.edit', 'tables.view', 'tables.manage',
];

/**
 * Returns the permissions required to access the given pathname. The caller
 * needs ANY one of them. An empty array means no specific permission is
 * required (open to any authenticated user).
 */
export function requiredPermissionsForPath(pathname: string): string[] {
  // pathname looks like /{restaurantId}/{section}/...
  const segments = pathname.split('/').filter(Boolean);
  const section = segments[1]; // segments[0] is the restaurantId
  if (!section) return [];
  if (section === 'kitchen' && segments[2] === 'data') return ['kitchen.data_manage'];
  if (section === 'settings' && segments[2] === 'stories') return ['settings.view', 'settings.edit'];
  if (section === 'settings' && segments[2] === 'delivery') return ['orders.manage', 'settings.view', 'settings.edit'];
  if (section === 'settings' && segments[2] === 'team') return ['staff.view', 'staff.manage', 'roles.manage'];
  if (section === 'settings' && segments[2] === 'devices') return DEVICE_INVENTORY_READ_PERMISSIONS;
  if (section === 'settings' && segments[2] === 'printers') {
    return ['printers.view', 'printers.manage'];
  }
  if (section === 'staff' && segments[2] === 'shifts') {
    return ['shifts.view', 'shifts.manage'];
  }
  if (section === 'staff' && segments[2] === 'devices') {
    return ['shifts.manage'];
  }
  if (section === 'staff' && segments[2] === 'table-service') {
    return ['staff.manage'];
  }
  if (section === 'orders' && segments[2] === 'courier-mode') {
    return ['orders.manage'];
  }
  return SECTION_PERMISSIONS[section] ?? [];
}
