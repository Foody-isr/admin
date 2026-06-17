'use client';

import { useParams } from 'next/navigation';
import { usePermissions } from '@/lib/permissions-context';
import CourierItineraryView from '@/components/delivery/CourierItineraryView';
// DispatcherView is added in Task 7; until then this import + branch render the courier view.
import DispatcherView from '@/components/delivery/DispatcherView';

export default function DeliveriesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  return canManage ? <DispatcherView rid={rid} /> : <CourierItineraryView rid={rid} />;
}
