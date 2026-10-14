import OrdersWorkspace from '@/components/orders/OrdersWorkspace';

/** Keep the filtered list mounted while navigating between an order and the list. */
export default function OrdersListLayout({ children }: { children: React.ReactNode }) {
  return <><OrdersWorkspace />{children}</>;
}
