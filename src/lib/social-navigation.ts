import {
  getSocialConnection,
  getPublicRestaurantNavigationState,
  getWebsiteConfig,
  updateWebsiteConfig,
  type SocialConnection,
} from "@/lib/api";

export type InstagramStoriesSettings = {
  connection: SocialConnection;
  connected: boolean;
  storiesEnabled: boolean;
  storiesNavigationAvailable: boolean | undefined;
};

export type InstagramStoriesUpdateResult = {
  storiesEnabled: boolean;
  settings: InstagramStoriesSettings | null;
  refreshError: Error | null;
};

/** Reports whether a social connection is both connected and operationally enabled. */
export function isActiveSocialConnection(
  connection: Pick<SocialConnection, "connected" | "enabled"> | null,
): boolean {
  return connection?.connected === true && connection.enabled !== false;
}

/** Loads the single live owner for Instagram status and Stories visibility. */
export async function loadInstagramStoriesSettings(
  restaurantId: number,
): Promise<InstagramStoriesSettings> {
  const [connection, config, navigation] = await Promise.all([
    getSocialConnection(restaurantId, "instagram"),
    getWebsiteConfig(restaurantId),
    getPublicRestaurantNavigationState(restaurantId),
  ]);
  return {
    connection,
    connected: isActiveSocialConnection(connection),
    storiesEnabled: config.stories_enabled === true,
    storiesNavigationAvailable: navigation.storiesNavigationAvailable,
  };
}

/** Updates Stories directly on the live website configuration. */
export async function updateInstagramStoriesEnabled(
  restaurantId: number,
  enabled: boolean,
): Promise<boolean> {
  const config = await updateWebsiteConfig(restaurantId, {
    stories_enabled: enabled,
  });
  return config.stories_enabled === true;
}

/** Commits Stories first, then refreshes derived public eligibility best-effort. */
export async function updateInstagramStoriesWithRefresh(
  restaurantId: number,
  enabled: boolean,
): Promise<InstagramStoriesUpdateResult> {
  await updateInstagramStoriesEnabled(restaurantId, enabled);
  try {
    const settings = await loadInstagramStoriesSettings(restaurantId);
    if (settings.storiesNavigationAvailable === undefined) {
      return {
        storiesEnabled: enabled,
        settings,
        refreshError: new Error("public Stories eligibility is unavailable"),
      };
    }
    return {
      storiesEnabled: settings.storiesEnabled,
      settings,
      refreshError: null,
    };
  } catch (error) {
    return {
      storiesEnabled: enabled,
      settings: null,
      refreshError:
        error instanceof Error ? error : new Error(String(error)),
    };
  }
}
