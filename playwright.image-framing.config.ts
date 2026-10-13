import { defineConfig } from "@playwright/test";
import editor from "./playwright.website-editor.config";

/** Uses the isolated two-service restaurant fixture to exercise both modal covers. */
export default defineConfig({
  ...editor,
  testMatch: ["image-framing.spec.ts"],
  webServer: (Array.isArray(editor.webServer) ? editor.webServer : []).map(
    (server, index) =>
      index === 0
        ? { ...server, env: { ...server.env, FOODY_HEADER_CHOICES: "1" } }
        : server,
  ),
});
