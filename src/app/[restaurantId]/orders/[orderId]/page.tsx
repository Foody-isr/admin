import { notFound } from 'next/navigation';
import OrdersPage from '../all/page';
import { parseOrderIdParam } from '@/lib/orders/routes';

export default function OrderPage({ params }: { params: { orderId: string } }) {
  if (parseOrderIdParam(params.orderId) == null) notFound();

  return <OrdersPage />;
}
