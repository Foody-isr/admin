'use client';

import { useParams } from 'next/navigation';
import CourierItineraryView from '@/components/delivery/CourierItineraryView';

/** Lets order managers temporarily operate the courier workflow as themselves. */
export default function CourierModePage() {
  const { restaurantId } = useParams();

  return <CourierItineraryView rid={Number(restaurantId)} />;
}
