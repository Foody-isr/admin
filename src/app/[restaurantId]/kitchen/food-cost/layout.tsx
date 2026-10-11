'use client';

import { usePathname } from 'next/navigation';
import { DesktopOnly } from '@/components/common/DesktopOnly';

/** Recipe analysis is responsive; the separate comparison workspace keeps its existing restriction. */
export default function FoodCostLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname.endsWith('/compare') ? <DesktopOnly>{children}</DesktopOnly> : <>{children}</>;
}
