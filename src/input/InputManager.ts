import { Emitter } from '../core/emitter';
import { clamp } from '../core/math';
import { createVehicleInput } from '../physics/types';
import type { VehicleInput } from '../physics/types';
import { GAME_KEYS, KEYS, readKeyboard } from './keyboardMap';

type InputEvents = {
  pause: undefined;
  recover: undefined;
  restart: undefined;
  debug: undefined;
  /** Toggle 4x2 / 4x4 (F, pad X). */
  driveMode: undefined;
  /** Switch between the chase camera and the driver's-eye view (C, pad Back/Select). */
  camera: undefined;
  /** Ask for the pit-stop service on offer: refuel or repair (E, pad LB/RB). */
  service: undefined;
  /** Any real key press / pointer down - used to unlock audio. */
  gesture: undefined;
};

const DEADZONE = 0.14;
const deadzone = (v: number): number =>
  Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);

/** Merges keyboard, gamepad and on-screen touch controls into a single driving command. */
export class InputManager {
  readonly events = new Emitter<InputEvents>();
  readonly pressed = new Set<string>();
  /** Written by TouchControls. */
  readonly touch: VehicleInput = createVehicleInput();
  /** Set by the app: true while a race is on and the page should swallow driving keys. */
  captureKeys = false;
  /** Fires true the first time a keyboard driving key is used (lets the UI hide touch controls). */
  onKeyboardUsed: (() => void) | null = null;

  private readonly kb = createVehicleInput();
  private padButtons: boolean[] = [];

  constructor(private readonly win: Window) {
    win.addEventListener('keydown', this.onKeyDown);
    win.addEventListener('keyup', this.onKeyUp);
    win.addEventListener('blur', this.clear);
    win.addEventListener('pointerdown', this.onPointer, { passive: true });
  }

  dispose(): void {
    this.win.removeEventListener('keydown', this.onKeyDown);
    this.win.removeEventListener('keyup', this.onKeyUp);
    this.win.removeEventListener('blur', this.clear);
    this.win.removeEventListener('pointerdown', this.onPointer);
  }

  private readonly clear = (): void => {
    this.pressed.clear();
  };

  private readonly onPointer = (): void => {
    this.events.emit('gesture', undefined);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.events.emit('gesture', undefined);
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (this.captureKeys && GAME_KEYS.has(e.code) && !typing) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (GAME_KEYS.has(e.code) && e.code !== 'Space') this.onKeyboardUsed?.();
    this.pressed.add(e.code);
    if (e.repeat || typing) return;
    if ((KEYS.pause as readonly string[]).includes(e.code)) this.events.emit('pause', undefined);
    else if (e.code === 'KeyR') this.events.emit(e.shiftKey ? 'restart' : 'recover', undefined);
    else if (e.code === 'KeyF') this.events.emit('driveMode', undefined);
    else if (e.code === 'KeyC') this.events.emit('camera', undefined);
    else if (e.code === 'KeyE') this.events.emit('service', undefined);
    else if (e.code === 'Backquote') this.events.emit('debug', undefined);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private pollGamepad(): VehicleInput | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) return null;
    const btn = (i: number): number => pad.buttons[i]?.value ?? 0;
    const pressedNow = pad.buttons.map((b) => b.pressed);
    const edge = (i: number): boolean => !!pressedNow[i] && !this.padButtons[i];
    if (edge(9)) this.events.emit('pause', undefined);
    if (edge(3)) this.events.emit('recover', undefined);
    if (edge(2)) this.events.emit('driveMode', undefined);
    if (edge(8)) this.events.emit('camera', undefined);
    if (edge(4) || edge(5)) this.events.emit('service', undefined);
    this.padButtons = pressedNow;
    return {
      steer: deadzone(pad.axes[0] ?? 0) + (btn(15) - btn(14)),
      throttle: Math.max(btn(7), btn(0)),
      brake: Math.max(btn(6), btn(1)),
    };
  }

  /** Writes the combined command for this frame into `out`. */
  read(out: VehicleInput): void {
    readKeyboard(this.pressed, this.kb);
    const pad = this.pollGamepad();
    out.steer = clamp(this.kb.steer + this.touch.steer + (pad?.steer ?? 0), -1, 1);
    out.throttle = clamp(Math.max(this.kb.throttle, this.touch.throttle, pad?.throttle ?? 0), 0, 1);
    out.brake = clamp(Math.max(this.kb.brake, this.touch.brake, pad?.brake ?? 0), 0, 1);
  }
}
