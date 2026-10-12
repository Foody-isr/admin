import { defineConfig } from '@playwright/test';
import base from './playwright.redesign.config';

export default defineConfig({
  ...base,
  testMatch: ['whatsapp.spec.ts', 'order-whatsapp.spec.ts'],
  outputDir: 'test-results/whatsapp',
  use: { ...base.use, baseURL: 'http://localhost:3157' },
  webServer: {
    command: 'npx next dev --port 3157', port: 3157, reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:18080', NEXT_PUBLIC_META_APP_ID: 'synthetic-meta-app', NEXT_PUBLIC_WA_CONFIG_ID: 'synthetic-wa-config', NEXT_PUBLIC_TWILIO_SOLUTION_ID: 'synthetic-partner-solution' },
  },
});
