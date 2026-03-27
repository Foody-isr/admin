'use client';

import { useParams } from 'next/navigation';
import SubNav from '@/components/SubNav';

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  const { restaurantId } = useParams();
  const base = `/${restaurantId}/menu`;

  const items = [
    { href: `${base}/items`, labelKey: 'itemLibrary' },
    { href: `${base}/categories`, labelKey: 'categories' },
    { href: `${base}/modifiers`, labelKey: 'modifiers' },
    { href: `${base}/import`, labelKey: 'aiImport' },
  ];

  return <SubNav items={items}>{children}</SubNav>;
}
