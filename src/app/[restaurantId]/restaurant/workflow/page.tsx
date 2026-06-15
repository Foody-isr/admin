import { redirect } from 'next/navigation';

// Order workflow / service rules moved into the unified "Commandes & disponibilité"
// hub. Keep this route as a redirect so existing bookmarks and links still land.
export default function WorkflowRedirect({
  params,
}: {
  params: { restaurantId: string };
}) {
  redirect(`/${params.restaurantId}/settings/orders`);
}
