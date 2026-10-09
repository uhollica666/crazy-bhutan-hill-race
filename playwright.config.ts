import { defineConfig, devices } from '@playwright/test';

// Uses the locally installed Chrome (channel "chrome"), so no browser download is needed.
// SwiftShader keeps WebGL working on machines/CI without a GPU.
const launchOptions = {
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 150_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    headless: true,
    launchOptions,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run build && bun run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !!process.env.REUSE_SERVER,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } }, testIgnore: /mobile.spec.ts/ },
    {
      name: 'mobile',
      // Pixel 7 emulation (touch, DPR, mobile UA) in landscape.
      use: { ...devices['Pixel 7 landscape'], channel: 'chrome', launchOptions },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
