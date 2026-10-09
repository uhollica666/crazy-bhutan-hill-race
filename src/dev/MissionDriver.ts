import type { ServiceKind } from '../data/types';
import type { MissionRuntime } from '../gameplay/MissionRuntime';
import { STOP_RADIUS } from '../gameplay/Stops';
import type { VehicleInput } from '../physics/types';
import { AutoDriver } from './AutoDriver';
import type { DriveStyle } from './AutoDriver';

export interface MissionDriverOptions {
  cornerAccel?: number;
  style?: DriveStyle;
  /** Use the pit stop when fuel / condition call for it (default true). */
  useServices?: boolean;
}

/**
 * Autopilot for whole missions. It does what a player has to do: stops for each pickup, plans fuel and pulls into
 * a station when the tank will not make it, switches to 4x4 on slippery or steep ground, stops in the drop-off
 * zone, and steers around hazards. It goes through `MissionRuntime` like a human would, so it cannot bypass any
 * mission requirement.
 */
export class MissionDriver {
  readonly drive: AutoDriver;
  private serviceUntil: ServiceKind | null = null;
  private serviceAt: string | null = null;
  private readonly serviced = new Set<string>();
  private readonly useServices: boolean;

  constructor(
    private readonly rt: MissionRuntime,
    o: MissionDriverOptions = {},
  ) {
    this.drive = new AutoDriver(rt.course, rt.opts.vehicle, o.cornerAccel, o.style);
    this.useServices = o.useServices ?? true;
  }

  update(input: VehicleInput): void {
    const rt = this.rt;
    const s = rt.s;
    const status = rt.status;
    const def = rt.opts.vehicle;
    const level = rt.level;
    if (
      this.serviceUntil &&
      !rt.stops.active &&
      rt.stops.stops.some((st) => st.def.id === this.serviceAt && st.state === 'done')
    ) {
      this.serviced.add(`${this.serviceAt}:${this.serviceUntil}`);
      this.serviceUntil = null;
      this.serviceAt = null;
    }
    this.drive.stopAt = null;
    this.drive.hold = false;

    // --- Drivetrain: 4x4 on loose ground, steep climbs and wet roads, if the vehicle has it.
    if (def.drivetrain.modes.includes('4x4')) {
      const surface = rt.body.wheels.find((w) => w.inContact)?.surface;
      const loose = !!surface && (surface.grip < 0.8 || surface.rolling > 0.04);
      const wet = rt.weather.wetness > 0.5;
      const steep = Math.abs(rt.course.road.maxGrade()) > 0.2 && level.mission.kind === 'hillclimb';
      rt.setDriveMode(loose || wet || steep ? '4x4' : '4x2');
    }

    // --- Pickups first.
    const gate = rt.stops.gate;
    if (gate && (gate.state === 'active' || gate.s - s < STOP_RADIUS + 15)) {
      this.drive.stopAt = gate.s - 3;
      this.drive.hold = gate.state === 'active';
      return this.finish(input);
    }

    // --- Fuel and repair planning.
    if (this.useServices) {
      const remaining = Math.max(0, rt.course.finishS - s);
      const burn =
        (remaining / (def.fuel.rangeKm * 1000)) *
          (rt.body.driveMode === '4x4' ? def.fuel.fourByFourFactor : 1) *
          (level.surfaces?.some((seg) => seg.surface === 'mud' || seg.surface === 'rocky') ? 2.8 : 1.7) +
        0.06;
      const needFuel = status.fuel < burn;
      const needRepair = status.health < 45;
      const next = rt.stops.nextService(s);
      if (
        (needFuel || needRepair || this.serviceUntil) &&
        next &&
        next.s > s - STOP_RADIUS &&
        (!gate || next.s < gate.s)
      ) {
        const kind: ServiceKind = this.serviceUntil ?? (needFuel ? 'refuel' : 'repair');
        // The conservative estimate can exceed a tank on rough routes; do not loop at a completed pump.
        if (!this.serviced.has(`${next.def.id}:${kind}`)) {
          this.drive.stopAt = next.s - 2.5;
          const here = rt.stops.servicesHere(
            s,
            rt.lateral,
            Math.abs(rt.body.speed),
            rt.course.road.halfWidth,
          );
          if (here && here.kinds.includes(kind)) {
            this.drive.hold = true;
            this.serviceUntil = kind;
            this.serviceAt = next.def.id;
            if (!rt.stops.active) rt.serviceRequest = kind;
          }
          return this.finish(input);
        }
      }
    }

    if (gate) {
      this.drive.stopAt = gate.s - 3;
      this.drive.hold = gate.state === 'active';
      return this.finish(input);
    }

    // --- Drop-off: stop in the zone.
    if (level.mission.finishMode === 'stop' && rt.session.nextCheckpoint >= rt.session.totalCheckpoints) {
      this.drive.stopAt = rt.course.finishS + 1;
    }
    this.finish(input);
  }

  private finish(input: VehicleInput): void {
    this.drive.update(this.rt.body, input);
  }
}
