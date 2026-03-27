'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getLowStockCount, getPrepLowStockCount } from '@/lib/api';
import SubNav from '@/components/SubNav';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowPrepCount, setLowPrepCount] = useState(0);

  useEffect(() => {
    getLowStockCount(rid).then(setLowStockCount).catch(() => {});
    getPrepLowStockCount(rid).then(setLowPrepCount).catch(() => {});
  }, [rid]);

  const base = `/${restaurantId}/kitchen`;

  const items = [
    { href: `${base}/stock`, labelKey: 'stock', badge: lowStockCount },
    { href: `${base}/prep`, labelKey: 'recipesAndPrep', badge: lowPrepCount },
    { href: `${base}/food-cost`, labelKey: 'foodCost' },
  ];

  return <SubNav items={items}>{children}</SubNav>;
}
