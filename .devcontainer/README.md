# Dev container (Codespaces)

Open with: GitHub, Code, Codespaces, Create codespace on a branch. Pick **4-core / 16 GB** or larger.
Full instructions and limits: [`docs/operations/GITHUB.md`](../docs/operations/GITHUB.md).

## What it gives you

| | |
|---|---|
| Node | 26 (the owner's Mac runs 26.8.1). **CI pins Node 22**, so a green result here is not the CI result: run the PR checks too. |
| pnpm | the version in `package.json` `packageManager` (11.13.0), through corepack |
| Python | 3 (Ubuntu 24.04's), for `scripts/secret-scan.py` and the other Python scripts |
| Luau, luau-analyze, luau-compile | 0.663, same as CI (x86_64 only) |
| Rojo | 7.7.0, same as CI (x86_64 only) |
| Chromium | Playwright's, for the pixel tests and `pnpm e2e` |

Lune is not installed; nothing in the repository calls it. `packages/owner-classify` does not exist in
this tree, so there is no Python test suite for it to run here.

## What starts when

1. `onCreateCommand` (also the prebuild): installs corepack, `pnpm install --frozen-lockfile`, Chromium.
2. `updateContentCommand` (prebuild refresh on new commits): `pnpm install --frozen-lockfile`.
3. `postCreateCommand`: prints tool versions, runs a smoke typecheck of `packages/shared`, never fails the
   Codespace.

Forwarded ports: 8787 `wrangler dev` (apps/worker), 5173 `vite` (apps/web), 4321 `astro dev` (apps/site).

## What cannot run here

- **Roblox Studio.** Anything that needs a live Studio session (pairing the plugin, checkpoints, play tests,
  the owner benchmark runner) needs the owner's Mac.
- **The local library gateway on `127.0.0.1:63747`.** It lives on the Mac. The plugin tests that mention it
  use a stub and run fine; the real gateway does not exist in a Codespace.
- **`wrangler dev` against real bindings.** It needs `.dev.vars`, which is gitignored and holds secrets. This
  container never receives any. Do not add them as Codespaces secrets without the owner's say-so.
- **Anything that spends money** (the eval runners, live provider calls). They stay on the Mac with an explicit
  `--max-credits`.

## Prebuilds

Prebuilds are a repository setting, not a file. After this branch is on `main`: Settings, Codespaces, Set up
prebuild, branch `main`, trigger "On configuration change", region nearest the owner. A prebuild bakes in the
image, `node_modules` and Chromium, which is most of the creation time. It uses Codespaces storage and
Actions minutes, so enable it deliberately.
