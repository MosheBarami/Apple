# GitHub: rulesets, packages, Codespaces and the files around them

Repository: `MosheBarami/Apple` (the GitHub API reports it as **public**, measured 2026-10-02; a task text
called it private, so confirm the visibility is what the owner intends before relying on anything below).
Everything here is a file in git. **Nothing in this document has been applied to GitHub.** Applying is a
separate, explicit step, and the two steps that change repository behaviour (rulesets, Actions settings)
are written so they refuse or warn while CI on `main` is red.

## What each file does

| File | What it does |
|---|---|
| `.github/rulesets/main.json` | The ruleset for `main`, exactly as GitHub's API takes it. |
| `scripts/github/apply-rulesets.mjs` | Creates or updates that ruleset through `gh api`. `--dry-run` prints the request and changes nothing. |
| `.github/workflows/publish-packages.yml` | Publishes the opted-in packages to GitHub Packages; dry-runs on pull requests that touch them. |
| `scripts/github/publish-packages.mjs` | Finds the publishable packages, stages a renamed copy, runs `npm publish` (or `--dry-run`). |
| `packages/shared/package.json`, `packages/sdk/package.json` | Opt in through `publishConfig.registry`. `apps/worker/package.json` gained `"private": true`. |
| `.github/CODEOWNERS` | `* @MosheBarami`: GitHub requests the owner's review on every PR. |
| `.github/pull_request_template.md` | The owner's checklist: generalization, tests red first, what was measured live. |
| `.github/ISSUE_TEMPLATE/*.yml` | Forms for a bug, a capability gap and a benchmark failure; blank issues are off. |
| `.github/dependabot.yml` | Weekly, grouped npm and GitHub Actions update PRs. Never merges anything. |
| `.devcontainer/*` | The Codespaces / dev container definition. See [Codespaces](#codespaces). |
| `tests/github-scripts.test.mjs` | Tests for the two scripts' pure logic. Runs in CI with the other root tests. |

## Rulesets

### What `main.json` says, and why

| Rule | Choice | Why |
|---|---|---|
| Block deletion, block force-push | on | The one history everything depends on. No downside. |
| Require a pull request | on, **0 approvals** | The point is that every change passes CI before it lands. A sole owner cannot approve his own PR, so requiring 1 approval would block him; CODEOWNERS still requests his review. Raise it the day there is a second maintainer. |
| Require code-owner review | off | Same reason: the only code owner is the author. |
| Required status checks | the six real job names of `ci.yml` | Exact strings, because GitHub matches the check-run name. The script refuses a name that is not a job `name:` in `ci.yml`, so a rename of a job cannot silently leave the ruleset waiting for a check nobody reports. |
| "Branch must be up to date" | off | Agents land many branches a day; forcing a rebase and a full CI re-run for each is cost without a failure it prevents here. |
| Linear history | **off** | The history already contains merge commits (the "land worktree-..." merges), and rebase-merging would rewrite the SHAs that evidence files record. Merge methods are limited to `merge` and `squash`. Turn on `required_linear_history` and drop `merge` only if the owner wants a flat history. |
| Bypass | repository Admin role, **pull-request mode** | The owner can merge a PR past a stuck or wrong check in an emergency, but cannot push to `main` directly. Without a bypass, a broken required check would lock the owner out of his own repository. |
| `Workers Builds: apple` | **not** required | It is a Cloudflare check run, not a GitHub Actions job, and it is red on `main` today. Add it only after it is green. |

### Do not apply it while `main` is red

On 2026-10-02, on `main` (`bf24ab00`): `Typecheck and tests`, `Build site and web` and `Playwright smoke`
are **failing**; the other three pass. Requiring all six now would make every PR unmergeable except by
bypass. `apply-rulesets.mjs` therefore reads the latest check-runs on `main`, and **refuses to apply** unless
every required check is `success` (`--allow-red-main` overrides it, which you should not use). Order of work:

1. Get the three red jobs green on `main` (another workstream owns that).
2. `node scripts/github/apply-rulesets.mjs --dry-run`: read the payload and the green/red table.
3. `node scripts/github/apply-rulesets.mjs`: needs `gh auth login` as the repository admin.

Alternative if the owner wants protection sooner: copy `main.json`, delete the three red contexts from the
copy, apply that with `--file`, and add them back (re-run the script; it updates by name) as each goes green.

### Names change if jobs are renamed

`ci.yml` job names are the contract. After the `@golem/*` to `@apple/*` rename lands, update `.github/` and
the scripts in the same change (`scripts/check-ci-references.mjs` guards missing script paths). The new
workflow does not mention a package name: it uses path filters (`--filter ./packages/shared`).

### Settings that are not files (owner runs these; not applied)

These are repository settings, not rulesets. Each is one command and reversible:

```bash
# Actions: read-only token by default, and Actions may not approve pull requests.
gh api -X PUT repos/MosheBarami/Apple/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
# Delete a branch when its PR merges.
gh api -X PATCH repos/MosheBarami/Apple -F delete_branch_on_merge=true
# Public repository: secret scanning and push protection (free).
gh api -X PATCH repos/MosheBarami/Apple \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

Measured 2026-10-02: workflow permissions are `write` and PR approval by Actions is `true`; secret scanning,
push protection and Dependabot security updates are `disabled`. `.env.release-*` and `.env.sentry-*` files sit
untracked at the root of the owner's checkout; `.gitignore` covers `.env.*`, but on a public repository
push protection is the net under that.

## Publishing packages

### Which packages, and the scope rule

Only packages that opt in by carrying `"publishConfig": { "registry": "https://npm.pkg.github.com" }` publish:

- `packages/shared`: the wire contract (types and constants). It ships **TypeScript source**
  (`main: src/index.ts`); consumers need a toolchain that compiles TS from `node_modules` (a bundler, `tsx`,
  wrangler). There is no build step to run.
- `packages/sdk`: the JS/TS, Python and Luau clients and the `apple` CLI. `"private": true` was removed from it
  so it can publish; the package already had `exports`, `bin` and `files`.
- `apps/worker` is now `"private": true` (it was not marked, so `pnpm publish -r` could have published a
  Worker). Nothing else is publishable.

**GitHub Packages only accepts a package whose npm scope equals the repository owner.** The owner is
`MosheBarami`, so the published names are lower-case: `@golem/sdk` is published as **`@moshebarami/sdk`** and
`@golem/shared` as **`@moshebarami/shared`** (after the rename, `@apple/sdk` also becomes `@moshebarami/sdk`; the
base name is kept). The in-repo names are not changed, because every `workspace:*` dependency and `--filter` uses
them. `publish-packages.mjs` stages a copy in a temp directory: it rewrites the name, removes `private` and
`scripts`, adds the `repository` field GitHub uses to link the package to this repo, and normalizes `bin`
(`./bin/x` to `bin/x`, which npm 11 otherwise warns about on publish). It refuses a package with a `workspace:`
dependency, versions that differ, or a `--tag` that is not `packages-v<version>`. A version already on the
registry is skipped, never overwritten.

### Releasing

1. Bump `version` in both package.json files (lock-step; the script enforces it). Merge to `main`.
2. `git tag packages-v0.2.0 && git push origin packages-v0.2.0`. The tag must point at a commit on `main`.
3. The `Publish packages` workflow typechecks, tests and publishes with `GITHUB_TOKEN`
   (`packages: write`, `contents: read`). It never runs with write access on a pull request.

Dry run by hand: Actions, Publish packages, Run workflow (leave "publish" unticked), or locally
`node scripts/github/publish-packages.mjs --dry-run`. A dispatch that ticks "publish" off `main` or a release
tag falls back to a dry run. Every PR touching `packages/shared`, `packages/sdk`, the script or the workflow
gets the dry-run job.

### Consuming

GitHub Packages requires authentication to install, even from a public repository. In the consumer:

```ini
# .npmrc
@moshebarami:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

with `NODE_AUTH_TOKEN` a personal access token that has `read:packages`. Never commit the token.

## Codespaces

GitHub, Code, Codespaces, Create codespace on `<branch>`; choose 4-core / 16 GB or larger. The container
(`.devcontainer/`) installs Node 26, pnpm 11.13 through corepack, Python 3, Luau 0.663, Rojo 7.7.0 and
Chromium, runs `pnpm install --frozen-lockfile`, and typechecks `packages/shared` as a smoke test. Details,
ports and the prebuild setting are in `.devcontainer/README.md`.

**CI runs Node 22; the container runs Node 26** (as the owner's Mac does). A pass in a Codespace is not the CI
verdict.

### What cannot run in the cloud

- Roblox Studio and everything that needs a live Studio session: plugin pairing, checkpoints, play tests,
  `packages/evals/owner-bench` runs.
- The local library gateway at `127.0.0.1:63747` (it runs on the owner's Mac).
- `wrangler dev` against real bindings and secrets (`.dev.vars` is gitignored; no secret enters the container).
- Anything that spends credits or money.

What does run: install, `pnpm -r typecheck`, `pnpm -r test`, the site and web builds, the Luau specs, the plugin
build (Rojo), the Python script tests, and Playwright against the built site.

## Verification status of this change (what was and was not checked)

Checked: every JSON file parses; the workflow and issue-form YAML parse; `node --check` on both scripts; the
unit tests; `apply-rulesets.mjs --dry-run` against the real repository (read-only GETs, printed the payload and
the green/red table); `publish-packages.mjs --dry-run` and `npm pack --dry-run` on both packages.

Not checked, and why: `actionlint` is not installed here, so the workflow is syntax-checked as YAML only; no
Docker here, so the Dockerfile and devcontainer were never built; no ruleset was sent (GitHub's acceptance of
the payload is untested until the first apply); nothing was published, so the GitHub registry's behaviour
(scope check, linking by `repository`) is untested; Dependabot's support for the pnpm 11 lockfile is untested;
the Dependabot schedule uses `Asia/Jerusalem` as an assumption about where the owner works.
