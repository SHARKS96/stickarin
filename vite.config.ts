import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Auf GitHub Pages liegt die App unter /stick-karin/, lokal unter /.
const base = process.env.STICK_BASE ?? (process.env.GITHUB_ACTIONS ? '/stick-karin/' : '/');

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png'],
      manifest: {
        name: 'Stick-Karin',
        short_name: 'Stick-Karin',
        description: 'Bild auswählen, Farben festlegen, fertige Stickdatei für die Bernina speichern.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f5f2',
        theme_color: '#2f6f5e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
