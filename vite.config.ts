import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/pixel-sandbox/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'icons/*.png'],
      manifest: {
        name: 'Pixel Sandbox',
        short_name: 'Pixel Sandbox',
        description: 'A retro falling-sand sandbox with fire, plants, electricity, and physics.',
        lang: 'en',
        id: '/pixel-sandbox/',
        start_url: '/pixel-sandbox/',
        scope: '/pixel-sandbox/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#140c18',
        theme_color: '#140c18',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest,ico}'],
        navigateFallback: 'index.html',
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
