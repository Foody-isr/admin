// Helpers to translate the server-provided role/permission strings (role names,
// descriptions, permission domains, labels and descriptions). The backend
// returns canonical English; we map by stable identifiers (permission key,
// domain name, default role name) to i18n keys and fall back to the
// server-provided text for anything without a translation (e.g. custom roles).

type T = (key: string) => string;

// t() returns the key itself when a translation is missing; this returns the
// provided fallback in that case instead.
function tr(t: T, key: string, fallback: string): string {
  const v = t(key);
  return v === key ? fallback : v;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Permission domain header, e.g. "Menu" → translated. */
export function permissionDomainLabel(t: T, domain: string): string {
  return tr(t, `permDomain_${slug(domain)}`, domain);
}

/** Permission label, keyed by its stable permission key (e.g. "menu.view"). */
export function permissionLabel(t: T, key: string, fallback: string): string {
  return tr(t, `permLabel_${key.replace(/\./g, '_')}`, fallback);
}

/** Permission description, keyed by its stable permission key. */
export function permissionDescription(t: T, key: string, fallback: string): string {
  return tr(t, `permDesc_${key.replace(/\./g, '_')}`, fallback);
}

/**
 * Display name for a role. Default (system) roles have stable English names we
 * translate; custom roles keep the name the user entered.
 */
export function roleDisplayName(t: T, name: string, isSystemDefault: boolean): string {
  if (!isSystemDefault) return name;
  return tr(t, `roleName_${slug(name)}`, name);
}

/**
 * Translate a role label when only its name is known (no is_system_default
 * flag), e.g. the role column on the staff page. Recognises the built-in role
 * names (Owner, Super Admin, Manager, Chef, Waiter, Cashier, Courier) and the
 * legacy lowercase enum; custom role names are returned unchanged.
 */
export function roleDisplayLabel(t: T, name: string): string {
  if (!name) return name;
  return tr(t, `roleName_${slug(name)}`, name);
}

/** Display description for a role (translated for default roles, raw otherwise). */
export function roleDisplayDescription(t: T, name: string, description: string, isSystemDefault: boolean): string {
  if (!isSystemDefault) return description;
  return tr(t, `roleDesc_${slug(name)}`, description);
}
