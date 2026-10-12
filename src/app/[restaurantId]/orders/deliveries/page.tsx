'use client';

import { useParams } from 'next/navigation';
import { usePermissions } from '@/lib/permissions-context';
import CourierItineraryView from '@/components/delivery/CourierItineraryView';
import DispatcherView from '@/components/delivery/DispatcherView';

/** Show the manager planner or the courier itinerary for the active restaurant. */
export default function DeliveriesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('orders.manage');
  return canManage ? <DispatcherView key={rid} rid={rid} /> : <CourierItineraryView key={rid} rid={rid} />;
}
