import { defineConfig } from '@playwright/test';
import base from './playwright.config';
// Independent output and port: packaging and the preserved campaign checkout cannot overwrite this test build.
export default defineConfig({
  ...base,
  timeout: 240_000,
  use: { ...base.use, baseURL: 'http://localhost:4190' },
  webServer: { command: 'bunx vite build --mode e2e --outDir dist-release-e2e && bunx vite preview --outDir dist-release-e2e --port 4190 --strictPort', url: 'http://localhost:4190', timeout: 180_000 },
});
