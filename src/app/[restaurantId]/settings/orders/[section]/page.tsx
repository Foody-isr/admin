import { notFound } from 'next/navigation';
import OrdersSettingsPage, { type OrdersSettingsView } from '../OrdersSettingsWorkspace';

const SECTIONS: OrdersSettingsView[] = ['availability', 'preorders', 'processing', 'workflow'];

export default function OrdersSectionPage({ params }: { params: { section: string } }) {
  if (!SECTIONS.includes(params.section as OrdersSettingsView)) notFound();
  return <OrdersSettingsPage view={params.section as OrdersSettingsView} />;
}
