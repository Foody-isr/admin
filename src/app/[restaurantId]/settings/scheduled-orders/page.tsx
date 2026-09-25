import { redirect } from 'next/navigation';

// Scheduled / batch pre-orders moved into the Online orders workspace. Keep this
// route as a redirect so existing bookmarks and links still land.
export default async function ScheduledOrdersRedirect({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  redirect(`/${restaurantId}/settings/orders/preorders`);
}
