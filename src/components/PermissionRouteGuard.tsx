'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/lib/permissions-context';
import { requiredPermissionsForPath } from '@/lib/route-permissions';
import { useI18n } from '@/lib/i18n';

/**
 * Blocks access to a feature section when the current user's per-restaurant
 * role lacks the required permission. Hidden nav links aren't enough — a user
 * could navigate directly by URL — so this renders an access-denied view
 * instead of the page. The server is still the source of truth for every
 * mutating action; this is the matching client-side experience.
 */
export default function PermissionRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const { hasAnyPermission, loading } = usePermissions();
  const { t } = useI18n();

  const required = requiredPermissionsForPath(pathname);
  if (required.length === 0) return <>{children}</>;

  // Decide only once the per-restaurant permissions have loaded.
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasAnyPermission(...required)) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-fg-primary">{t('accessDeniedTitle')}</h1>
        <p className="text-sm text-fg-secondary">{t('accessDeniedBody')}</p>
        <Link href={`/${params.restaurantId}/dashboard`} className="btn-primary">
          {t('backToDashboard')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
