import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Standardmäßig liegt die App im Wurzelverzeichnis. Auf GitHub Pages liegt
// sie unter dem Repository-Namen; diesen Pfad setzt der Workflow über
// STICK_BASE, damit hier kein Name fest verdrahtet ist, der bei einer
// Umbenennung still falsch wird.
const base = process.env.STICK_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png'],
      manifest: {
        name: 'Stickarin',
        short_name: 'Stickarin',
        description: 'Bild auswählen, Farben festlegen, fertige Stickdatei für die Bernina speichern.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f2f2f7',
        theme_color: '#0060df',
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
