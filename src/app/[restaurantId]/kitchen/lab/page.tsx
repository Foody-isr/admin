'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { DraftInputRail } from './components/DraftInputRail';
import { DraftQueue } from './components/DraftQueue';
import { useDraftQueue } from './hooks/useDraftQueue';

/**
 * Recipe Lab — AI-assisted recipe generation entry point.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Header: Recipe Lab title                                  │
 *   ├──────────┬───────────────────────────────────────────────┤
 *   │ Left     │ Main (draft reviewer — Task 5+)               │
 *   │ aside    │                                               │
 *   │ Input    │                                               │
 *   │ rail     │                                               │
 *   │ ──────── │                                               │
 *   │ Drafts   │                                               │
 *   │ queue    │                                               │
 *   └──────────┴───────────────────────────────────────────────┘
 */
export default function RecipeLabPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = parseInt(params.restaurantId, 10);

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  // Pull refetch out of the hook so DraftInputRail can trigger an explicit
  // refetch after generating. The queue also polls every 3 s while any draft
  // is generating, so this is just for faster initial feedback.
  // TODO: explicit refetch after generate for faster feedback (#github-issue).
  const { refetch } = useDraftQueue(restaurantId);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Recipe Lab</h1>
        {/* FoodCostTargetSetting goes here in Task 9 */}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left aside: input + drafts queue */}
        <aside className="w-80 border-r border-[var(--line)] overflow-y-auto p-4 space-y-6">
          <DraftInputRail
            restaurantId={restaurantId}
            onAfterGenerate={refetch}
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
              Drafts
            </p>
            <DraftQueue
              restaurantId={restaurantId}
              activeDraftId={activeDraftId}
              onSelect={setActiveDraftId}
            />
          </div>
        </aside>

        {/* Main: draft reviewer (Task 5+) */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeDraftId == null ? (
            <p className="text-sm text-[var(--fg-muted)]">
              Select a draft from the queue to review.
            </p>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              Draft #{activeDraftId} selected — reviewer coming in Task 5.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
