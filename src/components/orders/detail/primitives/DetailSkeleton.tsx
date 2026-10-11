'use client';

import { Skeleton } from '@/components/ds';

/** Placeholder matching the drawer's title, facts and item rows. */
export function DetailSkeleton() {
  return <div className="px-8 py-6 flex flex-col gap-6 overflow-hidden" aria-busy="true">
    <Skeleton className="h-8 w-52" /><Skeleton className="h-6 w-32 rounded-full" />
    <Skeleton className="h-6 w-36 mt-6" />
    {[0, 1, 2, 3, 4].map(i => <div key={i} className="flex justify-between border-b border-[var(--line)] pb-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-36" /></div>)}
    <Skeleton className="h-6 w-36 mt-6" />
    {[0, 1, 2].map(i => <div key={i} className="flex gap-3"><Skeleton className="size-10 rounded" /><Skeleton className="h-5 flex-1" /></div>)}
  </div>;
}
