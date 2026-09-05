import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  reporter: [['line']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'VITE_API_BASE=/api npm run build && VITE_API_BASE=/api npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
  globalTimeout: 15 * 60 * 1000,
  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Desktop Firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'iPad Safari',
      use: { ...devices['iPad Pro 11'] },
    },
    {
      name: 'Android Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
