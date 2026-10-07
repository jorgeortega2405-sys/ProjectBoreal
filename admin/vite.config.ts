import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    copyPublicDir: false,
    cssCodeSplit: true,
    emptyOutDir: true,
    outDir: 'dist/client',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@client': path.resolve(import.meta.dirname, 'client'),
    },
  },
  server: {
    port: 5175,
    watch: {
      binaryInterval: 2000,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/logs/**',
        '**/.git/**',
        '**/public/**',
      ],
      interval: 2000,
      usePolling: true,
    },
  },
});
