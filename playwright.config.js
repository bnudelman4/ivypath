/* Playwright config for the /shsat/quiz E2E suite (spec 8.2, 8.3).
   Run: npm run test:e2e
   The harness (tests/e2e/server.js) serves the repo on 127.0.0.1 and mounts
   api/quiz-lead.js against a local Resend stub. The tests block every request
   that leaves 127.0.0.1, so nothing reaches Google, Meta, the platform or
   Resend. This file is in .vercelignore and never served.

   All three projects run on Chromium. "iPhone 12" uses Playwright's iPhone 12
   descriptor (iOS user agent, touch, 3x) at the 390x844 screen size, but in
   Chromium rather than WebKit; the manual VoiceOver pass in 8.3 covers Safari. */
'use strict';

const os = require('os');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 4317);

module.exports = defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.js',
  // Outside the repo: nothing to gitignore, nothing Vercel could serve.
  outputDir: path.join(os.tmpdir(), 'ivypath-quiz-e2e-results'),
  timeout: 60000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'iphone-12',
      use: Object.assign({}, devices['iPhone 12'], {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 }
      })
    },
    {
      name: 'mobile-320',
      use: Object.assign({}, devices['iPhone SE'], {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 }
      })
    },
    {
      name: 'desktop-chrome',
      use: Object.assign({}, devices['Desktop Chrome'], {
        viewport: { width: 1280, height: 800 }
      })
    }
  ],
  webServer: {
    command: 'node tests/e2e/server.js',
    url: 'http://127.0.0.1:' + PORT + '/__e2e/health',
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
