# Where apps/www comes from (planning/WEB-REBUILD.md §1.1)

- Template: [vercel/chatbot](https://github.com/vercel/chatbot) at commit `c2f8235e1f3ea903ad8b7f61447c4f74164b5c58`
  (2026-10-06), licence Apache-2.0 (`LICENSE`, kept as it was; notice in the repo's `THIRD_PARTY_NOTICES.md`).
- Changes made only to host it (step 1): `proxy.ts` renamed to `middleware.ts` with `export function middleware`, because
  OpenNext on Workers does not support Next 16's Node `proxy.ts` yet (opennextjs/opennextjs-cloudflare#962); OpenNext's
  `open-next.config.ts` and `wrangler.jsonc`; `@opennextjs/cloudflare`, `wrangler` and `@opentelemetry/api`; a hoisted
  install (`.npmrc`). Preview: https://studpilot-www-preview.moshe-barami111.workers.dev
- AI Elements parts come only from `npx ai-elements@latest add <name>`.
