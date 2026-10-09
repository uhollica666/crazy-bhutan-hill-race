import type { SaveData } from '../storage/SaveStore';
import type { SyncBase } from './payload';

/** Everything the cloud layer remembers on this device, apart from the game save itself. */
export interface CloudMeta {
  schema: 1;
  /** Random id of this browser profile: lets a cloud save say which device wrote it. Not linked to any person. */
  deviceId: string;
  /** The uid the `base` belongs to. */
  uid: string | null;
  /** Create a guest identity automatically. Turned off by signing out, back on by signing in or registering. */
  autoGuest: boolean;
  /** The last state both this device and the cloud agreed on (the common ancestor for conflict handling). */
  base: SyncBase | null;
  /** When local changes started waiting for a sync (null: nothing waiting). */
  pendingSince: number | null;
  lastSyncedAt: number | null;
  /** The display name last known for this player. */
  displayName: string | null;
  /** Copies of the local save taken before anything cloud-related replaced it; kept until a later sync confirms. */
  backups: { at: number; reason: string; data: SaveData }[];
}

export const META_KEY = 'cbhr.v1.cloud';
const MAX_BACKUPS = 3;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const randomId = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('');
};

const fresh = (): CloudMeta => ({
  schema: 1,
  deviceId: randomId(),
  uid: null,
  autoGuest: true,
  base: null,
  pendingSince: null,
  lastSyncedAt: null,
  displayName: null,
  backups: [],
});

/** localStorage-backed, never throws, falls back to memory (private mode, quota, blocked storage). */
export class CloudMetaStore {
  data: CloudMeta;
  private memory: string | null = null;

  constructor(private readonly storage: StorageLike | null) {
    this.data = this.load();
  }

  private load(): CloudMeta {
    try {
      const raw = this.storage?.getItem(META_KEY) ?? this.memory;
      if (raw) {
        const o = JSON.parse(raw) as Partial<CloudMeta>;
        if (o && o.schema === 1 && typeof o.deviceId === 'string' && o.deviceId.length >= 8) {
          return { ...fresh(), ...o, deviceId: o.deviceId, backups: Array.isArray(o.backups) ? o.backups.slice(-MAX_BACKUPS) : [] };
        }
      }
    } catch {
      /* corrupt: start again */
    }
    const m = fresh();
    this.memory = JSON.stringify(m);
    try {
      this.storage?.setItem(META_KEY, this.memory);
    } catch {
      /* keep the in-memory copy */
    }
    return m;
  }

  save(): void {
    const text = JSON.stringify(this.data);
    this.memory = text;
    try {
      this.storage?.setItem(META_KEY, text);
    } catch {
      /* keep the in-memory copy */
    }
  }

  update(patch: Partial<CloudMeta>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  addBackup(reason: string, data: SaveData, now = Date.now()): void {
    this.data.backups = [...this.data.backups, { at: now, reason, data }].slice(-MAX_BACKUPS);
    this.save();
  }
}
