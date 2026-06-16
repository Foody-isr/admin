'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getMyPermissions } from './api';

interface PermissionsContextType {
  permissions: string[];
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (...perms: string[]) => boolean;
  isOwner: boolean;
  roleName: string;
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  hasPermission: () => false,
  hasAnyPermission: () => false,
  isOwner: false,
  roleName: '',
  loading: true,
});

export function PermissionsProvider({
  restaurantId,
  children,
}: {
  restaurantId: number;
  children: ReactNode;
}) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleName, setRoleName] = useState('');
  const [loading, setLoading] = useState(true);

  // Per-restaurant ownership, resolved from this restaurant's role (server
  // returns "Owner"/"Super Admin"), NOT the global account role — a user can be
  // an owner in one restaurant and a cashier in another.
  const isOwner = roleName === 'Owner' || roleName === 'Super Admin';

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    getMyPermissions(restaurantId)
      .then((data) => {
        setPermissions(data.permissions ?? []);
        setRoleName(data.role_name ?? '');
      })
      .catch(() => {
        setPermissions([]);
        setRoleName('');
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const hasPermission = (perm: string) => {
    if (isOwner) return true;
    return permissions.includes(perm);
  };

  const hasAnyPermission = (...perms: string[]) => {
    if (isOwner) return true;
    return perms.some((p) => permissions.includes(p));
  };

  return (
    <PermissionsContext.Provider
      value={{ permissions, hasPermission, hasAnyPermission, isOwner, roleName, loading }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
