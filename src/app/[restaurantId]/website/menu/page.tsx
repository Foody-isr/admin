import { redirect } from 'next/navigation';

export default function MenuTabIndex({ params }: { params: { restaurantId: string } }) {
  redirect(`/${params.restaurantId}/website/menu/themes`);
}
