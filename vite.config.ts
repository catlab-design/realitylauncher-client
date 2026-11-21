import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Rollup's shared CJS interop helper; react needs it, so it must not land in a lazy chunk.
                    if (id.includes('commonjsHelpers')) return 'vendor-react';
                    if (!id.includes('node_modules')) return;
                    if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
                    if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
                    if (/node_modules\/gsap\//.test(id)) return 'gsap';
                    if (/node_modules\/(react-markdown|remark-[^/]+|rehype-[^/]+|mdast-[^/]+|hast-[^/]+|micromark[^/]*|unified|unist-[^/]+|vfile[^/]*)\//.test(id)) return 'markdown';
                    if (/node_modules\/(skinview3d|three|skinview-utils)\//.test(id)) return 'skinview3d';
                },
            },
        },
    },
});
