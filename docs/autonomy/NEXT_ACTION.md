# NEXT ACTION (V3)

Pre-V3 queue archived in `archive/pre-v3/NEXT_ACTION.md`. Order follows `v3/Apple_RbxAI_EXECUTION_V3.md`.

1. **Stage 1 — product spine (G01, G03, G08 language).**
   a. Collapse customer models to one `Apple vX` identity (compat bridge for stored `apple`/`apple-max`
      ids); remove tier/model picker and the outside models; fix stale `APPLE_MODEL_ID`.
   b. Remove Plan/Agent/Autonomous from web UI and site; planning becomes an internal stage.
   c. Composer hard gate: locked until the correct place is paired and connected, and the same refusal
      server-side in SessionDO `chat`; Stop stays independent.
   d. English-only replies (drop reply-language preference).
   e. Jev router module with deterministic fallback (self-activates once Q-025 is done).
2. **Stage 1 — run lifecycle (G10):** pause on Studio disconnect + explicit Continue; mid-run steering
   queued to the next safe boundary; Stop acknowledged when the run has actually ended.
3. **Stage 2 — catalog (G05/G06):** build the plugin/worker consumer of `/v1/native-readiness`
   (`rows[].readiness`), then a Worker/R2 delivery path that does not need the owner's Mac.
4. Reconcile the 329 inherited dirty paths per area as each stage touches it (commit what is verified,
   leave the rest; nothing discarded — backup in `.autonomy/backups/codex-wip-2026-09-28/`).
5. Retire training from the active product (workspace/CI membership, dashboard LoRA pages, lab lanes).
