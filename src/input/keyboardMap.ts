import type { VehicleInput } from '../physics/types';

export const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  pause: ['Escape', 'KeyP'],
  recover: ['KeyR'],
} as const;

/** Keys the page must not react to (scrolling, focus movement) while a race is on. */
export const GAME_KEYS: ReadonlySet<string> = new Set([
  ...KEYS.throttle,
  ...KEYS.brake,
  ...KEYS.left,
  ...KEYS.right,
  'Space',
]);

const any = (pressed: ReadonlySet<string>, codes: readonly string[]): boolean =>
  codes.some((c) => pressed.has(c));

/** Digital keyboard state -> driving command. Opposing keys cancel. */
export function readKeyboard(pressed: ReadonlySet<string>, out: VehicleInput): void {
  out.throttle = any(pressed, KEYS.throttle) ? 1 : 0;
  out.brake = any(pressed, KEYS.brake) ? 1 : 0;
  out.steer = (any(pressed, KEYS.right) ? 1 : 0) - (any(pressed, KEYS.left) ? 1 : 0);
}
