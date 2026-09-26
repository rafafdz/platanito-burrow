import { defineConfig } from 'vite';

// Production builds are served from GitHub Pages at https://rafafdz.github.io/platanito-burrow/,
// so assets need that base path. The dev server (and npm test) keep serving from /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/platanito-burrow/' : '/',
  build: { chunkSizeWarningLimit: 1000 },
}));
