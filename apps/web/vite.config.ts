import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/app/',
  // Tailwind CSS v4 compiles the AI Elements' own classes (src/styles/ai-elements.css).
  plugins: [react(), tailwindcss()],
  // The AI Elements CLI's alias: `@/components/ui/*`, `@/lib/utils` (tsconfig.json says the same).
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/api/library-preview': {
        target: 'https://studpilot.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // A lazy route's chunk is named for the route. Rollup names a chunk after whichever module it picks as the
        // chunk's face, and when the route shares a chunk with a vendor library only that route uses (workspace
        // shares one with mermaid, katex and streamdown) the name is the library's: the route was split, lazy and
        // absent from index.html, and `scripts/check-app-bundle.mjs` reported "/workspace has no chunk of its own"
        // because it looks the chunk up by name. The entry chunk is never renamed, so a route folded back into the
        // entry still leaves no chunk with its name and the check still fails.
        chunkFileNames: (chunk) => {
          const route = chunk.isDynamicEntry && !chunk.isEntry
            ? chunk.moduleIds.map((id) => /[\\/]src[\\/]routes[\\/]([\w-]+)\.tsx$/.exec(id)?.[1]).find(Boolean)
            : undefined;
          return route ? `assets/${route}-[hash].js` : 'assets/[name]-[hash].js';
        },
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          markdown: ['marked', 'dompurify'],
          // The AI Elements Shimmer (a loading caption, mounted from components/loading.tsx and so in the eager
          // graph) pulls motion in: ~120 kB of the entry chunk, which is the whole of its growth past the
          // budget since 2026-10-01. A vendor library belongs beside react and supabase, not inside the chunk
          // that carries the app's own code. It is still preloaded, so the eager-graph budget keeps counting it.
          motion: ['motion/react'],
        },
      },
    },
  },
});
