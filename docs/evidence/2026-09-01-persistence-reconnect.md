# Leaving and coming back, against the deployed worker

**Date:** 2026-09-01 · Master mission §23: *"A real SaaS user will refresh, close tabs,
lose Wi-Fi, restart Studio, leave a job running, and return later. The product must
survive normal reality."*

Run against `https://golem.moshe-barami111.workers.dev` — the live Worker, the live
SessionDO, the live database. No fixtures. **It costs no Credits**, which is why it was
runnable with the daily allowance already exhausted: only starting a run spends quota,
and this starts none.

## What was checked, and what came back

### 1. What a workspace is handed on open

```
hello keys      : type, sessionId, studioConnected, quota
sessionId       : b0766f21-7028-47cc-b9ab-e19198b144d2
studioConnected : true
creditsRemaining : 0
```

Quota is in the FIRST frame, before anything is typed. A user returning to an exhausted
allowance learns it from the room they walk into rather than from a failed send.

### 2. The conversation is not in the socket

**32 messages persisted**, served from `GET /api/projects/:id/messages` — a different
transport from the websocket that produced them. The most recent is the quota-exhaustion
reply from earlier today, verbatim:

> *"That used the last of your Credits for today. Everything so far is saved — they
> refill at midnight UTC."*

Which is the claim in that message being checked by the thing it is a claim about.

### 3. Undo points outlive the session that made them

**19 checkpoints**, the oldest from **2026-08-30** — two days and many sessions before
this one. Each carries its label, script count and instance count.

### 4. Reconnect

A second websocket, exactly as a browser reload makes:

```
hello again     : yes
sessionId       : b0766f21-…  (identical to the first)
studioConnected : true
```

The session is addressed by project id, so a reload rejoins rather than forking. The
Studio pairing survives the browser going away — which is the property that matters, as
the plugin's connection has nothing to do with the tab.

### 5. `resume` is answered

```
run_state returned : yes
run                : null
```

Worth checking specifically. `resume` was **declared in the protocol and silently
unhandled** — a returning client asked what was running and got nothing back, forever.
It is answered now, and `run: null` is the correct answer here because nothing is in
flight. A returning user with a live run gets the run.

### 6. Nothing shifted

**32 messages after reconnect, unchanged.** Quota state identical
(`creditsUsedToday: 60`, `resetsAtIso: 2026-09-02T00:00:00.000Z`).

## Disposition

**§23's refresh-safe state, persistent conversation, persistent checkpoints and
reconnect: PROVEN against the deployed product.**

**Not covered here**, and not claimed: Studio disconnecting mid-run and recovering;
cancellation and the stop signal; a long-running task outliving the UI session. Those
need a run in flight, which needs Credits. The quota resets at 2026-09-02T00:00:00Z and
§25 forbids raising it.

Also not covered: this drove the API directly rather than a signed-in browser. The
browser half of the golden E2E stays open for the reason recorded in
`2026-09-01-browser-drew-a-real-frame.md` — reaching it means typing an account
password into a login form, which this environment does not do with credentials.

Transcript: `2026-09-01-reconnect-transcript.txt`.
