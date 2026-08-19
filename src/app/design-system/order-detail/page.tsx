import { notFound } from 'next/navigation';
import { OrderDetailPreview } from './OrderDetailPreview';

export const metadata = { title: 'Order detail preview — Foody Admin' };

/** Dev-only, same gate as the design-system route above it. */
export default function OrderDetailPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <OrderDetailPreview />;
}
