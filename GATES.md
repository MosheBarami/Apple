# GATES — Apple product completion

Every gate states one observable outcome. A gate counts as met only when its `CHECK:` exits zero
and its `EXPECT:` matches. A checked box with no evidence is unmet.

Scope: the engineering-only blockers in `docs/backlog/BLOCKERS.md` §D, plus the highest-value
unbuilt items in `docs/backlog/FEATURES.json`. Owner-blocked items (§A, §B, §C) are out of scope
and are tracked as handoffs, not gates.

---

## Closed in earlier sessions — re-verified here, not assumed

- [x] G1: The render payload cannot crash the workspace
    CHECK: cd apps/web && node --test src/lib/generative-ui/adapters.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=03ed208b5714c31e0e3cf210cf7d52bf21e0b83f36b90a1b32cac39575d0eb5c; output-bytes=653

- [x] G2: Conversation is not routed through the build harness, in English or Hebrew
    CHECK: cd apps/worker && node --test tests/conversational-routing.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=5b758f60894eeb77924e24b2eb062778d4aad85608bde6e39480c8cc6b6c4ee0; output-bytes=594

- [x] G3: An idle project stops holding a Durable Object open
    CHECK: cd apps/worker && node --test tests/poll-residency.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=274cb61aa4b03e87c91e8fa80ffce627da0ccaccbac96763ff39f2678dfb02c6; output-bytes=540

- [x] G4: The admin spend route can only ratchet down
    CHECK: cd apps/worker && node --test tests/spend-ratchet.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=43d8c963543ccb3f07d6e8b2aec3ed5c00d79757e3a74e276a0c2af51d0b3a0f; output-bytes=386

- [x] G5: A checkpoint restore reports what it actually put back
    CHECK: cd apps/worker && node --test tests/restore-fidelity.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=d39171b8c0152191c6cda787764ef961c62183c0fb7373f5ff1d9ddae1d8ffc3; output-bytes=627

- [x] G6: Asset provenance survives the step boundary
    CHECK: cd apps/worker && node --test tests/asset-provenance.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=3b283364a1504b0f76d26507027edbe6ff2554919a5b7e350a48c9e72fb96dcf; output-bytes=555

- [x] G7: No tool is offered that this deployment cannot run
    CHECK: cd apps/worker && node --test tests/asset-library-gating.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=53d00eadf6e84a090074ac9d51cc1ece4d5c87fe00b7b5695876e74f50d3a8b8; output-bytes=668

- [x] G8: Billing refuses an unsigned, forged, stale or tampered webhook
    CHECK: cd apps/worker && node --test tests/billing.test.mjs tests/billing-route.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=8ba3fb1cf7f65457ad309e8068be6fa590f64f3ac96aa57f688aca99c275c176; output-bytes=1660

- [x] G9: The door benchmark separates a correct door from the real broken outputs
    CHECK: cd packages/evals && node --test src/door-benchmark.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=39e213b3be6b871b6944df0b719a59085aa24b48d5cd75cfe3dd300d6ece646a; output-bytes=320

- [x] G10: The MLX adapter converts to PEFT with proven delta-W equivalence
    CHECK: cd packages/training && node --test src/mlx-to-peft.test.mjs src/build-dataset.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=f464c7983b23f13304819f645802f8e9bcf27500d52985c1d2b53a0044b090c1; output-bytes=1478

---

## Open

- [x] G11: The workspace mirrors correctly in RTL, not just the auth screen
    CHECK: cd apps/web && node --test tests/rtl-workspace.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=cf27c1be1cfe24ec804ea4044797b647497c51d3e6887ff242add80aaae68292; output-bytes=475

- [x] G12: Every user-facing surface has an explicit empty, loading and error state
    CHECK: cd apps/web && node --test tests/ui-states.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=3c87acb352346159816f6a1552433f3a37e44baf3a95726dfbb29dee4c248188; output-bytes=486

- [x] G13: A run's cost and context use are visible to the user while it happens
    CHECK: cd apps/web && node --test tests/run-meters.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=da4c21766259eef2f2e4e0a804d1837cee6a4d532448484bbf7b3aecc9b58762; output-bytes=591

---

## Whole-product gates

- [x] G90: The full suite passes
    CHECK: node scripts/gate-suite.mjs
    EXPECT: SUITE GREEN
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=be83d0b51d81f25b1ae364d555900425e67573b5f48a74efa533b75ccece9f77; output-bytes=45

- [x] G91: Every package typechecks
    CHECK: node scripts/gate-typecheck.mjs
    EXPECT: TYPECHECK CLEAN
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=a24e96ebf42e216f24b6a8156c34e4ccfc9fd4bbbabd2e6589cc8769d9da1900; output-bytes=31

- [x] G92: The landing and site E2E pass in every viewport
    CHECK: npx playwright test tests/e2e/landing.spec.ts --reporter=line
    EXPECT: 54 passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; EXPECT=matched; output-sha256=26c67de2c20e113d9c2b2381ad237886b110085f04b64a4cbd5bc29c5977cfa6; output-bytes=5649

---

## Evidence — measured 2026-09-14, not asserted

**16 gates, 16 met, 0 unmet, 0 abandoned** — verified by `gate-check.mjs --approve`, which executed
every `CHECK:` itself and recorded exit status, `EXPECT:` match and an output fingerprint per gate.
My own earlier runs of the same commands were not evidence; these are.

Whole-product gates as executed by the checker:

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
