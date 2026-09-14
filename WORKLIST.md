# Worklist — Apple

<!-- [ ] open · [x] done · [~] abandoned (a reason after — is REQUIRED, or it stays open) -->
<!-- Add HALT: <reason> on its own line to release the Stop hook immediately. -->
<!-- Drawn from docs/backlog/FEATURES.json (1,084 not-started) and docs/backlog/BLOCKERS.md §D. -->
<!-- Owner-blocked items (A1, A2, C2, hosted LoRA) are NOT here — they are handoffs, not work. -->

## In flight

- [x] w1: Conversation export — DO handler, worker route, JSON + Markdown, client download, gate
- [x] w2: Project rename — worker route, workspace UI, RLS already permits it

## Workspace — the surfaces a daily user touches

- [x] w3: Command palette — one keystroke to every action, searchable, keyboard-only
- [x] w4: Keyboard shortcuts — a real map, discoverable from the palette, no browser collisions
- [x] w5: Conversation search — across a project's messages, server-side, not a client filter
- [x] w6: Conversation archive — hide without deleting, restore, and a way to see archived
- [x] w7: Message edit and resend — correct a prompt without retyping the thread
- [ ] w8: Stop and retry a run from the workspace, not only from the plugin
- [ ] w9: Drafts — an unsent message survives a reload

## Memory

- [ ] w10: Memory viewer — what Apple believes about this project, readable
- [ ] w11: Memory editor — correct or delete a belief, with the change taking effect next run

## Billing — the SaaS the owner asked for

- [ ] w12: Plans and credits surfaced in the product, not only in the webhook
- [ ] w13: Usage meter against plan allowance, visible before the run not after
- [ ] w14: Upgrade and downgrade path through the UI, with the entitlement recomputed

## Quality

- [ ] w15: Error taxonomy — every failure the user can see says what to do next
- [ ] w16: Empty, loading and error states re-audited across the new surfaces above
- [ ] w17: The whole suite, typecheck and E2E green, recorded as gate evidence
- [~] w18: Apply infra/supabase/migrations/0004_project_archive.sql to the live Supabase project — needs Supabase service credentials or dashboard access this session does not have — owner must run the SQL
