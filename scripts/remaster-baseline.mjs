// Temporary review-only copies of committed Stage 8A geometry. Not shipped or used by the game.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/remaster/stage8a-preview', { recursive: true });
for (const id of ['dzo-hatch', 'tourist-coaster', 'druk-ranger', 'dragon-cruiser']) {
  const binary = execFileSync('git', ['show', `28a8021:public/remaster/vehicles/${id}.glb`], {
    maxBuffer: 8 * 1024 * 1024,
  });
  await writeFile(`public/remaster/stage8a-preview/${id}.glb`, binary);
}
