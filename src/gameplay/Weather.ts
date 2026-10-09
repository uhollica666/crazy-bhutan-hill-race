import type { ConditionsDef, TimeOfDay, WeatherKind } from '../data/types';
import { TIME, WEATHER, weatherGripFactor } from '../data/weather';
import type { TimePreset, WeatherPreset } from '../data/weather';
import { Emitter } from '../core/emitter';
import { mulberry32 } from '../core/math';

type WeatherEvents = {
  /** Thunder strike: `delay` seconds after the flash. */
  thunder: { flash: number };
};

/**
 * Current conditions for a mission: weather + time of day, plus the derived numbers gameplay needs
 * (road wetness, grip factor, visibility, wind). Pure data and a clock; rendering and audio read from it.
 */
export class WeatherState {
  readonly events = new Emitter<WeatherEvents>();
  weather: WeatherKind = 'clear';
  time: TimeOfDay = 'day';
  /** 0..1 how wet the roads are. Eases toward the preset, so conditions can change during a run. */
  wetness = 0;
  /** 0..1 rain intensity actually falling. */
  rain = 0;
  private clock = 0;
  private nextThunder = 12;
  private rng: () => number;
  /** Fixed wind direction (radians) per mission, so gusts are consistent. */
  readonly windAngle: number;

  constructor(private readonly seed = 1) {
    this.rng = mulberry32(seed * 977 + 13);
    this.windAngle = this.rng() * Math.PI * 2;
  }

  get preset(): WeatherPreset {
    return WEATHER[this.weather];
  }
  get timePreset(): TimePreset {
    return TIME[this.time];
  }

  /** Jump straight to a condition set (mission start). */
  set(c: Pick<ConditionsDef, 'weather' | 'time'>): void {
    this.rng = mulberry32(this.seed * 977 + 13);
    this.rng(); // The first sample is reserved for wind direction.
    this.weather = c.weather;
    this.time = c.time;
    this.wetness = this.preset.wetness;
    this.rain = this.preset.rain;
    this.clock = 0;
    this.nextThunder = 8 + this.rng() * 10;
  }

  /** Change the weather mid-run (a front rolls in): wetness and rain ease toward the new preset. */
  transitionTo(w: WeatherKind): void {
    this.weather = w;
  }

  update(dt: number): void {
    this.clock += dt;
    const p = this.preset;
    // Roads dry slowly and soak quickly.
    const k = p.wetness > this.wetness ? 0.25 : 0.04;
    this.wetness += (p.wetness - this.wetness) * (1 - Math.exp(-k * dt));
    this.rain += (p.rain - this.rain) * (1 - Math.exp(-0.6 * dt));
    if (p.thunder && this.clock >= this.nextThunder) {
      this.nextThunder = this.clock + 9 + this.rng() * 14;
      this.events.emit('thunder', { flash: 0.4 + this.rng() * 0.5 });
    }
  }

  /** Overall grip multiplier from the weather itself (surfaces handle wet asphalt / mud separately). */
  get gripFactor(): number {
    return weatherGripFactor(this.weather);
  }

  /** Fog distance multiplier (smaller = thicker). */
  get visibility(): number {
    return this.preset.visibility;
  }

  /** Gust acceleration (m/s^2) in world X and Z at the current time. */
  gust(out: { x: number; z: number }): void {
    const base = this.preset.wind;
    const g = base * (0.55 + 0.45 * Math.sin(this.clock * 0.7) * Math.sin(this.clock * 0.23 + 1.3));
    out.x = Math.cos(this.windAngle) * g;
    out.z = Math.sin(this.windAngle) * g;
  }
}
