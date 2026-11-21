import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  // Optional files: features that depend on them are compiled out until they exist,
  // so the site never requests a missing file (no 404s in the console).
  // Add public/resume.pdf, then restart `npm run dev` / rebuild to show the download button.
  define: {
    __HAS_RESUME__: JSON.stringify(existsSync('public/resume.pdf')),
  },
  build: {
    target: 'es2022',
    // three is the bulk of the bundle; keep it in its own long-cacheable chunk.
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\/]three/ }] },
      },
    },
  },
});
