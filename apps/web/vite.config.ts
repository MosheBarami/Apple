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
        target: 'https://apple.moshe-barami111.workers.dev',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // THE WORKSPACE CHUNK KEEPS ITS OWN NAME. Rollup names a chunk after the first module that
        // gave it a name, and the workspace's was taken from a streamdown file, so the 466 kB chunk
        // the route lazy-loads was called `mermaid-*.js` and scripts/check-app-bundle.mjs, which looks
        // for a chunk called workspace-*, reported the route as folded into the entry. It was not.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => id.endsWith('/src/routes/workspace.tsx'))
            ? 'assets/workspace-[hash].js'
            : 'assets/[name]-[hash].js',
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
});
