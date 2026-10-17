import { defineConfig } from '@playwright/test';
import base from './playwright.whatsapp.config';
export default defineConfig({ ...base, testMatch: ['order-workflow.spec.ts'], outputDir: 'test-results/workflow-whatsapp', reporter: [['list']], use: { ...base.use, baseURL: 'http://localhost:3158' }, webServer: { ...base.webServer, command: 'npx next dev --port 3158', port: 3158, reuseExistingServer: false } });
