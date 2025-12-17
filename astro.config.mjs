// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';
import electron from "astro-electron";
// https://astro.build/config
export default defineConfig({
  base: './',
  integrations: [react(), electron({
    main: {
      entry: "src/electron/main.ts", // Path to your Electron main file
      vite: {}, // Vite-specific configurations (by default we use the same config as your Astro project)
    },
    preload: {
      input: "src/electron/preload.ts", // Path to your Electron preload file
      vite: {}, // Vite-specific configurations (by default we use the same config as your Astro project)
    },
    renderer: {
      // Renderer-specific configurations (if needed)
    },
  })],

  vite: {
    plugins: [tailwindcss()]
  }
});