import { defineConfig, devices } from '@playwright/test';

const apiURL = 'http://localhost:8080';
const databaseURL =
  process.env.WEBSITE_V3_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:55432/foody?sslmode=disable';

export default defineConfig({
  testDir: './tests/website-v3',
  globalSetup: './tests/website-v3/global-setup.ts',
  outputDir: 'test-results/website-v3',
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.mobile-preview\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-preview-chromium',
      testMatch: /.*\.mobile-preview\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'cd ../foodyserver && go run ./cmd/server',
      port: 8080,
      reuseExistingServer: true,
      env: {
        DATABASE_URL: databaseURL,
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
    },
    {
      command: 'cd ../foodyweb && npm run dev',
      port: 3000,
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_API_BASE_URL: apiURL,
        NEXT_PUBLIC_ADMIN_ORIGIN: 'http://localhost:3003',
      },
    },
    {
      command: 'npm run dev',
      port: 3003,
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_API_URL: apiURL,
        NEXT_PUBLIC_WEB_URL: 'http://localhost:3000',
      },
    },
  ],
});
