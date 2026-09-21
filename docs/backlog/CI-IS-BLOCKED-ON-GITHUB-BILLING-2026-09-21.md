# OWNER-BLOCKED — GitHub Actions stopped running this repository at about 02:58 on 2026-09-21

**This is not a red build. No job started. Do not read the six red ticks on `dfc00bc` as six
failures — read them as a run that was refused.**

## What GitHub says

Every job on run `35555929120` (`dfc00bc`) reports `conclusion: failure` with `steps: []`, all six
completing between one and seven seconds after they were created, with no runner assigned. The
check-run annotation gives the reason:

> The job was not started because recent account payments have failed or your spending limit needs
> to be increased. Please check the 'Billing & plans' section in your settings

Re-run to confirm it is stable rather than a blip: `run_attempt=2`, identical result, identical
annotation. The repository is private, so its Actions minutes are billed.

## Why this matters more than any individual check

A job that never starts and a job that ran and failed are the same colour in the GitHub UI, the
same word in the API (`failure`), and the same tick in a PR. That is the exact shape this
repository keeps finding: **a failure to observe rendering as an observation.** Anyone reading
`dfc00bc` tomorrow without opening the annotations will conclude that six things broke at once, and
will go looking for a cause in the code.

There is no cause in the code. `steps: []` is the tell — a job that ran has steps.

## The last run that actually executed

`35554147167`, head `1032707`, 2026-09-21 02:14Z:

| job | result |
|---|---|
| Static checks | **success** |
| Secrets and dependencies | **success** |
| Build Studio plugin | **success** |
| Build site and web | **success** — first green in days; bundle, landing payload and asset wall all pass |
| Typecheck and tests | failure at **Root tests**. The `Tests` step — `pnpm -r test` — **passed**, which it had not done in this repository's recent history |
| Playwright smoke | cancelled, superseded by the next push. It has not concluded in any run tonight |

The two Root-test failures it found are recorded and one is fixed:

- `tests/gate-check.test.mjs` "two runs of an unchanged gate produce the same fingerprint" —
  fixed in `deb58b7` (the process id in Node's warning prefix was unnormalised), **and that fix has
  never been run by CI**, because the billing block landed first.
- `tests/playbook-claims.test.mjs` "every repository path the guidance names exists" — open, see
  `HANDOFF-AGENTS-MD-NAMES-FOUR-PATHS-NO-CLONE-HAS.md` in this directory.

So `deb58b7` and `dfc00bc` are **unvalidated on the runner**. They pass locally; that is not the
same claim and is not offered as one.

## What has to happen, and by whom

The account holder opens GitHub → Settings → Billing & plans and either clears the failed payment
or raises the Actions spending limit. **Nobody else can do this**, and no agent on this project may
enter payment details under any circumstances.

Until then every push will produce six red ticks that mean nothing. Before acting on any of them:

```
gh api repos/MosheBarami/apple/actions/runs/<id>/jobs --jq '.jobs[] | "\(.name) steps=\([.steps[]?]|length)"'
```

`steps=0` on every job means the run was refused. Anything else means it ran.

## One thing worth weighing when it is unblocked

Fifteen runs were created against this repository on 2026-09-21, eleven of them cancelled by the
next push — the `concurrency: cancel-in-progress` group doing its job while several lanes pushed in
sequence. Cancelled runs still consume the minutes they used before cancellation.

Two steps were also added to `Typecheck and tests` tonight (a site build and a Chromium download),
which is roughly 75 extra seconds per run. They are there because `pnpm -r test` runs
`@golem/site`'s 272 tests and 47 of them read the built site; the alternative was a package quietly
leaving the recursive test run, which `check-workspace-coverage.mjs` exists to prevent. Worth
revisiting only with the minute figures in front of whoever decides, not as a guess.
