# Where apps/www comes from (planning/WEB-REBUILD.md §1.1)

- Template: [vercel/chatbot](https://github.com/vercel/chatbot) at commit `c2f8235e1f3ea903ad8b7f61447c4f74164b5c58`
  (2026-10-06), licence Apache-2.0 (`LICENSE`, kept as it was; notice in the repo's `THIRD_PARTY_NOTICES.md`).
- Changes made only to host it (step 1): `proxy.ts` renamed to `middleware.ts` with `export function middleware`, because
  OpenNext on Workers does not support Next 16's Node `proxy.ts` yet (opennextjs/opennextjs-cloudflare#962); OpenNext's
  `open-next.config.ts` and `wrangler.jsonc`; `@opennextjs/cloudflare`, `wrangler` and `@opentelemetry/api`; a hoisted
  install (`.npmrc`). Served at https://studpilot.app through the main worker's WWW binding (no workers.dev address).
- AI Elements parts come only from `npx ai-elements@latest add <name>`.

## Step 2 (planning/WEB-REBUILD.md section 4): what was swapped out
- Removed: Auth.js and the guest flow, Drizzle/Postgres and the chat history tables, Vercel Blob, Redis, the model
  selector, the Vercel AI Gateway, the document/artifact/suggestion/weather tools, the editors, telemetry and bot
  protection, the template's Playwright tests and CI files.
- Added: Supabase sign-in (`@supabase/ssr`; `/login`, `/auth/callback`, `middleware.ts`), the chat on the Studio agent
  (`@flue/react`, `/studio/api/agents/studpilot/<project>`), the Studio light, the credits meter, and `lib/proxy.ts`,
  which forwards `/api/*` and `/studio/api/*` to `STUDPILOT_API_ORIGIN` (default https://studpilot.app) for the preview.
- Install with `pnpm install --ignore-workspace` (a plain `pnpm install` here resolves the repo root workspace instead).
