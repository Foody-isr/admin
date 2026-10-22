import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/redesign', testMatch: 'modifier-positions.spec.ts', workers: 1, reporter: 'list', timeout: 90000,
 outputDir: 'test-results/modifier-positions',
 use: { baseURL: 'http://localhost:3164', serviceWorkers: 'block', screenshot: 'only-on-failure', actionTimeout: 15000, viewport: { width: 1440, height: 1000 } },
 webServer: { command: 'npx next dev --port 3164', port: 3164, reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080' } },
});
