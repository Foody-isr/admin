import RestaurantRedirect from '@/components/RestaurantRedirect';

/** Open the default orders workspace with the existing query context. */
export default function OrdersRedirect() {
  return <RestaurantRedirect target="orders/all"/>;
}
