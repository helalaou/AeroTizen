import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  outputDir: join(tmpdir(), "aerotizen-desktop-e2e"),
  timeout: 30_000,
  globalTimeout: 120_000,
  fullyParallel: true,
  use: { baseURL: "http://localhost:1420", browserName: "chromium", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-mvp-chromium", use: { viewport: { width: 1280, height: 800 } } },
    { name: "desktop-mvp-mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:1420", reuseExistingServer: !process.env.CI },
});
