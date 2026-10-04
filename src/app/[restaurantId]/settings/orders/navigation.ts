import { CalendarDays, Clock3, ListChecks, Settings2, ShoppingBag } from 'lucide-react';

/** Shared destinations for the online ordering settings workspace. */
export function ordersSettingsNavigation(rid: number, t: (key: string) => string) {
  return [
    {
      id: 'overview',
      href: `/${rid}/settings/orders`,
      label: t('overview'),
      icon: ShoppingBag,
    },
    {
      id: 'availability',
      href: `/${rid}/settings/orders/availability`,
      label: t('ordersAvailabilityTitle'),
      icon: Clock3,
    },
    {
      id: 'preorders',
      href: `/${rid}/settings/orders/preorders`,
      label: t('preorderTitle'),
      icon: CalendarDays,
    },
    {
      id: 'processing',
      href: `/${rid}/settings/orders/processing`,
      label: t('ordersProcessingShort'),
      icon: Settings2,
    },
    {
      id: 'workflow',
      href: `/${rid}/settings/orders/workflow`,
      label: t('ordersWorkflowShort'),
      icon: ListChecks,
    },
  ];
}
