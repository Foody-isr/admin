import { notFound } from 'next/navigation';
import OrdersSettingsPage, { type OrdersSettingsView } from '../OrdersSettingsWorkspace';

const SECTIONS: OrdersSettingsView[] = ['availability', 'preorders', 'processing', 'workflow'];

export default async function OrdersSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.includes(section as OrdersSettingsView)) notFound();
  return <OrdersSettingsPage view={section as OrdersSettingsView} />;
}
