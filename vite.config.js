import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5520,
    open: '/index.html',
    host: 'localhost',
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // off for production (saves ~2.7 MB, faster deploy)
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          gsap: ['gsap'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pixi.js', 'gsap'],
  },
});
