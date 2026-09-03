import { redirect } from 'next/navigation';

// Opening hours moved into the Online orders workspace.
// Keep this route as a redirect so existing bookmarks and links still land.
export default function OpeningHoursRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders/availability`);
}
