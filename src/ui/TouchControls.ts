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
  private steerPointer: number | null = null;

  constructor(private readonly out: VehicleInput) {
    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.hidden = true;
    el.innerHTML = `
      <div class="steer-pad" data-role="steer" aria-label="Steering">
        <span class="arrow l">${ICONS.left}</span><span class="arrow r">${ICONS.right}</span>
        <div class="track"></div><div class="knob"></div>
      </div>
      <button class="pedal brake" data-role="brake" type="button" aria-label="Brake and reverse">BRAKE</button>
      <button class="pedal gas" data-role="gas" type="button" aria-label="Accelerate">GAS</button>`;
    this.pad = el.querySelector('.steer-pad') as HTMLElement;
    this.knob = el.querySelector('.knob') as HTMLElement;

    this.bindSteer();
    this.bindPedal(el.querySelector('[data-role=gas]') as HTMLElement, 'throttle');
    this.bindPedal(el.querySelector('[data-role=brake]') as HTMLElement, 'brake');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindSteer(): void {
    const update = (e: PointerEvent): void => {
      const r = this.pad.getBoundingClientRect();
      const half = (r.width - r.height) / 2; // usable travel for the knob centre
      const v = clamp((e.clientX - (r.left + r.width / 2)) / Math.max(1, half), -1, 1);
      this.out.steer = Math.abs(v) < 0.06 ? 0 : v;
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

  private bindPedal(btn: HTMLElement, key: 'throttle' | 'brake'): void {
    let id: number | null = null;
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

  /** Releases every control (call when the race stops). */
  reset(): void {
    this.out.steer = 0;
    this.out.throttle = 0;
    this.out.brake = 0;
    this.knob.style.transform = '';
    this.steerPointer = null;
    this.el.querySelectorAll('.pedal.on').forEach((n) => n.classList.remove('on'));
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
    if (!v) this.reset();
  }
}
