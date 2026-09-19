# Resume frontend validation — 2026-09-18

## Scope and boundary

This pass validated the current frontend working tree only. It did not edit web/site/shared source.
The only authored repository file from this pass is this evidence report. No browser tab, Sentry UI,
account surface, credential, private customer data, remote service, deployment, upload, external model,
or Worker full suite was accessed. The browser/Sentry tab remained owned by the other conversation.

Package scripts were read from the current package manifests before execution:

- `@golem/web`: `test = node --test`, `build = tsc --noEmit && vite build`
- `@golem/site`: `test = node --test tests/`, `typecheck = astro check`, `build = astro build`

Commands were run serially with an external Python process watchdog: one package command at a time,
180-second timeout per command, and process-group termination on timeout. No timeout fired. No install
command was invoked.

## Validation results

### Web

`pnpm --filter @golem/web test` completed the suite and returned nonzero because of one test:

```text
tests   1859
pass    1858
fail       1
skipped    0
todo       0
```

The sole failure is `apps/web/tests/checkpoint-author.test.mjs`, test
`the shape the browser reads actually carries an author`.

The test reads `packages/shared/src/index.ts`, starts at `export interface CheckpointMeta`, then checks
only the first 1,400 characters for `authorId?: string | null`. The current source **does carry that
field**. Direct measurement of the exact current source places the field at character offset **1,406**
from the start of `CheckpointMeta`, so the fixed 1,400-character test window ends six characters too
early. This is a guard-window failure, not evidence that the browser contract lost `authorId`.

No source change was made here. The appropriate owner can make the guard parse the interface boundary
or otherwise assert the property without a fixed character window.

`pnpm --filter @golem/web build` passed:

```text
tsc --noEmit                 passed
Vite modules transformed      296
Vite production build        passed
```

Vite emitted one non-fatal size warning because the main JS chunk is above 500 kB after minification.
The build still exited 0.

### Site

`pnpm --filter @golem/site test`:

```text
tests   44
pass    44
fail     0
```

`pnpm --filter @golem/site typecheck` (`astro check`):

```text
files       33
errors       0
warnings     0
hints        0
```

`pnpm --filter @golem/site build` passed and reported **19 pages** built in static-output mode.

## Exact generated asset names and hashes

All hashes below are SHA-256 over the exact current built bytes after the successful build commands.

### Web Vite assets

| built file | bytes | SHA-256 |
|---|---:|---|
| `apps/web/dist/assets/admin-CxZFWsel.js` | 21,870 | `e0dea61dedb18c1ed455b8fd63a0c6a96bbacd230077a81a0983252ec1ea54e4` |
| `apps/web/dist/assets/index-CIlUvRCI.css` | 62,033 | `8d7237a328ea243bd6d7490a7d4f3faeb6c1cb55dd7a3ddecc9c7b19929b52fa` |
| `apps/web/dist/assets/index-DV1OMFuE.js` | 571,279 | `c4a19e8578b368585184b9e102ca2515485cf4b4f88d65e23fb0ab3539491d54` |
| `apps/web/dist/assets/markdown-0Pr9SZxJ.js` | 65,370 | `a339f16f9cb095ea96875ddcdd43b83ea95acfd6556058fa9d1c1b38bc96a152` |
| `apps/web/dist/assets/react-CbGl50uX.js` | 206,368 | `145aaa68bf4d33528a703f786f2a31a3e97458e55ce9642ddd88360b1eaf8b81` |
| `apps/web/dist/assets/supabase-CyI6DAKv.js` | 220,436 | `dc9f86b4e2192723b8dfd24562fb3e61ac0354f3e014ffb8d78ab5ff6ef0d1fc` |
| `apps/web/dist/assets/ui-lab-DO1sWOIO.js` | 13,835 | `3bffda5fcab18b58e1f082c76b99edce07c2720d0d659eb77f446d1a00fe0ff6` |

Web asset aggregate (the seven files above, sorted by path, using the aggregate algorithm below):

```text
fb40db049435a0512ce806782c4205c798fb12abe257cc5188ba082c67c03995
```

`apps/web/dist/index.html` is 1,797 bytes with SHA-256
`e8b90144303f4fe1e2decc53a764c16a6e65e9ac3304db874271a02b5d71da0c`.

The complete web `dist/` contains **8 files**. Complete web-output aggregate:

```text
7d44295d5825bb095cdefa55eebd6784fb50444a22c9a4abb32ea9b480a41027
```

### Site Astro-generated assets

| built file | bytes | SHA-256 |
|---|---:|---|
| `apps/site/dist/_astro/billing.Ba7VvUlx.css` | 5,328 | `6c59685eeb29ea66cb66e8a391cfeaff4a4a07ad96e257ef208892239ea48cf4` |
| `apps/site/dist/_astro/billing.CqrJpS_k.css` | 16,850 | `b3b1ea7588d04f9fe8b49af982cf80a7acee8bfe3a503f57e2a409139458ae32` |
| `apps/site/dist/_astro/index.DzHJKUkz.css` | 5,558 | `69bf057cbf339de1c7ada2fa1e2ce0885b7e41fce8f0694ea01e6cede7d5499f` |
| `apps/site/dist/_astro/status.DFytLu04.css` | 4,727 | `4ad049a7398945d647290382987a325a25057eba22f0bb202cadad1166d0f2c2` |

Astro-generated asset aggregate:

```text
88d184a6f162d20a2ac1ee77c4eff3ae5be15784e4abd74e734ffa9f444506a8
```

The site build also copied **40** stable `assets/wall/*` reference-image files. Their aggregate is:

```text
276b5a53f579f23624e0558e2c31411b8919976e58d518bde7c4071e35e88a4d
```

Selected stable public output files were also verified:

| built file | bytes | SHA-256 |
|---|---:|---|
| `apps/site/dist/_headers` | 385 | `09fbbd1bb264b89e6f76e51907e9d7176fdb004853354fcce1dcc0f44af1a8d9` |
| `apps/site/dist/apple-touch-icon.png` | 3,671 | `796c9cecb10212280f05a78216bc84bbe2274cebed4e9a7d1fcef8e486b94242` |
| `apps/site/dist/favicon.svg` | 3,069 | `6881d5def82a5303db9f71daa276ebb7e56fea236db249656efb76b1621d96f4` |
| `apps/site/dist/icon-192.png` | 4,216 | `29213c617efb608c375972498f322b5a8fcc73fd1c627cd06a3238e9630e7df4` |
| `apps/site/dist/icon-512.png` | 11,988 | `bbe4cfdd4aa4391a3f068cf4117df16a1d436b1b55984719360adaeb223b27c2` |
| `apps/site/dist/og.png` | 270,108 | `7a6f9d810f517e9f8c3b6e1fc1d04e593024f08b3f8504a221e8d9fcc1fce0a9` |
| `apps/site/dist/robots.txt` | 108 | `13a8529758a6c64edfd831d681f5f928c84e33a1c578d2bd3b54d595a5e41295` |
| `apps/site/dist/site.webmanifest` | 605 | `84ce020747d07033704aae9d689528a155456d94103a830d1ee30810f6968458` |

The complete site `dist/` contains **74 files**. Of those, **4** are `_astro/` generated assets and
**40** are `assets/wall/*` reference-image files. Complete site-output aggregate:

```text
4f180514c3283799df3deece2972ab07be492083549ef8c2859e1d0a45eab35a
```

`apps/site/dist/index.html` is 9,938 bytes with SHA-256
`94c0a2f24cdcfd2654659c6fbf2748fa9e9598ec0f2b8e3ae3156ce453e1d241`.

## Source and test fingerprints

Fingerprint algorithm: sort the selected paths lexicographically. For each path, update SHA-256 with
the UTF-8 repository-relative path, one NUL byte, the exact file bytes, then one NUL byte. `.DS_Store`
is excluded. These fingerprints describe the exact local inputs inspected/built; they do not claim
deployment.

Build-source sets:

- **Web source:** `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, and every
  file under `apps/web/src/` — **180 files**.
- **Site source:** `apps/site/package.json`, `tsconfig.json`, `astro.config.mjs`, and every file under
  `apps/site/src/`, `apps/site/public/`, and `apps/site/brand/` — **88 files**.
- **Shared frontend dependency:** `packages/shared/package.json`, `tsconfig.json`, and every file under
  `packages/shared/src/` — **4 files**.

```text
WEB_SOURCE_SHA256       = f981d7946ccdbb9201b7f9adf22b193903140874f8e3529dcd061c538c2d6694
SITE_SOURCE_SHA256      = a251e3e6b2588749a326f69e7abee1f764b551da1df088f9892f03167bd17775
SHARED_SOURCE_SHA256    = 85cc28c2024074d9436a4c2a8b393dc5c7aa9542c179408a5ebec255ad76e631
FRONTEND_SOURCE_SHA256  = cffcffb0842a237dc65e37632449a270a0dda1bd93122c41dee792b7d17682b6
FRONTEND_SOURCE_FILES   = 272
```

Test-source sets:

```text
WEB_TEST_FILES          = 149
WEB_TEST_SHA256         = 72d17da657174060015ffc646b611e2da239fe78831e3090c798d80ee5e6fbc0
SITE_TEST_FILES         = 12
SITE_TEST_SHA256        = 7e9ff6282a34329abb9a3f96fc7184310d13a723ee02f1f4689df9ed94784cf1
FRONTEND_TEST_FILES     = 161
FRONTEND_TEST_SHA256    = 06390a37a78148c3b856c9f30e360a0ba2fb50ad383495537173fe348f3c00ba
```

## Evidence limits

- **Observed local tests:** web 1,858/1,859; site 44/44; site Astro diagnostics 0/0/0.
- **Observed local builds:** web build exit 0; site build exit 0; site reported 19 pages.
- **Known frontend validation defect:** the one web test uses a fixed 1,400-character source window;
  the required field is present at offset 1,406 in current shared source.
- **Production/browser:** not observed in this pass. No browser/account route was opened and no Sentry
  surface was touched.
- **Deployment:** none. Build output hashes above describe only the local `dist/` trees.

## Checkpoint guard and MCP classification follow-through

The single web failure recorded above was subsequently authorized for a test-only repair. The shared
`CheckpointMeta` production type was not changed. The fixed test now parses the TypeScript source with
the TypeScript AST, finds the `CheckpointMeta` interface declaration and its `authorId` property, and
asserts the real contract: the property is optional and its type is exactly the `string | null` union.
There is no fixed source-length window.

The same test file carries a falsification control. It mutates only its in-memory copy of the shared
source and proves the guard returns false when either:

- `authorId` becomes required, or
- `null` is removed from its type.

Focused checkpoint validation after the repair:

```text
node --test apps/web/tests/checkpoint-author.test.mjs
11 tests · 11 passed · 0 failed
```

The MCP total-classification guard independently exposed three newly registered tools as undecided:

```text
search_creation_skills
read_creation_skill
get_genre_references
```

They were explicitly admitted to the read-only MCP surface. The decision is narrow: all three are
`studio:false`, issue no Studio operation, use checked-in bounded data, and make no provider/model or
outbound network request. MCP still requires `projects:read` and a granted `project_id` for each call;
the project id remains the tenant authorization anchor and is removed before registry-tool arguments
are forwarded.

`apps/worker/src/mcp.ts` now exposes the explicit static-reader classification as
`MCP_OFFLINE_STATIC_TOOLS`. Studio-backed MCP tools continue to be proven against
`MCP_READ_ONLY_STUDIO_OPS`; a zero-Studio-op tool is accepted only when it is in that explicit static
list and the live registry still says `studio:false` with no `studioOps` metadata.

Focused MCP validation:

```text
node --test apps/worker/tests/mcp.test.mjs
35 tests · 35 passed · 0 failed
```

This includes total registry classification, the read-only Studio-op traversal control, the three
offline-static classifications, HTTP `tools/call` routing for all three new tools, project-grant
addressing, `project_id` stripping before registry execution, credential/scope checks, and the existing
positive assertion that the MCP test made no external network contact.

Worker TypeScript validation after the MCP source change:

```text
pnpm --filter @golem/worker typecheck
tsc --noEmit · exit 0
```

The full web suite was then rerun, under the same bounded external watchdog used above:

```text
pnpm --filter @golem/web test
tests 1860 · pass 1860 · fail 0 · skipped 0 · todo 0

pnpm --filter @golem/web build
tsc --noEmit · passed
Vite modules transformed · 296
build · exit 0
```

The non-fatal Vite warning for the main chunk remaining above 500 kB is unchanged. Because the web
production source was not edited in this follow-through, the emitted asset names and bytes are also
unchanged from the table above:

```text
web dist files          8
WEB_DIST_SHA256         7d44295d5825bb095cdefa55eebd6784fb50444a22c9a4abb32ea9b480a41027
web Vite assets         7
WEB_ASSETS_SHA256       fb40db049435a0512ce806782c4205c798fb12abe257cc5188ba082c67c03995
```

The web-test aggregate changed because `checkpoint-author.test.mjs` gained the AST contract check and
falsification:

```text
WEB_TEST_FILES          = 149
WEB_TEST_SHA256         = 5b7fbe501c37ea6ae8cee30cb85bfdb2717aafa8306461fb3d7797ed01da60a0
```

Exact final SHA-256 values for the three files owned by this follow-through:

```text
apps/web/tests/checkpoint-author.test.mjs
9f8925b4b358558b23dbc43ab4cf3751ba5d3fe402af3534cc5359a69853de9d

apps/worker/src/mcp.ts
912f3b29c4bc7635b4a4801509de4ef8db88198ab94b66d9ffb651c9a3ec551c

apps/worker/tests/mcp.test.mjs
2da94e4ac73977db3eacec3e9c00d362c53d1e3587a34eacd9b09f1fd77cc145

OWNED_AGGREGATE_SHA256
2f292a8014e26af58dc13794ef44b1c7bf59c829ac1b0001d425c6c63bf69df1
```

The owned aggregate uses the same path + NUL + bytes + NUL algorithm, with the three paths sorted
lexicographically. No tool definitions, router, prompt, shared type, UI production source, provider,
account, deployment, browser, Sentry, or paid/network path was changed or invoked in this follow-through.
