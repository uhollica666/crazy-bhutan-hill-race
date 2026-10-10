export interface FeedbackRecord {
  id: string;
  createdAt: string;
  appVersion: string;
  origin: string;
  rating: number;
  gameplay: string;
  controls: string;
  graphics: string;
  performance: string;
  difficulty: 'tooEasy' | 'aboutRight' | 'tooDifficult' | null;
  favourite: string;
  improve: string;
  add: string;
  bugs: string;
  contact: string | null;
  device: Record<string, unknown> | null;
  interest: { playLargerVersion: boolean | null; considerPurchasingFullGame: boolean | null; priceRange: string | null; voluntarySupport: boolean | null };
}
export interface Annotated extends FeedbackRecord {
  topics: string[];
  platform: { os: string; kind: string };
}
export interface Filters {
  from?: string;
  to?: string;
  version?: string;
  os?: string;
  minRating?: number;
  maxRating?: number;
  topic?: string;
  origin?: string;
  difficulty?: string;
  text?: string;
}
export interface TopicRule {
  id: string;
  label: string;
  group: 'complaint' | 'request' | 'praise';
  fields: string[];
  patterns: RegExp[];
}
export interface TopicRow {
  id: string;
  label: string;
  group: string;
  count: number;
  pct: number;
  avg: number;
}
export interface YesNo {
  answered: number;
  yes: number;
  no: number;
  yesPct: number;
  answeredPct: number;
}
export interface Summary {
  total: number;
  avgRating: number;
  positivePct: number;
  negativePct: number;
  distribution: { stars: number; count: number }[];
  byDay: { day: string; count: number; avg: number }[];
  versions: { version: string; count: number; avg: number }[];
  origins: { origin: string; count: number }[];
  deviceShared: { count: number; pct: number };
  platforms: { os: string; count: number; avg: number }[];
  kinds: { kind: string; count: number }[];
  qualities: { quality: string; count: number }[];
  difficulty: { difficulty: string; count: number }[];
  interest: { largerVersion: YesNo; purchase: YesNo; voluntarySupport: YesNo; prices: { price: string; count: number }[] };
  complaints: TopicRow[];
  requests: TopicRow[];
  praise: TopicRow[];
  textFill: { field: string; count: number; pct: number }[];
  withContact: number;
  range: { first: string; last: string } | null;
}
export const TOPICS: TopicRule[];
export const TEXT_FIELDS: string[];
export function redactText(s: unknown): string;
export function normalizeRecord(id: string, d: unknown): FeedbackRecord;
export function fromFirestoreValue(v: unknown): unknown;
export function fromFirestoreFields(fields: unknown): Record<string, unknown>;
export function platformOf(device: Record<string, unknown> | null): { os: string; kind: string };
export function annotate(records: FeedbackRecord[]): Annotated[];
export function filterRecords(records: Annotated[], f?: Filters): Annotated[];
export function summarize(records: Annotated[]): Summary;
export function toCsv(records: Annotated[], opts?: { redact?: boolean; includeText?: boolean }): string;
export function toJson(records: Annotated[], summary: Summary, opts?: { redact?: boolean }): string;
export function barsSvg(items: { label: string; value: number; note?: string }[], opts?: { width?: number; color?: string; max?: number }): string;
export function columnsSvg(items: { label: string; value: number }[], opts?: { width?: number; height?: number; color?: string }): string;
export function lineSvg(points: { day: string; value: number }[], opts?: { width?: number; height?: number; color?: string }): string;
export function donutHtml(items: { label: string; value: number }[], opts?: { size?: number }): string;
export const CHARTS: Record<string, unknown>;
