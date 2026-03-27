'use client';

import { useParams } from 'next/navigation';
import SubNav from '@/components/SubNav';

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const base = `/${restaurantId}/orders`;

  const items = [
    { href: `${base}/all`, labelKey: 'allOrders2' },
    { href: `${base}/settings`, labelKey: 'fulfillmentSettings' },
  ];

  return <SubNav items={items}>{children}</SubNav>;
}
