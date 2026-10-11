import RestaurantRedirect from '@/components/RestaurantRedirect';

/** Open the default kitchen workspace with the existing query context. */
export default function KitchenRedirect() {
  return <RestaurantRedirect target="kitchen/daily-operations"/>;
}
