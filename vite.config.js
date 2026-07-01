import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const circleKitKey = env.VITE_CIRCLE_KIT_KEY || env.KIT_KEY || process.env.VITE_CIRCLE_KIT_KEY || process.env.KIT_KEY || '';

  return {
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
      global: 'globalThis',
      'import.meta.env.VITE_CIRCLE_KIT_KEY': JSON.stringify(circleKitKey)
    }
  };
});
