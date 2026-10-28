import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/redesign', testMatch: 'order-lifecycle.spec.ts', outputDir: 'test-results/order-lifecycle',
  workers: 1, timeout: 60_000, reporter: 'list',
  use: { baseURL: 'http://localhost:3143', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', screenshot: 'only-on-failure' },
  webServer: { command: 'npx next dev --port 3143', port: 3143, reuseExistingServer: false, timeout: 120_000, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18084' } },
});
