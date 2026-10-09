import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface GameState {
  flow: string;
  menu: string;
  phase: string | null;
  time: number;
  speed: number;
  checkpoints: number;
  position: [number, number, number];
  grounded: number;
  progress: number;
  fps: number;
  cpuMs: number;
  quality: string;
  levelId: string;
  vehicleId: string;
  comfort: number | null;
  pixelRatio: number;
  stats: { calls: number; triangles: number; geometries: number; textures: number };
}

export const state = (page: Page): Promise<GameState> =>
  page.evaluate(() => (window as unknown as { __cbhr: { state(): unknown } }).__cbhr.state() as never);

export const NAMES: Record<string, string> = {
  'druk-ranger': 'Druk Ranger',
  'tourist-coaster': 'Tourist Coaster',
};

/** A v2 save document. `finished` lists levels that count as completed. */
export function makeSave(finished: string[] = [], extra: Record<string, unknown> = {}): string {
  const levels: Record<string, unknown> = {};
  for (const id of finished) {
    levels[id] = {
      completions: 1,
      medal: 'bronze',
      vehicles: {
        'druk-ranger': { bestTime: 130, bestScore: 40, bestComfort: null, medal: 'bronze', completions: 1 },
      },
    };
  }
  return JSON.stringify({
    version: 2,
    settings: {
      masterVolume: 0.8,
      musicVolume: 0,
      sfxVolume: 0.9,
      muted: true,
      quality: 'medium',
      touchControls: 'auto',
      touchSensitivity: 1,
    },
    progress: { levels },
    selection: { levelId: null, vehicleId: null },
    history: [],
    ...extra,
  });
}

/** Seeds localStorage before the game boots (only on the first navigation, so reloads keep real saves). */
export async function seedSave(page: Page, json: string): Promise<void> {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('cbhr.v2.save', s);
      sessionStorage.setItem('__seeded', '1');
    }
  }, json);
}

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
    timeout: 90_000,
  });
  await expect(page.locator('#btn-start')).toBeVisible();
  return errors;
}

export async function waitForPhase(page: Page, phase: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await state(page)).phase, { timeout }).toBe(phase);
}

/** Goes Drive -> mission card -> (optional vehicle) -> garage, without launching. */
export async function openGarage(page: Page, levelId: string, vehicleId?: string): Promise<void> {
  await page.locator('#btn-start').click();
  await expect(page.locator('#screen-levels')).toBeVisible();
  await page.locator(`button[data-level="${levelId}"]`).click();
  await expect(page.locator('#screen-garage')).toBeVisible({ timeout: 30_000 });
  if (vehicleId) {
    for (let i = 0; i < 4 && (await page.locator('#veh-name').textContent()) !== NAMES[vehicleId]; i++) {
      await page.locator('#btn-veh-next').click();
    }
    await expect(page.locator('#veh-name')).toHaveText(NAMES[vehicleId]);
    await expect.poll(async () => (await state(page)).vehicleId).toBe(vehicleId);
  }
}

/** Full UI path into a running mission. */
export async function startMission(page: Page, levelId: string, vehicleId?: string): Promise<void> {
  await openGarage(page, levelId, vehicleId);
  await page.locator('#btn-launch').click();
  await expect(page.locator('#hud')).toBeVisible();
  await waitForPhase(page, 'running', 30_000);
}

export const drive = (page: Page, on = true): Promise<void> =>
  page.evaluate(
    (v) => (window as unknown as { __cbhr: { autodrive(on: boolean): void } }).__cbhr.autodrive(v),
    on,
  );

export const warp = (page: Page, s: number): Promise<void> =>
  page.evaluate((v) => (window as unknown as { __cbhr: { warp(s: number): void } }).__cbhr.warp(v), s);

export const courseInfo = (
  page: Page,
): Promise<{ length: number; startS: number; finishS: number; checkpointS: number[] }> =>
  page.evaluate(() => (window as unknown as { __cbhr: { course(): never } }).__cbhr.course());
