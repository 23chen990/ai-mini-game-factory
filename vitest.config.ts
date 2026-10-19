import { configDefaults, defineConfig } from 'vitest/config';

// Browser/build suites share real CPU and browser processes. Bound file-level
// concurrency instead of weakening gameplay assertions or extending timeouts.
export default defineConfig({ test: { maxWorkers: 2, testTimeout: 60_000, hookTimeout: 60_000, exclude: [...configDefaults.exclude, 'runs/**'] } });
