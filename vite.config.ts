/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  server: { host: true, port: 5173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
