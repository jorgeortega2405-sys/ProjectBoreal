import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: path.resolve(import.meta.dirname, 'public'),
  root: path.resolve(import.meta.dirname),
  build: {
    copyPublicDir: false,
    cssCodeSplit: true,
    emptyOutDir: true,
    outDir: path.resolve(import.meta.dirname, 'dist/client'),
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  resolve: {
    alias: {
      '@client': path.resolve(import.meta.dirname, 'client'),
    },
  },
});
