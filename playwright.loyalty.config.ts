import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/loyalty', testMatch: process.env.FOODY_LOYALTY_PREVIEW_ENABLED === '0' ? 'disabled.spec.ts' : 'checkouts.spec.ts', outputDir: 'test-results/loyalty', workers: 1, timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/loyalty/results.json' }]],
  use: { baseURL: 'http://localhost:3127', viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'off' },
  webServer: { command: 'npx next dev --port 3127', port: 3127, reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080', NEXT_PUBLIC_LOYALTY_CHECKOUT_RESOLUTION_ENABLED: process.env.FOODY_LOYALTY_PREVIEW_ENABLED === '0' ? 'false' : 'true' } },
});
