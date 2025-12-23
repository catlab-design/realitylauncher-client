// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// Note: astro-electron plugin removed - using manual Electron setup via package.json concurrently
export default defineConfig({
  base: './',
  build: {
    // Use relative paths for assets - critical for Electron file:// protocol
    assetsPrefix: './'
  },
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()]
  }
});