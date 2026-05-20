// Fiches Recettes — unified recipe library (articles ↔ preparations).
// The interactive feature lives in ./_fiches/RecipesFiches (client component);
// this route is a thin wrapper so the page can stay a server component.
import { Suspense } from 'react';
import RecipesFiches from './_fiches/RecipesFiches';

export default function RecipesPage() {
  // useSearchParams (inside RecipesFiches) requires a Suspense boundary in Next 14.
  return (
    <Suspense fallback={null}>
      <RecipesFiches />
    </Suspense>
  );
}
