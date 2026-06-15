import { redirect } from 'next/navigation';

// Scheduled / batch pre-orders moved into the unified "Commandes & disponibilité"
// hub. Keep this route as a redirect so existing bookmarks and links still land.
export default function ScheduledOrdersRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders`);
}
