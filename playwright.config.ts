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

/** True for `playwright test --project=cloud` (the emulator-backed online tests). */
const cloudRun = !!process.env.CLOUD_E2E || process.argv.some((a) => a.includes('project=cloud'));

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
  // Browser tests run against a build with every online feature OFF (.env.e2e): they must never reach the live Firebase
  // project. The separate "cloud" project (CLOUD_E2E=1, see `bun run test:e2e:cloud`) uses an emulator-only build.
  webServer: cloudRun
    ? [
        {
          command: 'bun run build:emulated && bun run preview:emulated',
          url: 'http://localhost:4174',
          reuseExistingServer: !!process.env.REUSE_SERVER,
          timeout: 180_000,
        },
      ]
    : [
        {
          command: 'bun run build:e2e && bun run preview',
          url: 'http://localhost:4173',
          reuseExistingServer: !!process.env.REUSE_SERVER,
          timeout: 180_000,
        },
      ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } }, testIgnore: [/mobile.spec.ts/, /cloud.spec.ts/] },
    {
      // Online features against the local Firebase emulators (never the live project).
      name: 'cloud',
      use: { viewport: { width: 1280, height: 720 }, baseURL: 'http://localhost:4174' },
      testMatch: /cloud.spec.ts/,
    },
    {
      name: 'mobile',
      // Pixel 7 emulation (touch, DPR, mobile UA) in landscape.
      use: { ...devices['Pixel 7 landscape'], channel: 'chrome', launchOptions },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
