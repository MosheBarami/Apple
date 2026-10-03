# Agent prompt: merge the three approved capability tracks (stopped mid-merge 2026-10-02 ~17:50; merge aborted cleanly)

Status: worktree /Users/moshe/Developer/RbxAI-caps (branch `integration/caps`) is clean at 4b52b029; the half-done merge was
aborted. Better: base it on the CURRENT `integration/giant` (after the CI agent's commits) — e.g.
`git -C /Users/moshe/Developer/RbxAI-caps merge --ff-only integration/giant` first, or merge directly in the integration
worktree if nothing else is running there.

---

Merge three reviewed capability branches into the integration branch, resolve conflicts carefully, prove every suite green.

- node_modules: build them like /Users/moshe/Developer/RbxAI-integration has them (a real directory whose entries symlink
  to the main checkout's node_modules/*, except `@golem/*` pointing at THIS worktree's packages). NEVER run pnpm install.
- Never push/deploy/touch Studio. Explicit-path commits; messages end with the Co-Authored-By line.
- Owner directive generalize-not-patch: no subject-specific code; the harness informs and checks; never weaken tests.

MERGE, in order (each built on bf24ab00):
1. `worktree-wf_90b4b7a1-0cd-3` duplicate-named siblings (read refs / unique names, clone with repeated sources,
   benchClean empties a duplicate-heavy place; plugin change → release list).
2. `worktree-wf_90b4b7a1-0cd-2` self-check M1 behind SELF_CHECK (ledger, `look`, gate, claim audit). FIX while merging:
   studio-look.ts rejects native PNGs > 96 KB but the plugin caps at 240 KB (StudioCapture.luau MAX_PNG_BYTES): match it.
3. `worktree-wf_90b4b7a1-0cd-4` behaviour M4 behind BEHAVIOUR_V2 (AppleBehave, model_anatomy, add_behaviour, edit_script
   lint). It references session.ts AFTER_OBJECT, which phase 1 removed: just offer the new tools like any other.
DO NOT merge `worktree-wf_90b4b7a1-0cd-1` (asset-order; rejected: refused 2–5-part Models and imposed a 6-part taste floor).

Integration already has (structure wins): credits rules (failure streak once per step; targetless rule
`aim(call.arguments) || (call.name === 'run_luau' ? '' : '(no target)')`), phase 1 (no pre-model step, no requiredTool,
preview_library_models, dress_object, build ledger, subject-literal guards), phase 2 (browse_owner_library mode find),
world-building (pushHarness "[Harness note, not the user]" — route every new harness user-role push through it; asset-order
gate in model-rule.ts; clone at/along/within; edit_terrain path + waterLevel), Ember Rail web labels
(apps/web/src/components/ws/tool-vocabulary.ts — add plain labels for look, model_anatomy, add_behaviour and any new tool).

Pressure points: the tool-definition budget test (apps/worker/tests/run-loop-traps.test.mjs, floor 60,000; integration ~60,119)
— compress TEXT only, measure with esbuild (`./node_modules/.bin/esbuild src/tools.ts --bundle --format=esm --platform=node
--outfile=/tmp/t.mjs '--external:cloudflare:*'`, import, sum JSON of toolDefs(true)); never remove a tool/param/pinned
phrase; never edit the test. security.test.mjs A5 counts harness pushes (review each new one). Name-pinned tests: mcp,
verification-tools, web tool-vocabulary, phase-coverage, tools-for-mode, webtools-wiring; register tools in
packages/shared/src/index.ts, apps/worker/src/mcp.ts, apps/worker/src/run-idle.ts.

VERIFY with real counts: worker node --test + tsc; apple-plugin tests + build.mjs; components; evals security + full;
web; root tests; check-workspace-coverage; clean-test-tmp.
