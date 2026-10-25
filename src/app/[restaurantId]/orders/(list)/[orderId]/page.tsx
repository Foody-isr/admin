import { notFound } from 'next/navigation';
import { parseOrderIdParam } from '@/lib/orders/routes';

/** Validate direct order links before displaying the shared orders workspace. */
export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (parseOrderIdParam(orderId) == null) notFound();

  return null;
}
