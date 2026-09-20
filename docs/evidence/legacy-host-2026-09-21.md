# The legacy host, probed live — 2026-09-21

The ledger carried `two-live-workers` as PARTIAL: *"Decide the legacy worker's fate deliberately —
retire it or pin it as a read-only redirect — and record the decision; do not delete it silently."*

**The decision was already made and is already deployed.** It is argued in a comment block in
`apps/worker/src/index.ts` ("THE OLD NAME STOPS SERVING THE PRODUCT") and guarded by
`apps/worker/tests/legacy-host.test.mjs`. What was missing is evidence that the deployed worker
does what the source says, which is a different claim — the source has been right and unshipped
before.

Probed against the live origins, 2026-09-21:

```
GET https://golem.moshe-barami111.workers.dev/            308 -> https://apple.moshe-barami111.workers.dev/
GET https://golem.moshe-barami111.workers.dev/pricing     308 -> https://apple.moshe-barami111.workers.dev/pricing
GET https://golem.moshe-barami111.workers.dev/app         308 -> https://apple.moshe-barami111.workers.dev/app
GET https://golem.moshe-barami111.workers.dev/privacy     308 -> https://apple.moshe-barami111.workers.dev/privacy
GET https://golem.moshe-barami111.workers.dev/terms       308 -> https://apple.moshe-barami111.workers.dev/terms

GET https://golem.moshe-barami111.workers.dev/api/health  200, no redirect
```

`Strict-Transport-Security: max-age=31536000; includeSubDomains` is present on both hosts.

That is the intended shape and it holds in production: **pages redirect, APIs do not.** A 308 on
`/api` would turn an authenticated POST into a GET at the new host and drop the body, so the old
name keeps answering programmatic traffic while it stops showing the retired brand to a person.
Nothing was deleted, which is what the owner asked for.

`/api/health` on the legacy host reported `buildSha 3568b05`; the apple host reported `769f284`.
Two different builds, both live. That is not a defect of this decision — the redirect is present in
both — but it is the reason the next person should not read "golem answers 200" as "golem is a
mirror of apple". It is a separate, older build that still answers the API surface.

## What this does not establish

No probe here covers an installed Studio plugin or the Luau SDK. The comment in `index.ts` records
that both were checked one by one at the time the redirect shipped and that every shipped client
already points at the apple host. I did not re-verify that; it needs the plugin, and the plugin
appeal is owner-blocked until 2026-10-19.
