import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/kitchen',
  outputDir: 'test-results/kitchen',
  workers: 1,
  timeout: 60_000,
  use: { locale: 'fr-FR', baseURL: 'http://localhost:3013', viewport: { width: 1440, height: 1050 }, timezoneId: 'Asia/Jerusalem' },
  webServer: { command: 'npx next dev --port 3013', port: 3013, reuseExistingServer: !process.env.CI, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080' } },
});
