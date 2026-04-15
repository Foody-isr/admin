'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Phase 2 redirect: the Recipe detail page has been absorbed into the
// Menu Item edit page as the "Recipe" tab. Existing bookmarks / email links
// pointing here are forwarded automatically.
export default function RecipeDetailRedirect() {
  const { restaurantId, menuItemId } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${restaurantId}/menu/items/${menuItemId}?tab=recipe`);
  }, [router, restaurantId, menuItemId]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  );
}
