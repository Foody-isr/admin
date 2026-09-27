// Maps a feature section (the first path segment after /{restaurantId}) to the
// permissions that grant access to it. A user needs ANY one of the listed
// permissions. Sections not listed here are open to any authenticated staff
// member; the server still enforces per-action
// permissions regardless.
//
// Keep this in sync with the nav permission gates in components/Sidebar.tsx.
const SECTION_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['analytics.view'],
  menu: ['menu.view', 'menu.edit'],
  kitchen: ['kitchen.view', 'kitchen.manage'],
  orders: ['orders.view', 'orders.manage'],
  website: ['settings.edit'],
  customers: ['customers.view', 'customers.manage'],
  analytics: ['analytics.view'],
  staff: ['staff.view', 'staff.manage', 'roles.manage'],
  roles: ['roles.manage', 'staff.manage'],
  settings: ['settings.view', 'settings.edit'],
  marketing: ['discounts.view', 'discounts.edit'],
  // Floor plans, sections, table status/QR live under /restaurant/*.
  restaurant: ['tables.view', 'tables.manage', 'settings.view', 'settings.edit'],
  catering: ['catering.view', 'catering.manage'],
  // Branch management page (reached from the top-bar switcher). Owners bypass;
  // the switcher itself works for any staff since it uses a separate API path.
  chain: ['chain.manage'],
  billing: ['settings.view', 'settings.edit'],
  delivery: ['orders.manage'],
  reels: ['settings.view', 'settings.edit'],
  'website-v2': ['settings.edit'],
  'website-v3': ['settings.edit'],
};

/** Permissions accepted by GET /restaurants/:id/devices on foodyserver. */
export const MANAGED_DEVICE_VIEW_PERMISSIONS = [
  'printers.view',
  'printers.manage',
  'shifts.view',
  'shifts.manage',
  'payments.view',
  'payments.manage',
  'kitchen.view',
  'kitchen.manage',
  'settings.view',
  'settings.edit',
] as const;

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
  if (section === 'settings' && segments[2] === 'security') {
    return [];
  }
  if (section === 'settings' && segments[2] === 'notifications') {
    return [];
  }
  if (section === 'settings' && segments[2] === 'devices') {
    return [...MANAGED_DEVICE_VIEW_PERMISSIONS];
  }
  if (section === 'settings' && segments[2] === 'printers') {
    return ['printers.view', 'printers.manage'];
  }
  if (section === 'settings' && segments[2] === 'team') {
    return ['staff.view', 'staff.manage', 'roles.manage'];
  }
  if (section === 'kitchen' && segments[2] === 'lab') {
    return ['kitchen.manage'];
  }
  if (section === 'orders' && segments[2] === 'production') {
    return ['kitchen.view', 'kitchen.manage'];
  }
  if (section === 'orders' && segments[2] === 'new') {
    return ['orders.manage'];
  }
  if (
    section === 'menu' &&
    (segments[2] === 'import' ||
      (segments[2] === 'items' && segments[3] === 'new') ||
      (segments[2] === 'options' && segments[3] === 'new') ||
      segments[4] === 'edit')
  ) {
    return ['menu.edit'];
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
  if (
    section === 'restaurant' &&
    ((segments[2] === 'floor-plans' && segments[3] === 'new') ||
      (segments[2] === 'table-qr' && segments[3] === 'customize'))
  ) {
    return ['tables.manage'];
  }
  if (
    section === 'restaurant' &&
    ['floor-plans', 'sections', 'table-status', 'table-qr'].includes(segments[2] ?? '')
  ) {
    return ['tables.view', 'tables.manage'];
  }
  if (section === 'restaurant' && segments[2] === 'workflow') {
    return ['settings.view', 'settings.edit'];
  }
  if (section === 'orders' && segments[2] === 'courier-mode') {
    return ['orders.manage'];
  }
  return SECTION_PERMISSIONS[section] ?? [];
}

/** Returns the first useful Admin destination granted to the user. */
export function defaultRestaurantPath(
  restaurantId: number,
  permissions: string[],
): string | null {
  const candidates = [
    'dashboard',
    'orders/all',
    'menu/items',
    'kitchen/daily-operations',
    'customers',
    'analytics/overview',
    'staff',
    'settings',
    'settings/security',
  ];
  for (const suffix of candidates) {
    const path = `/${restaurantId}/${suffix}`;
    const required = requiredPermissionsForPath(path);
    if (
      required.length === 0 ||
      required.some((permission) => permissions.includes(permission))
    ) {
      return path;
    }
  }
  return null;
}
