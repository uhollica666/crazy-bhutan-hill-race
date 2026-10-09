import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface GameState {
  flow: string;
  phase: string | null;
  time: number;
  speed: number;
  checkpoints: number;
  position: [number, number, number];
  grounded: number;
  progress: number;
  fps: number;
  quality: string;
  stats: { calls: number; triangles: number };
}

export const state = (page: Page): Promise<GameState> =>
  page.evaluate(() => (window as unknown as { __cbhr: { state(): unknown } }).__cbhr.state() as never);

/** Opens the game with the debug API and collects console errors. */
export async function openGame(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?debug=1${query}`);
  await page.waitForFunction(() => !!(window as unknown as { __cbhr?: unknown }).__cbhr, undefined, {
    timeout: 60_000,
  });
  await expect(page.locator('#btn-start')).toBeVisible();
  return errors;
}

export async function waitForPhase(page: Page, phase: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await state(page)).phase, { timeout }).toBe(phase);
}
