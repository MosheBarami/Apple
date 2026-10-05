// flue() must come before cloudflare(): the Cloudflare plugin reads flueWorkerConfig(), which adds the
// generated Worker entry and one Durable Object binding per agent. The React UI is the client build.
import { cloudflare } from '@cloudflare/vite-plugin';
import { flue, flueWorkerConfig } from '@flue/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The browser sees this app at studpilot.app/studio/; the main worker strips the prefix.
  base: '/studio/',
  plugins: [flue({ providers: ['cloudflare'] }), cloudflare({ config: flueWorkerConfig() }), react(), tailwindcss()],
});
