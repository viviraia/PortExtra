import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use the sandbox's pre-installed Chromium when present (CI installs its own).
const preinstalled = '/opt/pw-browsers/chromium';
// Dedicated port so a dev's own `npm run preview` (4173) is never reused by mistake.
const PORT = 4180;
// Build into a private directory so concurrent `npm run build`s can't swap files under the server.
const OUT = 'node_modules/.e2e-dist';
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Headless WebGL is CPU-heavy; one worker keeps frame rates (and timing) stable.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run typecheck && npx vite build --outDir ${OUT} --emptyOutDir && npx vite preview --outDir ${OUT} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 }, launchOptions },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13 landscape'], browserName: 'chromium', launchOptions },
    },
  ],
});
