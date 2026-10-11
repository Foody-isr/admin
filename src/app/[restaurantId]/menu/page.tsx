import RestaurantRedirect from '@/components/RestaurantRedirect';

/** Open the default menu workspace with the existing query context. */
export default function MenuRedirect() {
  return <RestaurantRedirect target="menu/items"/>;
}
