# CLOSED — the site is deployed, and both assertions this file named are 1 on the live origin

**Opened 2026-09-21 by the infra lane when the committed site could not be deployed without
deleting the only link to `/showcase`. Closed the same night, after the Nav lane committed.
The original measurement is kept below, because the reason it was refused is the useful part.**

## What closed it

`e85fe18` and `a8b45d3` committed `apps/site/src/components/Nav.astro`. That was the whole
precondition this file named: *"unblocked the moment the Nav lane commits"*.

```
git status --porcelain apps/site      -> empty
git rev-parse --short HEAD            -> 5b415d9
pnpm --filter @golem/site build       -> 20 pages, exit 0
```

Built from the working tree, which the original text permits **only** when `apps/site` is clean —
it was, and it was re-checked immediately before the upload rather than only before the build.
The built pages carried both things at once, which is what had been impossible:

```
apps/site/dist/pricing/index.html   showcase=1  as-is=1
apps/site/dist/proof/index.html     showcase=1  as-is=1
```

```
node infra/deploy-static.mjs --only site
done — 79 file(s)
verified — every page serves the bytes just uploaded
```

## Verified against the live origin, not against the build

The two assertions this file said the next deploy must satisfy — *"both must be 1; one without the
other means half this file was ignored"*:

| live page | HTTP | `href="/showcase"` | `provided&nbsp;as-is` |
|---|---|---|---|
| `/pricing/` | 200 | 1 | 1 |
| `/proof/` | 200 | 1 | 1 |
| `/changelog/` | 200 | 1 | 1 |
| `/status/` | 200 | 1 | 1 |
| `/privacy/` | 200 | 1 | 1 |
| `/terms/` | 200 | 1 | 1 |
| `/docs/` | 200 | 1 | 1 |

Before the deploy every one of those pages read `showcase=1 as-is=0`. `/showcase` itself still
answers 200 and `/` still answers 200, so nothing that was reachable stopped being reachable.

The nineteen-page footer widow — `"as-is."` alone on the last line at 360px — is fixed in
production. `/showcase`, the sixteen Roblox screens and six playable maps, is linked from every
page of the site rather than from one uncommitted file on one laptop.

## What the deploy then exposed, which is the part worth carrying forward

`node scripts/check-site-links.mjs` — the "Internal links resolve" step in CI's *Build site and
web* job — **failed with 20 broken internal links**, one per page, all `/showcase`. The Nav lane
had taught `apps/site/tests/links-resolve.test.mjs` about the page and not that script. Two
checkers over one fact; the one CI runs was the one nobody updated, and CI could not say so because
it has not started a job since 02:58.

Fixed in `658f75d`, as an exact-path exemption rather than a prefix, with the staleness check
extended to cover the new map. That step is green.

**The general lesson, which is not about `/showcase`.** Five CI steps need a built site and are
therefore invisible to `node scripts/ci-parity.mjs`, which never builds. This one was found only
because a deploy happened to require a build first. Until Actions is paid for, the way to see that
job is: build the site, then run `check-site-links`, `check-site-semantics`, `check-landing-budget`,
`check-app-bundle` and `check-asset-wall` by hand — or `node scripts/ci-parity.mjs --with-build`.

## The original refusal, kept

The three options refused on the first pass were: building from the shared working tree (would ship
three lanes' in-flight edits — `/api/health` still reports `buildSha 8f69139-dirty`, which is what
that leaves behind); committing the other lane's `Nav.astro` for them; and hand-patching nineteen
live pages with `--file`, after which the live site would correspond to no tree in the repository.
All three stay refused. The fourth option — wait for the lane, then deploy the committed tree —
is the one that happened, and it cost a few hours and nothing else.
