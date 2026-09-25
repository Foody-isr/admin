import { notFound } from 'next/navigation';
import OrdersPage from '../all/page';
import { parseOrderIdParam } from '@/lib/orders/routes';

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (parseOrderIdParam(orderId) == null) notFound();

  return <OrdersPage />;
}
