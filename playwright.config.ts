import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 20000,
  expect: { timeout: 5000 },
  outputDir: '.local/reports/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.local/reports/playwright' }]],
  use: {
    baseURL: process.env.PIKA_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: process.env.PIKA_BASE_URL
    ? undefined
    : {
        command: 'node scripts/dev.mjs --port 5173 --no-live-reload',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
