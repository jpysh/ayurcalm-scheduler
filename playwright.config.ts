import { defineConfig, devices } from '@playwright/test';

// Runs against a real install (`docker compose up -d`), seeded with the demo
// data, so a test passes only if the app, API and database work together.
export default defineConfig({
  testDir: './tests',
  reporter: [['line']],
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
