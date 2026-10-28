const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.cjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  retries: 0,
  timeout: 30000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8171',
    viewport: { width: 1920, height: 1080 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    { command: 'python3 -m http.server 8170 --bind 127.0.0.1 --directory launcher',
      url: 'http://127.0.0.1:8170', timeout: 10000, stderr: 'ignore' },
    { command: 'python3 -m http.server 8171 --bind 127.0.0.1 --directory dist/launcher',
      url: 'http://127.0.0.1:8171', timeout: 10000, stderr: 'ignore' }
  ]
});
