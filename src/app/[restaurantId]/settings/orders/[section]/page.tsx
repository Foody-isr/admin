import { notFound, redirect } from 'next/navigation';
import OrdersSettingsPage, { type OrdersSettingsView } from '../OrdersSettingsWorkspace';

const SECTIONS: OrdersSettingsView[] = ['availability', 'preorders', 'processing', 'workflow'];

export default async function OrdersSectionPage({ params }: { params: Promise<{ restaurantId: string; section: string }> }) {
  const { section, restaurantId } = await params;
  if (section === 'preorders') redirect(`/${restaurantId}/settings/orders`);
  if (!SECTIONS.includes(section as OrdersSettingsView)) notFound();
  return <OrdersSettingsPage view={section as OrdersSettingsView} />;
}
