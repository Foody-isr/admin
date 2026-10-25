import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/redesign',
  testMatch: 'ordering-test-access.spec.ts',
  outputDir: 'test-results/test-access',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3117', timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block', screenshot: 'only-on-failure' },
  webServer: { command: 'npx next start --port 3117 --hostname 127.0.0.1', port: 3117, reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080' } },
});
