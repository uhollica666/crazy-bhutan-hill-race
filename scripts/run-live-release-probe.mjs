import { rolldown } from 'rolldown';
import { rm } from 'node:fs/promises';
const output = 'scripts/.live-release-probe.mjs';
const build = await rolldown({ input: 'scripts/live-release-probe.ts', platform: 'node', external: [/^firebase\//, /^node:/] });
try {
  await build.write({ file: output, format: 'esm' });
  await import('./.live-release-probe.mjs');
} finally { await build.close(); await rm(output, { force: true }); }
