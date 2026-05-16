'use client';
import { useParams } from 'next/navigation';

/**
 * Recipe Lab — AI-assisted recipe generation entry point.
 * This page scaffolds the shell layout; individual regions (input queue,
 * draft reviewer, food-cost target) are filled in by subsequent tasks.
 */
export default function RecipeLabPage() {
  const params = useParams<{ restaurantId: string }>();
  // restaurantId comes from the URL as a string; coerce to number where the API client needs it.
  const _restaurantIdStr = params.restaurantId;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Recipe Lab</h1>
        {/* FoodCostTargetSetting goes here in Task 9 */}
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-[var(--line)] overflow-y-auto p-4 space-y-6">
          <p className="text-sm text-[var(--fg-muted)]">
            Input and drafts queue will appear here (Task 4).
          </p>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-[var(--fg-muted)]">
            Select a draft from the queue to review.
          </p>
        </main>
      </div>
    </div>
  );
}
