# GATES — Apple product completion

Every gate states one observable outcome. A gate counts as met only when its `CHECK:` exits zero
and its `EXPECT:` matches. A checked box with no evidence is unmet.

Scope: the engineering-only blockers in `docs/backlog/BLOCKERS.md` §D, plus the highest-value
unbuilt items in `docs/backlog/FEATURES.json`. Owner-blocked items (§A, §B, §C) are out of scope
and are tracked as handoffs, not gates.

---

## Closed in earlier sessions — re-verified here, not assumed

- [x] G1 The render payload cannot crash the workspace
    CHECK: cd apps/web && node --test src/lib/generative-ui/adapters.test.mjs
    EXPECT: fail 0

- [x] G2 Conversation is not routed through the build harness, in English or Hebrew
    CHECK: cd apps/worker && node --test tests/conversational-routing.test.mjs
    EXPECT: fail 0

- [x] G3 An idle project stops holding a Durable Object open
    CHECK: cd apps/worker && node --test tests/poll-residency.test.mjs
    EXPECT: fail 0

- [x] G4 The admin spend route can only ratchet down
    CHECK: cd apps/worker && node --test tests/spend-ratchet.test.mjs
    EXPECT: fail 0

- [x] G5 A checkpoint restore reports what it actually put back
    CHECK: cd apps/worker && node --test tests/restore-fidelity.test.mjs
    EXPECT: fail 0

- [x] G6 Asset provenance survives the step boundary
    CHECK: cd apps/worker && node --test tests/asset-provenance.test.mjs
    EXPECT: fail 0

- [x] G7 No tool is offered that this deployment cannot run
    CHECK: cd apps/worker && node --test tests/asset-library-gating.test.mjs
    EXPECT: fail 0

- [x] G8 Billing refuses an unsigned, forged, stale or tampered webhook
    CHECK: cd apps/worker && node --test tests/billing.test.mjs tests/billing-route.test.mjs
    EXPECT: fail 0

- [x] G9 The door benchmark separates a correct door from the real broken outputs
    CHECK: cd packages/evals && node --test src/door-benchmark.test.mjs
    EXPECT: fail 0

- [x] G10 The MLX adapter converts to PEFT with proven delta-W equivalence
    CHECK: cd packages/training && node --test src/mlx-to-peft.test.mjs src/build-dataset.test.mjs
    EXPECT: fail 0

---

## Open

- [x] G11 The workspace mirrors correctly in RTL, not just the auth screen
    CHECK: cd apps/web && node --test tests/rtl-workspace.test.mjs
    EXPECT: fail 0

- [x] G12 Every user-facing surface has an explicit empty, loading and error state
    CHECK: cd apps/web && node --test tests/ui-states.test.mjs
    EXPECT: fail 0

- [x] G13 A run's cost and context use are visible to the user while it happens
    CHECK: cd apps/web && node --test tests/run-meters.test.mjs
    EXPECT: fail 0

---

## Whole-product gates

- [x] G90 The full suite passes
    CHECK: node scripts/gate-suite.mjs
    EXPECT: SUITE GREEN

- [x] G91 Every package typechecks
    CHECK: node scripts/gate-typecheck.mjs
    EXPECT: TYPECHECK CLEAN

- [x] G92 The landing and site E2E pass in every viewport
    CHECK: npx playwright test tests/e2e/landing.spec.ts --reporter=line
    EXPECT: 54 passed

---

## Evidence — measured 2026-09-14, not asserted

All 13 gates met. Whole-product gates re-measured immediately before this line:

| gate | measured |
|---|---|
| G90 suite | `SUITE GREEN` — 1,874 passed, 0 failed |
| G91 typecheck | `TYPECHECK CLEAN` — 0 TS errors |
| G92 landing E2E | `54 passed` across desktop, laptop and mobile viewports |

The suite oracle is success-only by construction: grepping for `fail 0` would match a run where
five packages pass and one fails, so `scripts/gate-suite.mjs` sums every `fail N` and requires the
total to be zero as well as a zero exit. Proven able to fail: it reported `SUITE RED` on
`security.test.mjs` before that gate was closed.

## Handoffs — blocked on the owner, deliberately not gated

- `A1` Creator Store distribution is off, so nobody can install the plugin. Owner deferred.
- `A2` The shipped plugin artifact is VERSION 0.1.0 and predates 3D generation. Owner deferred.
- `C2` Generated geometry cannot persist as a Roblox asset. Needs an upload-route decision.
- Hosted LoRA serving: only `gemma-7b-it-lora` and `llama-2-7b-chat-hf-lora` accept an adapter, and
  both are weaker than the model production runs. Recorded in `docs/audit/TRAINING-V1-REPORT.md`.
