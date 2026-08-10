// Article disponible ou non pour la commande manuelle. Extrait de la page
// pour être partagé avec la réhydratation de brouillon : la grille d'articles
// et le panier reconstruit doivent appliquer exactement le même prédicat, sous
// peine de se contredire sur ce qui est commandable.

import type { MenuItem } from '@/lib/api';
import { isEffectivelySoldOut } from '@/components/menu/AvailabilityPill';

// Whether an item can't currently be ordered — every size is sold out, or the
// item itself is force-sold-out / hidden. The order-time availability guard
// rejects such lines, so the picker greys the tile and blocks selection (the
// same behaviour the guest web app shows). Items with only SOME sizes sold out
// stay orderable here; the size picker disables the individual sold-out sizes.
export function isItemSoldOut(it: MenuItem): boolean {
  return isEffectivelySoldOut(it.availability_state, it.availability_override);
}
