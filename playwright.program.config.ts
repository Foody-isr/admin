import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/loyalty-program', outputDir: 'test-results/loyalty-program', workers: 1, timeout: 60_000,
  reporter: [['list']], use: { baseURL: 'http://localhost:3128', viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block', trace: 'off' },
  webServer: { command: 'npx next dev --port 3128', port: 3128, reuseExistingServer: false, timeout: 120_000, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080', NEXT_PUBLIC_LOYALTY_CHECKOUT_RESOLUTION_ENABLED: 'false' } },
});
