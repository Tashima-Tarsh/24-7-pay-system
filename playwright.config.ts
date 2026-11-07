import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:6100',
    trace: 'on-first-retry',
    // Simulate a mobile device (iPhone 12) since UPI intents are mobile-first
    ...devices['iPhone 12'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['iPhone 12'],
        actionTimeout: 15000,
      },
    },
  ],
});
