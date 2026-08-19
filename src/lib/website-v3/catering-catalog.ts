import {
  ApiError,
  listCateringServices,
  type CateringService,
} from "../api";

type CateringServiceLoader = (
  restaurantId: number,
) => Promise<CateringService[]>;

/**
 * Loads the optional catering catalog without making Website V3 depend on the
 * restaurant's catering entitlement. Authorization and unexpected API errors
 * still fail the builder load normally.
 */
export async function loadOptionalCateringServices(
  restaurantId: number,
  load: CateringServiceLoader = listCateringServices,
): Promise<CateringService[]> {
  try {
    return await load(restaurantId);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 403 &&
      error.details === "upgrade_required"
    ) {
      return [];
    }
    throw error;
  }
}
