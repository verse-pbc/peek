import { defineConfig } from 'vitest/config';
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Use node environment for integration tests
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@peek/shared": path.resolve(__dirname, "../../shared")
    },
  },
});