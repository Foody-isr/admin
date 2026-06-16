'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/lib/permissions-context';

/**
 * Renders its children only when the current user holds ANY of the given
 * permissions in the current restaurant. Owners/superadmins always pass
 * (their permission set is complete). Use this to hide mutating actions
 * (Add / Edit / Delete) from view-only roles, e.g.:
 *
 *   <PermissionGate anyOf={['menu.edit']}>
 *     <button>Add item</button>
 *   </PermissionGate>
 */
export default function PermissionGate({
  anyOf,
  fallback = null,
  children,
}: {
  anyOf: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { hasAnyPermission } = usePermissions();
  if (!hasAnyPermission(...anyOf)) return <>{fallback}</>;
  return <>{children}</>;
}
