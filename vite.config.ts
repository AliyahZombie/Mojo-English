import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const proxyPort = process.env.PROXY_PORT || env.PROXY_PORT || '5174';
  const noProxy = process.env.VITE_NO_PROXY === 'true' || env.VITE_NO_PROXY === 'true';
  const proxyConfig = !noProxy ? {
    '/api/proxy': {
      target: `http://127.0.0.1:${proxyPort}`,
      changeOrigin: false,
      rewrite: (path: string) => path,
    },
  } : {};
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: 'Mojo English',
          short_name: 'Mojo',
          description: 'AI-assisted English learning',
          theme_color: '#2563eb',
          background_color: '#0f172a',
          display: 'standalone',
          icons: [
            { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /\/api\/proxy\?target=https:\/\/newsdata\.io/,
              handler: 'NetworkFirst',
              options: { cacheName: 'news-api', expiration: { maxEntries: 30, maxAgeSeconds: 3600 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify--file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: proxyConfig,
    },
    preview: {
      allowedHosts: ['us2.aliyahzombie.top'],
      proxy: proxyConfig,
    },
  };
});
