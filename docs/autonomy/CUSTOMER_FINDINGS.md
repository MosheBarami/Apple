# CUSTOMER FINDINGS

Observations from using the REAL product. Not fixes, not rationale.

Line format (parsed by `scripts/autonomy-review-gate.py` — keep it exact):

```
- [open|closed][critical|high|medium|low] F-NNN: one-line observation — evidence: <where>
```

A finding is closed only by evidence that the customer-visible behaviour changed in production, never
by a code change alone. Closing a finding appends `— closed <UTC> by <evidence>`; the line is never
deleted.

## 2026-09-22 — first signed-in production session (owner account, Chrome, Studio Place1.rbxl)

Context: project `81b7c2f8-cb7d-45e6-875a-b4cfa883182d` "Acceptance 22 Sep (disposable)", worker
`bd6ab34-dirty`, Apple Studio plugin 1.0.0 loaded in Studio, edits allowed for the connection.

- [open][critical] F-001: A real Agent build ("Make me a nice old-fashioned street lamp I can copy around my town.", make-from-scratch) died twice with nothing built: the model's create_instances call hit the 6500-token output ceiling mid-JSON, the partial call ran and failed, and the next model call failed in ~300 ms; customer saw "That step failed on our side" and a refund — evidence: runs 0afe6149-57f7-471d-a295-7b36e294bc24 and 23b20096-d900-416e-b0af-65380daee016 (admin build log: outcome error, opsFailed 1, outputTokens 6500 == gateway agent maxTokens)
- [open][high] F-002: "Connect Studio" — the one step a new customer must take — is reachable only inside the project's "..." menu; the workspace shows no connection state or connect affordance — evidence: read_page of /app/projects/81b7c2f8… lists no visible Connect control; found only via find() inside the Project actions menu
- [open][high] F-003: While a run is live the turn shows "Regenerate" and the composer shows Send (not Stop); after sending via the asset-source dialog the composer still held the sent prompt, so one Enter would start a duplicate run — evidence: DOM snapshot article[data-run-state=live] text "…Planning Regenerate"; textarea.value equal to the sent prompt
- [open][medium] F-004: The app's non-workspace screens and toasts use green (dashboard "+ New project", teal ACTIVE chip, green toast dot, green checks in the Studio dialog) while the workspace uses blue/violet — the product does not look like one system — evidence: screenshots of /app and the Studio connection dialog, 2026-09-22 ~21:08 IDT
- [open][medium] F-005: The three welcome suggestion buttons have no accessible name — evidence: read_page interactive tree shows bare `button [ref_44] [ref_46] [ref_48]`
- [open][medium] F-006: The Project actions menu stays open after an item is chosen, overlaps the conversation, and ignores Escape — evidence: screenshots after closing the Studio dialog and after pressing Escape
- [open][medium] F-007: During a 90-second model step the thinking header stayed on "Inspecting the project" although that step had finished; nothing told the customer the build was being written — evidence: run 0afe6149 timeline (viewport_info ok at +37 s, model call 90 s, header unchanged)
- [open][medium] F-008: The web says "Paired to a place Studio has not named — Studio has not reported which place it has open" while the plugin dock shows Place1.rbxl — evidence: admin session-info link.place = null; dock screenshot "Place1.rbxl"
- [open][medium] F-009: A new project starts with Autonomous switched ON — evidence: aria-checked=true on the composer switch immediately after project creation
- [open][medium] F-010: Production still tells customers "Public installation unavailable — see status" in the Studio dialog although the Creator Store listing is live — evidence: Studio connection dialog screenshot; toolbox-service probe 200 at 2026-09-22T18:02:59Z with controls
- [open][medium] F-011: The public site in production still ships the green horizon canvas, a green accent, and three different explanations of why the plugin cannot be installed — evidence: docs/evidence/2026-09-22-browser-qa/*.png; site-state audit (prod index.html carries canvas.horizon and --accent:#00d492)
- [open][medium] F-012: The Creator Store serves Apple Studio 1.0.0 (published 2026-09-19, 5 scripts); the current plugin source carries the native Studio viewport capture and bounded Run-mode control that the product describes — store customers get the older capability set — evidence: toolbox-service scriptCount 5, updatedUtc 2026-09-19T18:13:21Z; apps/apple-plugin/src has 6 scripts incl. StudioCapture.luau
- [open][low] F-013: The failure sentence is printed twice in one turn (message body and outcome line) — evidence: DOM text of the ended run 0afe6149
- [open][low] F-014: The Studio dialog says "Enable edits in the plugin before asking Apple to change your place" when edits are already enabled for the connection — evidence: dialog text while the dock read "Access: edits allowed for this connection"
- [open][low] F-015: Project-creation copy uses fantasy wording ("Summon a new project", "Project summoned") that no Roblox creator would expect — evidence: dialog title and toast text
- [open][medium] F-016: Sentry APPLE-WORKER-3 — the billing webhook on the retired golem host answered 503 642 times (2026-09-20..21); where the payment provider's webhook actually points, and whether any subscription event was lost, is unverified — evidence: https://moshe-s6.sentry.io/issues/APPLE-WORKER-3
- [open][low] F-017: Supabase security advisor: leaked-password protection is disabled for Auth; seven SECURITY DEFINER functions are executable by anon/authenticated (the outbox ones are token-gated) — evidence: get_advisors(security) 2026-09-22T17:43Z

## What worked (kept so a regression is noticed)

- The historical propose_plan trap is gone in production: the model's plan omitted a verifier, the
  product appended `inspect_visually` with the note "Added automatically: a plan with no check proves
  nothing, so this run verifies what it built.", and the run moved on to execution (run 0afe6149).
- Pairing worked first time: 6-character code, "Connected · Acceptance 22 Sep (disposable)", and an
  explicit "Allow edits for this connection" consent step in the plugin.
- Refund honesty: both failed runs returned every Credit and said so ("asked 28, returned 28").
- A checkpoint (`snapshot`) was taken before the first Studio operation of each run.
