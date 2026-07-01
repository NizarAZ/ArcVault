import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/circle': {
        target: 'https://api.circle.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/circle/, '')
      }
    }
  },
  resolve: {
    alias: {
      buffer: 'buffer/'
    }
  },
  define: {
    global: 'globalThis'
  }
});
