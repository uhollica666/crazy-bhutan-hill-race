import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

/** Emits sw.js with a precache list and a build id derived from the actual output, so every release gets a fresh cache. */
function serviceWorker(): Plugin {
  return {
    name: 'cbhr-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const hash = createHash('sha1');
      for (const f of files) {
        const item = bundle[f];
        hash.update(f);
        hash.update(item.type === 'asset' ? item.source : item.code);
      }
      const publicFiles = walk('public').map((f) => relative('public', f).replaceAll('\\', '/'));
      for (const f of publicFiles) hash.update(readFileSync(join('public', f)));
      const precache = ['./', ...files, ...publicFiles];
      const source = readFileSync('src/pwa/sw.template.js', 'utf8')
        .replace('__BUILD_ID__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5273, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
