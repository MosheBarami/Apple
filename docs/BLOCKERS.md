# Blockers

Mission §AG: when blocked by a human-only action, record the exact blocker and
continue every independent workstream. This file is that record. Each entry states
what is blocked, what proves it, and what continued anyway.

Last verified: **2026-09-01**.

---

## 1. AI Gateway has no credit — HUMAN-BLOCKED, and closed for this run

> **Owner ruling, 2026-09-01:** *"Do not buy credits. Do not ask again during this run. Classify
> real third-party model inference as HUMAN-BLOCKED. Continue all model-router architecture, mock
> testing, observability and non-paid work that does not require the credit. One blocked provider
> experiment does not block Phase IV."*
>
> So this is settled rather than pending. Nothing below is a request. The router's architecture,
> its mock-driven tests and its observability are all reachable without the credit and are not
> gated on this; only *real third-party inference* is. It will not be raised again this run.

**Status:** HUMAN-ONLY. Unchanged this session.

Every third-party model reachable through Cloudflare's Unified AI returns
`2021: Insufficient balance`. That error is itself the proof the architecture is
right: the request was recognised, routed and priced, so credentials and routing
are not the problem. The account simply holds zero prepaid AI Gateway credits.

Recorded in `docs/evidence/PHASE4-MODEL-ROUTING.md`.

**Why it stays blocked:** §AG forbids adding prepaid credits, enabling a new paid
service, or raising spend caps autonomously. §AC forbids buying capacity to make a
benchmark easier.

**Blocks:** DoD 14 (routing driven by measured results) and the measured half of
DoD 15.

**What continued anyway:** Workers AI models are free to this account and are what
production actually runs on. Routing, adapters and the mode system are all
exercised; only the *third-party comparison* is unbuyable.

---

## 2. Roblox Studio's MCP `screen_capture` stopped responding

**Status:** TOOLING DEGRADATION, worked around. Not a mission blocker.

`mcp__Roblox_Studio__screen_capture` timed out on every call this session — three
attempts, both with a manually-set camera and with the tool's own
`camera_position`/`look_at_position` arguments. `execute_luau` against the same
Studio instance stayed fully responsive throughout, so the connection is healthy
and the capture path specifically is not.

**Workaround, used for every image in this session:** drive the camera with
`execute_luau`, then capture the Studio window through the computer-use screenshot
tool and crop to the viewport rect. This produced every render behind the art and
UI findings, so no visual gate was left unmet by it.

**Cost of the workaround:** captures are screen-space rather than engine-space, so
they carry Studio chrome and depend on window geometry. Acceptable for review; not
suitable for an automated pixel-diff harness.

---

## 3. Two live account passwords are recoverable from git history — ROTATE THEM

**Status:** HUMAN-ONLY. Found by the independent security review, 2026-09-01.

| account | now supplied by | removed from source in |
|---|---|---|
| `e2e-test@golem.internal` | `GOLEM_E2E_PASSWORD` | `d8cfafa` |
| `load{i}@golem.internal` | `GOLEM_LOAD_PASSWORD` | `5b6896a` |

**The values are deliberately not written here.** They were, until 2026-09-01, in
this very table — which meant the document recording the leak was republishing it,
in a file tracked in the same repository whose history is the exposure. Worse, it
was invisible: `scripts/secret-scan.py` reports the working tree clean, because both
of its credential rules require a `password`/`secret` keyword followed by `=` or `:`
and then a QUOTED value, and a Markdown table cell has neither the assignment
operator nor the quotes. The register and the scanner disagreed and nothing said so.

Rotation does not need the old value. It needs the account, which is above.


Both are gone from the working tree and both are still in history. `d8cfafa` is
reachable from `origin/main`, `origin/HEAD`, this feature branch and all three
dependabot branches, so **anyone with read access to the private repository has
them**. The commits titled "get a real account password out of the source tree"
removed the source, not the exposure.

**A commit cannot un-leak a credential.** The only fix is rotating both accounts,
which requires the owner. History rewriting is not proposed: it would break every
existing clone and the credentials would still exist in anyone's local copy.

`scripts/secret-scan.py` does catch these — and emits `::warning::` with exit 0, so
CI reminds forever and never blocks.

## 4. Creator Store public distribution of the plugin

**Status:** HUMAN-ONLY GATE. Inherited, not re-verified this session.

Official plugin asset `132128477945417`. Public availability on the Creator Store
is a Roblox-side review/publish step, and §AG forbids publishing autonomously.

**What continued anyway:** the local `.rbxm` build, release pipeline and
version/compatibility diagnostics are all in place, and the paired-plugin path was
validated end to end in `f132425`. The install *path* is proven; only the public
listing is gated.

---

## 5. Dependabot: 27 advisories on the default branch

**Status:** OPEN, previously triaged, not re-triaged this session.

GitHub reports 27 advisories (7 high, 15 moderate, 5 low) on `main`, surfaced on
every push. `docs/SECURITY-TRIAGE-2026-08-31.md` records the prior finding that the
highs are build/dev exposure rather than production exposure, and that the one
reachable sink — a react-router open redirect — was fixed directly.

Dependabot PRs #2 (esbuild), #3 (astro) and #4 (vite) are open against `main`.

**Not a mission blocker,** but it is noise on every push and the triage is a day old.
It should be re-run before this branch merges.

---

## Not blockers, though previously believed to be

- **Persistence needed a published place.** It did not: the benchmark place is
  PlaceId `116648235878426`, GameId `10764643912`, PlaceVersion 2, with Studio API
  services enabled. A full save/restart/load round trip is now measured. See
  `docs/evidence/2026-09-01-persistence-roundtrip.md`.
- **A textured mesh could not take a biome tint.** It can, once the texture is
  cleared on the clone. See `docs/evidence/2026-09-01-detexture-ab.md`.
