import { clamp } from '../core/math';
import type { VehicleInput } from '../physics/types';
import { ICONS } from './icons';

/** Pointer capture keeps a drag alive outside the element; harmless if the browser refuses it. */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}

/**
 * On-screen controls: an analog steering slider on the left, brake and gas pedals on the right.
 * Every control tracks its own pointer id, so steering and pedals work simultaneously (multi-touch).
 */
export class TouchControls {
  readonly el: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly wheel: HTMLElement;
  private wheelPointer: number | null = null;
  private steerPointer: number | null = null;
  private sensitivity = 1;
  private readonly resetPedals: (() => void)[] = [];

  constructor(private readonly out: VehicleInput) {
    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.hidden = true;
    el.innerHTML = `
      <div class="steer-pad" data-role="steer" aria-label="Steering">
        <span class="arrow l">${ICONS.left}</span><span class="arrow r">${ICONS.right}</span>
        <div class="track"></div><div class="knob"></div>
      </div>
      <div class="steer-wheel" data-role="wheel" aria-label="Steering wheel" hidden>
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="rim"/><path class="spoke" d="M50 50 L12 58 M50 50 L88 58 M50 50 L50 90"/><circle cx="50" cy="50" r="9" class="hub"/><path class="mark" d="M50 8 L50 20"/></svg>
      </div>
      <button class="pedal brake" data-role="brake" type="button" aria-label="Brake and reverse"><span>BRAKE</span></button>
      <button class="pedal gas" data-role="gas" type="button" aria-label="Accelerate"><span>GAS</span></button>`;
    this.pad = el.querySelector('.steer-pad') as HTMLElement;
    this.knob = el.querySelector('.knob') as HTMLElement;
    this.wheel = el.querySelector('.steer-wheel') as HTMLElement;

    this.bindSteer();
    this.bindWheel();
    this.bindPedal(el.querySelector('[data-role=gas]') as HTMLElement, 'throttle');
    this.bindPedal(el.querySelector('[data-role=brake]') as HTMLElement, 'brake');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindSteer(): void {
    const update = (e: PointerEvent): void => {
      const r = this.pad.getBoundingClientRect();
      const half = (r.width - r.height) / 2; // usable travel for the knob centre
      const v = clamp((e.clientX - (r.left + r.width / 2)) / Math.max(1, half), -1, 1);
      // Gentle near the centre for fine corrections, full lock at the end of the bar; sensitivity scales the curve.
      this.out.steer =
        Math.abs(v) < 0.05 ? 0 : clamp(Math.sign(v) * Math.pow(Math.abs(v), 1.35) * this.sensitivity, -1, 1);
      this.knob.style.transform = `translateX(${v * half}px)`;
    };
    this.pad.addEventListener('pointerdown', (e) => {
      if (this.steerPointer !== null) return;
      this.steerPointer = e.pointerId;
      capture(this.pad, e.pointerId);
      update(e);
      e.preventDefault();
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.steerPointer) update(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.out.steer = 0;
      this.knob.style.transform = '';
    };
    this.pad.addEventListener('pointerup', end);
    this.pad.addEventListener('pointercancel', end);
    this.pad.addEventListener('lostpointercapture', end);
  }

  /** Steering wheel: drag around the hub; the wheel turns up to 120 degrees each way and springs back on release. */
  private bindWheel(): void {
    const MAX = (120 * Math.PI) / 180;
    const update = (e: PointerEvent): void => {
      const r = this.wheel.getBoundingClientRect();
      const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
      const v = clamp(a / MAX, -1, 1);
      this.out.steer =
        Math.abs(v) < 0.04 ? 0 : clamp(Math.sign(v) * Math.pow(Math.abs(v), 1.2) * this.sensitivity, -1, 1);
      this.wheel.style.transform = `rotate(${v * 120}deg)`;
    };
    this.wheel.addEventListener('pointerdown', (e) => {
      if (this.wheelPointer !== null) return;
      this.wheelPointer = e.pointerId;
      capture(this.wheel, e.pointerId);
      update(e);
      e.preventDefault();
    });
    this.wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.wheelPointer) update(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.wheelPointer) return;
      this.wheelPointer = null;
      this.out.steer = 0;
      this.wheel.style.transform = '';
    };
    this.wheel.addEventListener('pointerup', end);
    this.wheel.addEventListener('pointercancel', end);
    this.wheel.addEventListener('lostpointercapture', end);
  }

  /** Steering style, left-handed mirroring and size. */
  setLayout(steer: 'bar' | 'wheel', mirror: boolean, large: boolean): void {
    this.reset();
    this.pad.hidden = steer !== 'bar';
    this.wheel.hidden = steer !== 'wheel';
    this.el.classList.toggle('mirror', mirror);
    this.el.classList.toggle('large', large);
  }

  private bindPedal(btn: HTMLElement, key: 'throttle' | 'brake'): void {
    let id: number | null = null;
    this.resetPedals.push(() => {
      id = null;
    });
    btn.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      capture(btn, e.pointerId);
      btn.classList.add('on');
      this.out[key] = 1;
      e.preventDefault();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = null;
      btn.classList.remove('on');
      this.out[key] = 0;
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    // Keyboard users who focus a pedal can still use it with Space/Enter.
    btn.addEventListener('keydown', (e) => e.preventDefault());
  }

  setSensitivity(s: number): void {
    this.sensitivity = clamp(s, 0.5, 2);
  }

  /** Releases every control (call when the race stops). */
  reset(): void {
    for (const reset of this.resetPedals) reset();
    this.out.steer = 0;
    this.out.throttle = 0;
    this.out.brake = 0;
    this.knob.style.transform = '';
    this.steerPointer = null;
    this.wheel.style.transform = '';
    this.wheelPointer = null;
    this.el.querySelectorAll('.pedal.on').forEach((n) => n.classList.remove('on'));
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
    if (!v) this.reset();
  }
}
