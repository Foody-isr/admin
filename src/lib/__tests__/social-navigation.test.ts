import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isActiveSocialConnection,
  loadInstagramStoriesSettings,
  updateInstagramStoriesWithRefresh,
} from "../social-navigation";

test("Instagram navigation requires a connected and enabled connection", () => {
  assert.equal(isActiveSocialConnection(null), false);
  assert.equal(isActiveSocialConnection({ connected: false, enabled: true }), false);
  assert.equal(isActiveSocialConnection({ connected: true, enabled: false }), false);
  assert.equal(isActiveSocialConnection({ connected: true }), true);
  assert.equal(isActiveSocialConnection({ connected: true, enabled: true }), true);
});

test("Stories settings include the server-owned public navigation eligibility", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/v1/restaurants/24/social/instagram")) {
      return Response.json({ connected: true, enabled: true });
    }
    if (url.endsWith("/api/v1/restaurants/24/website-config")) {
      return Response.json({ website_config: { stories_enabled: true } });
    }
    if (url.endsWith("/api/v1/public/restaurants/24")) {
      return Response.json({
        restaurant: { stories_navigation_available: false },
      });
    }
    return new Response("not found", { status: 404 });
  };

  const settings = await loadInstagramStoriesSettings(24);
  assert.equal(settings.connected, true);
  assert.equal(settings.storiesEnabled, true);
  assert.equal(settings.storiesNavigationAvailable, false);
  assert.equal(
    calls.some((url) => url.endsWith("/api/v1/public/restaurants/24")),
    true,
  );
});

test("Stories settings still load when public navigation eligibility is unavailable", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/restaurants/24/social/instagram")) {
      return Response.json({ connected: true, enabled: true });
    }
    if (url.endsWith("/api/v1/restaurants/24/website-config")) {
      return Response.json({ website_config: { stories_enabled: true } });
    }
    if (url.endsWith("/api/v1/public/restaurants/24")) {
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    }
    return new Response("not found", { status: 404 });
  };

  const settings = await loadInstagramStoriesSettings(24);
  assert.equal(settings.connected, true);
  assert.equal(settings.storiesEnabled, true);
  assert.equal(settings.storiesNavigationAvailable, undefined);
});

test("successful Stories mutation keeps the requested value when refresh fails", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (
      url.endsWith("/api/v1/restaurants/24/website-config") &&
      init?.method === "PUT"
    ) {
      return Response.json({ website_config: { stories_enabled: true } });
    }
    if (url.endsWith("/api/v1/restaurants/24/social/instagram")) {
      return Response.json({ connected: true, enabled: true });
    }
    if (url.endsWith("/api/v1/restaurants/24/website-config")) {
      return Response.json({ website_config: { stories_enabled: false } });
    }
    if (url.endsWith("/api/v1/public/restaurants/24")) {
      return Response.json({ error: "refresh unavailable" }, { status: 503 });
    }
    return new Response("not found", { status: 404 });
  };

  const result = await updateInstagramStoriesWithRefresh(24, true);
  assert.equal(result.storiesEnabled, true);
  assert.equal(result.settings?.storiesNavigationAvailable, undefined);
  assert.ok(result.refreshError instanceof Error);
});
