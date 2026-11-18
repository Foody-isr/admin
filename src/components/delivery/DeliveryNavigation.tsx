'use client';

import Link from 'next/link';
import { Check, ChevronDown, Map, MapPinned, Route, Truck } from 'lucide-react';
import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds';
import type { FoodyModuleAccess } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { deliveryDestinations } from '@/lib/delivery-navigation';
import { usePermissions } from '@/lib/permissions-context';

const icons = { deliveryNavDispatch: Route, courierMode: Truck, deliveryNavZones: MapPinned, deliveryNavMaps: Map } as const;

/** Moves staff between the delivery workspaces available to their restaurant and role. */
export function DeliveryNavigation({ rid, pathname, access }: { rid: number; pathname: string; access?: FoodyModuleAccess }) {
  const { t, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const destinations = deliveryDestinations(rid, access, hasAnyPermission).map(page => ({ ...page, icon: icons[page.label] }));
  const current = destinations.find(page => pathname === `/${rid}${page.path}`);
  if (!current || destinations.length < 2) return null;
  return (
    <nav aria-label={t('deliveryNavLabel')} className="mb-4 min-w-0 shrink-0 border-b border-[var(--line)]">
      <div className="hidden flex-wrap gap-x-4 xl:flex">
        {destinations.map(({ path, label, icon: Icon }) => (
          <Link key={path} href={`/${rid}${path}`} aria-current={current.path === path ? 'page' : undefined}
            className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-1 text-fs-sm text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-2 aria-[current=page]:border-[var(--info-500)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--fg)]">
            <Icon className="size-4" aria-hidden />{t(label)}
          </Link>
        ))}
      </div>
      <div className="flex items-center xl:hidden">
        <Menu dir={direction}>
          <MenuTrigger asChild>
            <Button variant="ghost" aria-label={t('deliveryNavLabel')} className="min-h-11">
              <current.icon aria-hidden />{t(current.label)}<ChevronDown aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            {destinations.map(({ path, label, icon: Icon }) => (
              <MenuItem key={path} asChild>
                <Link href={`/${rid}${path}`} aria-current={current.path === path ? 'page' : undefined}>
                  <Icon aria-hidden />{t(label)}{current.path === path && <Check className="ms-auto" aria-hidden />}
                </Link>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </nav>
  );
}
