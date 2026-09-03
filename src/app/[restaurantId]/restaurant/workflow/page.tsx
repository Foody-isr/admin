import { redirect } from 'next/navigation';

// Order workflow moved into the Online orders workspace. Keep this route as a
// redirect so existing bookmarks and links still land.
export default function WorkflowRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders/workflow`);
}
