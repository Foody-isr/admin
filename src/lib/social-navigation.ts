import {
  getSocialConnection,
  getWebsiteConfig,
  updateWebsiteConfig,
  type SocialConnection,
} from "@/lib/api";

export type InstagramStoriesSettings = {
  connection: SocialConnection;
  connected: boolean;
  storiesEnabled: boolean;
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
  const [connection, config] = await Promise.all([
    getSocialConnection(restaurantId, "instagram"),
    getWebsiteConfig(restaurantId),
  ]);
  return {
    connection,
    connected: isActiveSocialConnection(connection),
    storiesEnabled: config.stories_enabled === true,
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
