import { defineConfig, devices } from "@playwright/test";

// Tailwind loads its TypeScript config through its own loader, including on Node 23+.
const nodeOptions = [
  process.env.NODE_OPTIONS,
  Number(process.versions.node.split(".")[0]) >= 23 ? "--no-experimental-strip-types" : "",
].filter(Boolean).join(" ");

// The fixture holds all draft/publication writes in memory.
export default defineConfig({
  testDir: "./tests/website-editor",
  testMatch: "footer-recovery.spec.ts",
  outputDir: "test-results/website-editor",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3003",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/redesign/website-editor-server.mjs",
      port: 18081,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "cd ../foodyweb && npx next dev --port 3000",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_OPTIONS: nodeOptions,
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:18081",
        NEXT_PUBLIC_ADMIN_ORIGIN: "http://localhost:3003",
      },
    },
    {
      command: process.env.FOODY_PREVIEW_PRODUCTION === "1"
        ? "npx next start --port 3003"
        : "npx next dev --port 3003",
      port: 3003,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_OPTIONS: nodeOptions,
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:18081",
        NEXT_PUBLIC_WEB_URL: "http://localhost:3000",
      },
    },
  ],
});
