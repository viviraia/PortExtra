import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const preinstalled = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions,
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
  ],
});
