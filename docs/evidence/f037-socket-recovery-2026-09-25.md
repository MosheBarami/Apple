# F-037: closing socket recovery, source and deployed bytes

On 2026-09-24 at about 22:46 UTC, the web hook was changed to inspect the local socket state every
five seconds. A socket already in CLOSING or CLOSED is handed to the existing reconnect path even
if the browser never emits `onclose`. Network pings remain 25 seconds apart.

- The new F-037 guard in `apps/web/tests/lost-send.test.mjs` failed before the source change and
  passed afterward.
- The complete web suite passed 2,418/2,418, TypeScript checked without errors, and Vite built.
- A clean export of commit `129fe34` passed the same 2,418 tests and built successfully. It was
  deployed with `infra/deploy-static.mjs --only web`, which verified all 38 uploaded files.
- The served `workspace-C8NCcww0.js` and the clean export's built file had the same SHA-256:
  `dbc5ad05c06b791c2686ea2ff504455a6681424ae0268139f7882f97220d428e`.

The separate worker presence change was committed in `63d1696`: when a socket closes, the presence
frame sent to others excludes that socket even if the Durable Object still lists it. That commit
accidentally included unfinished, unrelated worker edits and failed CI typechecking. Corrective
commit `9538599` removed those edits while retaining the presence change. Its targeted tests passed
7/7; a clean export passed TypeScript and 4,167/4,167 worker tests. The deploy script verified
that `/api/health` serves `9538599`.

This proves both fixes are served. It does **not** prove the browser's stuck-CLOSING behavior is
gone: an authenticated, live project socket must still be observed to reconnect and resume its run
before F-037 can close.
