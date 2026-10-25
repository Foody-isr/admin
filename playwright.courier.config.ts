import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/redesign', testMatch: ['courier-workflow.spec.ts', 'delivery-planner.spec.ts'],
  outputDir: 'test-results/courier', workers: 1, timeout: 60_000, reporter: 'list',
  use: { baseURL: 'http://localhost:3187', locale: 'en-US', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', screenshot: 'only-on-failure' },
  webServer: { command: process.env.FOODY_PREVIEW_PRODUCTION === '1' ? 'npx next start --port 3187' : 'npx next dev --port 3187', port: 3187, reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080' } },
});
