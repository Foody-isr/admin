import { redirect } from 'next/navigation';

// Scheduled / batch pre-orders moved into the Online orders workspace. Keep this
// route as a redirect so existing bookmarks and links still land.
export default function ScheduledOrdersRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders/preorders`);
}
