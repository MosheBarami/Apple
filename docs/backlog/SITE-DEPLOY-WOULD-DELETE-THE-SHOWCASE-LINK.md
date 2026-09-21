# OPEN — the committed site cannot be deployed today without removing the Showcase link

**Measured 2026-09-21 by the infra lane, against the live origin and a clean clone of `1032707`.
Nothing was deployed. This file says why, and what the next site deploy must carry.**

## The measurement

`node infra/deploy-static.mjs --only site` uploads `apps/site/dist`. Built from a clean `git clone`
of HEAD — deliberately not from the shared working tree, which holds another lane's in-flight
edits — the built pages differ from what is live in exactly two places. Not "roughly"; the whole
file was compared and the residue named:

```
live /pricing/   =  built /pricing/
                    + <li><a href="/showcase">Showcase</a></li>      (live has it, HEAD does not)
                    - provided&nbsp;as-is.                            (HEAD has it, live does not)
                    ± one whitespace character where an Astro comment was
```

After normalising those two, the two files are byte-identical. `/` (the landing) is already
byte-identical live, and `/_astro/index.8vADMvid.css` is the same hash on both sides, so the live
site is otherwise current.

## Why that blocks the deploy

`https://apple.moshe-barami111.workers.dev/showcase` answers **200**. It is not an Astro route —
nothing under `apps/site/src/pages` builds it. It is an object in the Worker's D1 static store,
uploaded by `infra/deploy-showcase.mjs`, and the only thing that links to it is a nav entry that
exists **only in another lane's uncommitted `apps/site/src/components/Nav.astro`**. Their own
comment in that diff says what it is:

> `/showcase` — sixteen Roblox screens and six playable maps the deployed model built out of the
> product's own library … It was live and reachable from 2026-09-21 with not one link pointing at
> it, so the only way to see the single best piece of evidence this product has was to be told the
> URL by hand. The owner is fifteen and does not read git; an unlinked page is a page on one laptop.

So deploying the committed site today would fix a typographic widow on nineteen pages and, in the
same upload, delete the only link to the best evidence the product has from those same nineteen
pages. That is a net loss, and it would be undoing work that is already in production.

## The three things that were considered and refused

1. **Build from the shared working tree.** That is what puts the Showcase link in — and it would
   also ship every other uncommitted edit in `apps/site` and `apps/worker` that three lanes are
   mid-change on. The rule against it is not abstract: `/api/health` currently reports
   `buildSha 8f69139-dirty`, which is what a deploy from a dirty tree leaves behind.
2. **Commit the other lane's `Nav.astro` for them.** Taking someone's in-flight file and committing
   it under my name is worse than not deploying.
3. **`deploy-static.mjs --file`, hand-patching the nineteen live pages with the `&nbsp;` and
   nothing else.** This would work and it is the worst of the three: the live site would then
   correspond to no tree in the repository. `--file` is the rollback path; using it to hand-edit
   production is how "what is deployed" stops being a question anybody can answer.

## What the next site deploy has to be true of

The footer fix is committed (`1032707`) and will ship with the next honest site deploy. That deploy
is unblocked the moment the Nav lane commits `apps/site/src/components/Nav.astro`. At that point:

```
git clone the repo clean, or verify `git status --porcelain apps/site` is empty
pnpm --filter @golem/site build
node infra/deploy-static.mjs --only site
```

and then **verify against the live origin**, not against the build:

```
curl -s https://apple.moshe-barami111.workers.dev/pricing/ | grep -c 'href="/showcase"'   # expect 1
curl -s https://apple.moshe-barami111.workers.dev/pricing/ | grep -c 'provided&nbsp;as-is'  # expect 1
```

Both must be 1. One without the other means half this file was ignored.

## What the widow actually is, so nobody has to re-derive it

`apps/site/tests/rendered-typography.test.mjs` failed on the runner with *"19 text blocks end on a
stranded word, and the budget is 0"* — `"as-is."` alone on the last line of the footer on `/proof/`,
`/pricing/`, `/changelog/`, `/status/`, `/privacy/`, `/terms/`, `/404.html` and all eleven `/docs/`
pages, at 375px. It does not reproduce at 375px on macOS; it reproduces at 360px, because the font
metrics differ. Sweep widths rather than trusting the one in the report.
