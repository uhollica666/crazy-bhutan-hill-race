export interface RawDoc {
  id: string;
  doc: Record<string, unknown>;
}
export interface Loaded {
  source: string;
  docs: RawDoc[];
  sample: boolean;
}
export interface Args {
  _: string[];
  [key: string]: unknown;
}
export function parseArgs(argv: string[]): Args;
export function sampleDocs(n?: number): RawDoc[];
export function loadDocs(o: Record<string, unknown>, env?: Record<string, string | undefined>): Promise<Loaded>;
export function buildReport(loaded: Loaded, o: Record<string, unknown>, now?: Date): { summary: import('./feedback/core.mjs').Summary; files: Record<string, string> };
