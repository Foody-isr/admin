import { redirect } from 'next/navigation';

// Opening hours moved into the unified "Commandes & disponibilité" hub.
// Keep this route as a redirect so existing bookmarks and links still land.
export default function OpeningHoursRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders`);
}
