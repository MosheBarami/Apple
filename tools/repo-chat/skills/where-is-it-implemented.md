---
name: where-is-it-implemented
description: Find where a feature, function, route, constant or concept is implemented in the code, and show the key lines.
---
# Where is it implemented

Use for "where is X", "which file handles Y", "how is Z implemented".

1. Pick 1-3 distinctive search terms (function name, route path, error string, constant). Call `search_code` with the exact identifier first (fixed string). If nothing, try a `regex=true` variant or a shorter stem, and narrow with `glob` (for example `apps/worker/src/**/*.ts`).
2. If the question is conceptual and code search is noisy, call `search_knowledge` with the concept; docs and ADRs often name the file.
3. Separate definitions from usages: the definition is usually the match with `export`, `function`, `const NAME =` or a class. Open it with `read_file` around the match (about 40 lines before and 80 after, via startLine/endLine).
4. For worker code, remember `apps/worker/src/index.ts` is the Hono entry, `apps/worker/src/do/` holds the Durable Objects, `apps/worker/src/tools.ts` holds the agent tools; for the Studio plugin, `apps/studpilot-plugin/src/` (Luau); for the UI, `apps/web/src` and `apps/site/src`; shared protocol types in `packages/shared/src`.
5. If multiple candidates exist (for example legacy `apps/plugin` vs shipping `apps/studpilot-plugin`), say which one is the product and why (README layout table).
6. Answer: file path, the lines that matter quoted briefly, what calls it (one or two callers from `search_code`), and `path:line` for each. If you could not find it, say so and list what you searched.
