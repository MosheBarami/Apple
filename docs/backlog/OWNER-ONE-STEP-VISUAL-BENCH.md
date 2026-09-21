# The one engineering row left, and the one action that unblocks it

`docs/FINISH-REPORT-100.md` §3.8 — the visual benchmark has not run since 2026-08-31.
Twelve of that report's thirteen rows are closed. This is the thirteenth.

## Why it cannot run

`packages/evals/src/visual-bench.mjs` drives `/api/admin/studio-op/{projectId}` — it asks a
live Roblox Studio to build the scene and render it. Measured 2026-09-21:

```
GET /api/admin/session-info/bfad1c53-…
  pluginConnected: false
  link: { paired: false, connected: false, lastSeenAt: null, pluginVersion: null }
```

The repo's own smoke run says the same thing in its own words and refuses to paper over it:

```
node infra/smoke.mjs → exit 0, 17 checks ok, 0 failed
  STUDIO: not paired to this project — build, checkpoint, restore and playtest
  were NOT exercised. This is reported, not worked around.
```

The offline half of the visual suite DOES run, every time, and is green: 62 tests in
`packages/evals/tasks-visual/grade-visual.test.mjs`, inside the 9,055. What has never run
since August is the live loop — build, render, critique, fix, re-render — because that half
needs Studio at the other end.

## The action

1. Open Roblox Studio with the Apple plugin installed.
2. Open the Apple panel. It will read **Not connected**.
3. In the web app: the project → **Connect Studio**. Enter the code the panel shows.
4. Tell the session. Then, and only then:

```bash
node packages/evals/src/visual-bench.mjs --project <uuid> --all
```

## The separate wall behind it, stated so it is not discovered later

`/docs/connect/` says, live, in its own first paragraph:

> Public plugin installation is currently unavailable. … New customers can use chat, but
> cannot build inside Studio yet. See plugin availability; there is no confirmed release
> date.

So this step unblocks the BENCHMARK, using the owner's own already-installed plugin. It does
not unblock Studio building for the public — that waits on Roblox restoring the plugin, and
no amount of work in this repository moves it.

The Creator Store page for asset `132128477945417` resolves 200 at
`https://create.roblox.com/store/asset/132128477945417`, so the listing itself is up.
