import { defineConfig } from 'vitest/config';

// Tests that need the Firebase Emulator Suite (Firestore rules, Auth + Firestore integration).
// Run with `bun run test:emulator` (starts the emulators, runs this config, stops them).
export default defineConfig({
  test: {
    include: ['tests/emulator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
