import type { UpgradeId, VehicleDef } from './types';

export interface UpgradeLevel {
  cost: number;
  /** Human text of what this level does, shown in the garage next to the real stat change. */
  effect: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Why it matters, in one line. */
  blurb: string;
  levels: UpgradeLevel[];
}

/** Every upgrade has a real, applied effect: see `applyUpgrades`. Nothing here is cosmetic. */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  engine: {
    id: 'engine',
    name: 'Engine tune',
    blurb: 'More pull on hills and out of hairpins.',
    levels: [
      { cost: 180, effect: '+9% engine force, +3% top speed' },
      { cost: 360, effect: '+18% engine force, +6% top speed' },
      { cost: 620, effect: '+28% engine force, +9% top speed' },
    ],
  },
  tires: {
    id: 'tires',
    name: 'Tyres',
    blurb: 'More grip everywhere, and much better on mud, gravel and rock.',
    levels: [
      { cost: 150, effect: '+4% grip, +15% loose-surface capability' },
      { cost: 300, effect: '+8% grip, +30% loose-surface capability' },
      { cost: 520, effect: '+12% grip, +45% loose-surface capability' },
    ],
  },
  suspension: {
    id: 'suspension',
    name: 'Suspension',
    blurb: 'Better damping and travel: less bounce and body roll, fewer jolts.',
    levels: [
      { cost: 140, effect: '+10% damping, more anti-roll, +5% travel' },
      { cost: 280, effect: '+20% damping, more anti-roll, +10% travel' },
      { cost: 480, effect: '+30% damping, more anti-roll, +15% travel' },
    ],
  },
  brakes: {
    id: 'brakes',
    name: 'Brakes',
    blurb: 'Shorter stopping distances.',
    levels: [
      { cost: 120, effect: '+10% braking force' },
      { cost: 240, effect: '+20% braking force' },
      { cost: 420, effect: '+30% braking force' },
    ],
  },
  tank: {
    id: 'tank',
    name: 'Fuel tank',
    blurb: 'Go further before the next fuel stop.',
    levels: [
      { cost: 100, effect: '+12% range' },
      { cost: 200, effect: '+24% range' },
      { cost: 360, effect: '+36% range' },
    ],
  },
  efficiency: {
    id: 'efficiency',
    name: 'Fuel economy',
    blurb: 'Burn less fuel for the same driving.',
    levels: [
      { cost: 130, effect: '-7% fuel use' },
      { cost: 260, effect: '-14% fuel use' },
      { cost: 460, effect: '-21% fuel use' },
    ],
  },
  armor: {
    id: 'armor',
    name: 'Underbody and bumpers',
    blurb: 'Soaks up knocks and scrapes: damage is reduced and condition lasts longer.',
    levels: [
      { cost: 140, effect: '-8% damage taken, +10% health' },
      { cost: 280, effect: '-16% damage taken, +20% health' },
      { cost: 480, effect: '-24% damage taken, +30% health' },
    ],
  },
};

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export const MAX_UPGRADE_LEVEL = 3;

export const listUpgrades = (): UpgradeDef[] => Object.values(UPGRADES);

/** Next level's price, or null when maxed out / not compatible. */
export function nextUpgradeCost(vehicle: Pick<VehicleDef, 'upgrades'>, levels: UpgradeLevels, id: UpgradeId): number | null {
  if (!vehicle.upgrades.includes(id)) return null;
  const lvl = levels[id] ?? 0;
  return lvl >= MAX_UPGRADE_LEVEL ? null : UPGRADES[id].levels[lvl].cost;
}

const cache = new Map<string, VehicleDef>();

/**
 * Returns the vehicle definition with upgrades baked in. This is the ONLY place upgrade numbers are applied,
 * and the physics, fuel, damage and UI all read the result, so an upgrade can never exist without an effect.
 */
export function applyUpgrades(base: VehicleDef, levels: UpgradeLevels): VehicleDef {
  const key = `${base.id}|${(base.upgrades as string[]).map((u) => `${u}${levels[u as UpgradeId] ?? 0}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lv = (id: UpgradeId): number => (base.upgrades.includes(id) ? Math.min(MAX_UPGRADE_LEVEL, levels[id] ?? 0) : 0);
  const e = lv('engine');
  const t = lv('tires');
  const s = lv('suspension');
  const b = lv('brakes');
  const k = lv('tank');
  const f = lv('efficiency');
  const a = lv('armor');
  const out: VehicleDef = {
    ...base,
    engine: {
      ...base.engine,
      force: base.engine.force * (1 + 0.09 * e),
      reverseForce: base.engine.reverseForce * (1 + 0.09 * e),
      topSpeed: base.engine.topSpeed * (1 + 0.03 * e),
      gearTopSpeeds: base.engine.gearTopSpeeds.map((g) => g * (1 + 0.03 * e)),
      brakeForce: base.engine.brakeForce * (1 + 0.1 * b),
    },
    grip: {
      ...base.grip,
      longitudinal: base.grip.longitudinal * (1 + 0.04 * t),
      lateral: base.grip.lateral * (1 + 0.04 * t),
    },
    offroad: Math.min(1, base.offroad * (1 + 0.15 * t)),
    suspension: {
      ...base.suspension,
      damping: base.suspension.damping * (1 + 0.1 * s),
      antiRoll: base.suspension.antiRoll * (1 + 0.12 * s),
      travel: base.suspension.travel * (1 + 0.05 * s),
      rest: base.suspension.rest * (1 + 0.05 * s),
    },
    fuel: { ...base.fuel, rangeKm: base.fuel.rangeKm * (1 + 0.12 * k) * (1 / (1 - 0.07 * f)) },
    durability: {
      health: base.durability.health * (1 + 0.1 * a),
      resistance: Math.min(0.9, base.durability.resistance + 0.08 * a),
    },
  };
  cache.set(key, out);
  return out;
}

/**
 * The measurable before/after of buying the next level of an upgrade, read from the same `applyUpgrades` the
 * physics uses (so the garage can never promise something the car does not do). Null when maxed or incompatible.
 */
export function upgradePreview(base: VehicleDef, levels: UpgradeLevels, id: UpgradeId): { label: string; before: string; after: string }[] | null {
  if (nextUpgradeCost(base, levels, id) === null) return null;
  const now = applyUpgrades(base, levels);
  const next = applyUpgrades(base, { ...levels, [id]: (levels[id] ?? 0) + 1 });
  const rel = (x: number, y: number, ref: number): { before: string; after: string } => ({
    before: `${Math.round((x / ref) * 100)}%`,
    after: `${Math.round((y / ref) * 100)}%`,
  });
  switch (id) {
    case 'engine':
      return [
        { label: 'Top speed', before: `${Math.round(now.engine.topSpeed * 3.6)} km/h`, after: `${Math.round(next.engine.topSpeed * 3.6)} km/h` },
        { label: 'Engine force', ...rel(now.engine.force, next.engine.force, base.engine.force) },
      ];
    case 'tires':
      return [
        { label: 'Grip', ...rel(now.grip.lateral, next.grip.lateral, base.grip.lateral) },
        { label: 'Off-road ability', before: `${Math.round(now.offroad * 100)}%`, after: `${Math.round(next.offroad * 100)}%` },
      ];
    case 'suspension':
      return [
        { label: 'Damping', ...rel(now.suspension.damping, next.suspension.damping, base.suspension.damping) },
        { label: 'Anti-roll', ...rel(now.suspension.antiRoll, next.suspension.antiRoll, base.suspension.antiRoll) },
      ];
    case 'brakes':
      return [{ label: 'Braking force', ...rel(now.engine.brakeForce, next.engine.brakeForce, base.engine.brakeForce) }];
    case 'tank':
    case 'efficiency':
      return [{ label: 'Range', before: `${Math.round(now.fuel.rangeKm)} km`, after: `${Math.round(next.fuel.rangeKm)} km` }];
    case 'armor':
      return [
        { label: 'Condition', before: `${Math.round(now.durability.health)}`, after: `${Math.round(next.durability.health)}` },
        { label: 'Damage taken', before: `${Math.round((1 - now.durability.resistance) * 100)}%`, after: `${Math.round((1 - next.durability.resistance) * 100)}%` },
      ];
  }
}
