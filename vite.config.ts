import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const proxyPort = process.env.PROXY_PORT || env.PROXY_PORT || '5174';
  const noProxy = process.env.VITE_NO_PROXY === 'true' || env.VITE_NO_PROXY === 'true';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify--file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: !noProxy ? {
        '/api/proxy': {
          target: `http://127.0.0.1:${proxyPort}`,
          changeOrigin: false,
          rewrite: path => path,
        },
      } : {},
    },
    preview: {
      allowedHosts: ['us2.aliyahzombie.top'],
    },
  };
});
