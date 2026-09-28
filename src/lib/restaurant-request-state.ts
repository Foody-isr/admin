export interface RestaurantRequestToken {
  restaurantId: number;
  sequence: number;
}

/**
 * Invalidates responses from an older request or restaurant before they can
 * update React state. Call enterRestaurant during render so a route change
 * invalidates the previous restaurant synchronously, before effects run.
 */
export class RestaurantRequestGuard {
  private restaurantId: number | null = null;
  private sequence = 0;

  enterRestaurant(restaurantId: number): void {
    if (this.restaurantId === restaurantId) return;
    this.restaurantId = restaurantId;
    this.sequence += 1;
  }

  begin(restaurantId: number): RestaurantRequestToken {
    this.enterRestaurant(restaurantId);
    this.sequence += 1;
    return { restaurantId, sequence: this.sequence };
  }

  isCurrent(token: RestaurantRequestToken): boolean {
    return token.restaurantId === this.restaurantId
      && token.sequence === this.sequence;
  }

  invalidate(): void {
    this.sequence += 1;
  }
}

export interface RestaurantLoadState<T> {
  restaurantId: number;
  status: 'loading' | 'ready' | 'error';
  data: T | null;
}

export function loadingRestaurantState<T>(restaurantId: number): RestaurantLoadState<T> {
  return { restaurantId, status: 'loading', data: null };
}

export function readyRestaurantState<T>(restaurantId: number, data: T): RestaurantLoadState<T> {
  return { restaurantId, status: 'ready', data };
}

export function failedRestaurantState<T>(
  restaurantId: number,
  data: T | null = null,
): RestaurantLoadState<T> {
  return { restaurantId, status: 'error', data };
}

/** Never exposes data loaded for a different restaurant. */
export function stateForRestaurant<T>(
  state: RestaurantLoadState<T>,
  restaurantId: number,
): RestaurantLoadState<T> {
  return state.restaurantId === restaurantId
    ? state
    : loadingRestaurantState<T>(restaurantId);
}
