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
  website: ['settings.edit'],
  customers: ['customers.view', 'customers.manage'],
  analytics: ['analytics.view'],
  staff: ['staff.view', 'staff.manage', 'roles.manage'],
  roles: ['roles.manage', 'staff.manage'],
  settings: ['settings.view', 'settings.edit', 'tables.manage'],
  marketing: ['discounts.view', 'discounts.edit'],
  // Floor plans, sections, table status/QR live under /restaurant/*.
  restaurant: ['tables.view', 'tables.manage', 'settings.view', 'settings.edit'],
  catering: ['catering.view', 'catering.manage'],
};

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
  return SECTION_PERMISSIONS[section] ?? [];
}
