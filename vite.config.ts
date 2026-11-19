import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // three is the bulk of the bundle; keep it in its own long-cacheable chunk.
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
  },
});
