// Isolated asset review server. Disabling live reload keeps captures stable while evidence is written.
import { createServer } from 'vite';
const server = await createServer({
  cacheDir: '.remaster-cache/vite',
  server: { host: '127.0.0.1', port: 4188, strictPort: true, watch: null, hmr: false },
});
await server.listen();
server.printUrls();
