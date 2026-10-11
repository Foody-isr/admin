import { redirect } from 'next/navigation';

/** Preserve legacy service-settings bookmarks. */
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
 const {restaurantId}=await params;
 redirect(`/${restaurantId}/settings/modes/default`);
}
