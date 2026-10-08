import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/redesign',
  testMatch: /item-(continuous|preparation)\.spec\.ts/,
  outputDir: 'test-results/item-preparation',
  webServer: [
    {
      command: 'node tests/redesign/item-preview-server.mjs',
      port: 18186,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx next dev --port 3116',
      port: 3116,
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18186' },
    },
  ],
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3116',
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
});
