import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/redesign',
  outputDir:'test-results/redesign',
  workers:1,
  timeout:90_000,
  reporter:[['list'],['json',{outputFile:'test-results/redesign/results.json'}]],
  use:{actionTimeout:15_000,screenshot:'only-on-failure',trace:'retain-on-failure',baseURL:'http://localhost:3103',locale:'en-US',timezoneId:'Asia/Jerusalem',viewport:{width:1440,height:1000},serviceWorkers:'block'},
  webServer:{command:process.env.FOODY_PREVIEW_PRODUCTION==='1'?'npx next start --port 3103':'npx next dev --port 3103',port:3103,reuseExistingServer:!process.env.CI,env:{NEXT_PUBLIC_API_URL:'http://127.0.0.1:18080',NEXT_PUBLIC_META_APP_ID:'synthetic-meta-app',NEXT_PUBLIC_WA_CONFIG_ID:'synthetic-wa-config',NEXT_PUBLIC_TWILIO_SOLUTION_ID:'synthetic-partner-solution'}},
});
