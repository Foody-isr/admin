import RestaurantRedirect from '@/components/RestaurantRedirect';

/** Open the default analytics workspace with the existing query context. */
export default function AnalyticsRedirect() {
  return <RestaurantRedirect target="analytics/overview"/>;
}
