import { defineConfig } from '@playwright/test';

// A real browser session with short presentation pauses between verified states.
export default defineConfig({
  testDir: './browser',
  testMatch: 'demo.spec.js',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'demo-results',
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1100, height: 900 },
    colorScheme: 'light',
    video: { mode: 'on', size: { width: 1100, height: 900 } },
  },
});
