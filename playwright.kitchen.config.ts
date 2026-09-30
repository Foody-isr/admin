import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/kitchen',
  use: { baseURL: 'http://localhost:3017', locale: 'fr-FR', timezoneId: 'Asia/Jerusalem' },
  webServer: { command: 'npx next dev --port 3017', url: 'http://localhost:3017/login', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
