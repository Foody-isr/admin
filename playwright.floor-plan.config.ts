import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/redesign', testMatch:'floor-plan-editor.spec.ts',
  outputDir:'test-results/floor-plan', workers:1, timeout:60_000, reporter:'list',
  use:{ baseURL:'http://localhost:3104', viewport:{width:1440,height:900}, screenshot:'only-on-failure', trace:'retain-on-failure', locale:'fr-FR', serviceWorkers:'block' },
  webServer:{ command:'npx next dev --port 3104', port:3104, reuseExistingServer:!process.env.CI, env:{NEXT_PUBLIC_API_URL:'http://127.0.0.1:18080'} },
});
