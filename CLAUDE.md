# Super GSD Orchestrator

> **START HERE — `docs/autonomy/`.** The most important artifact in this repository is the owner's
> autonomy research (`docs/autonomy/RESEARCH-REPORT.md`) and the mission it ends in
> (`docs/autonomy/OWNER_PROMPT.md`). Read `docs/autonomy/README.md`, `MISSION.md`, `CURRENT_STATE.md`
> and `NEXT_ACTION.md` before anything below. The hard safety envelope is enforced by
> `.claude/hooks/autonomy_guard.py`; `touch .autonomy/STOP` freezes every mutating tool.

> Drop this into your project's CLAUDE.md (append or replace the GSD section).
> Teaches Claude Code the autonomous loop, checkpoint survival, and token efficiency.

## BEHAVIORAL GUIDELINES - Karpathy principles

Four rules override everything else. They are derived from Andrej Karpathy's
observations on LLM coding pitfalls. If these guidelines conflict with anything
later in this file, these guidelines win.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.
- State assumptions explicitly. If uncertain, ask rather than guess silently.
- If multiple interpretations exist, present them. Do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.
- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style even if you would do it differently.
- If you notice unrelated dead code, mention it in DEVIATIONS. Do not delete it.
- Remove imports, variables, and functions that your changes made unused; do
  not remove pre-existing dead code.
- Test: every changed line should trace directly to the user's request or the
  current plan task.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.
- Transform vague tasks into verifiable goals before coding.
- For multi-step tasks, state a brief plan with per-step verification.
- Strong success criteria let the orchestrator loop independently. Weak
  criteria force clarification after every step.

**Enforcement mechanism inside SGSD:** these four principles are mechanically
enforced by the ATC Gate, the Nyquist validation gate, and the surgical
constraint injected into every executor prompt. Violations show up in
DEVIATIONS and phase-level violations can block phase closure.

**Further reading:** <https://github.com/forrestchang/andrej-karpathy-skills>

## PERMISSIONS — CRITICAL FOR AUTONOMOUS MODE

**NEVER ask the user for confirmation, approval, or permission during autonomous execution.**

When the user says "go" or the orchestrator is looping:
- Do NOT ask "Should I proceed?" — just proceed
- Do NOT ask "Is this okay?" — it's okay, you're in auto mode
- Do NOT present options and wait — pick the best option and execute
- Do NOT pause between phases for approval — advance immediately
- Do NOT ask before committing — commit after every unit, always
- Do NOT ask before reading/writing files — just do it
- Do NOT ask before running shell commands — just run them
- Sub-agents: include `mode: "bypassPermissions"` or `mode: "auto"` when spawning

The ONLY time to ask the user anything:
1. A genuine blocker that requires human judgment (not a yes/no — a real decision)
2. The user explicitly said "interactive" mode
3. Authentication credentials are needed (API keys, passwords — but NOT for this framework)

**If in doubt: DO IT, don't ask.** The user chose autonomous mode. Respect that choice.

## NOTIFICATION POLICY — REQUIRED FOR AUTONOMOUS MODE

The operator wants phone push notifications via the Claude mobile app
(`PushNotification` tool — sends desktop notif + pushes to phone if Remote
Control is connected).

**Send a `PushNotification` (status: "proactive") at EVERY one of these events:**

1. **Phase close** — every time a phase reaches its terminal verdict (PASS,
   PASS-WITH-DEFERRED-N, SKIPPED-WAITING-FOR-UPSTREAM, BLOCKED). One push per
   phase. Format: `"P{N} {verdict} — {one-line summary, <120 chars}"`.
2. **Milestone close** — when ALL phases of a milestone reach terminal verdicts.
   Format: `"v{X.Y} ALL-PHASES-CLOSED — {N}/{N} phases, {self_test_total} green, {deferred_count} deferred"`.
3. **Stop event** — for ANY of the 3 valid exit conditions:
   - all-phases-complete (entire roadmap done)
   - hard-blocker (real blocker; runtime cannot continue)
   - user-stop (operator said pause/stop)
   Format: `"STOP: {reason} — {one-line context}"`.

**Do NOT push on:**
- Routine commits within a phase (too noisy).
- Individual self-test runs (covered by phase close).
- Status checks the operator just initiated (they're watching).
- Re-runs of already-completed work.

**Format rules:**
- Under 200 chars (mobile OSes truncate).
- One line, no markdown.
- Lead with the verdict/outcome, not the noun.
- "P98 PASS — harness component substrate, 21/21 self-test" beats "Phase 98 done".

If `PushNotification` returns "push wasn't sent", that's expected — it means
Remote Control isn't connected. Continue normally; don't retry.

## Super GSD — Autonomous Execution Engine

This project uses **Super GSD** for token-efficient autonomous execution.
State lives in `.planning/`. SGSD memory lives in `.planning/memory/`.

### On Every New Session — DO THIS FIRST

1. **Check for checkpoint:** `Read .planning/ORCHESTRATOR-CHECKPOINT.md` — if found, resume from `next_unit`. Don't ask, just go.
2. **Read state:** `Read .planning/STATE.md` (frontmatter only, offset 0, limit 30) — active milestone, phase, progress.
3. **Cascade read (DLB-03):** Before planning any phase, read `.planning/PROJECT.md` core-value + `.planning/milestones/{active_milestone}/INTENT.md` + last completed phase `SUMMARY.md`. For the first phase of a milestone, INTENT.md alone. This is mandatory; skipped cascade = phase drift.
4. **Check memory:** `sgsd-recall "session start current state"` — pull relevant context.
5. If user says "go" / "auto" / "continue" / "run" → enter auto mode immediately. No confirmation.

### What the User Says → What You Do

| User Says | You Do |
|-----------|--------|
| "go" / "auto" / "run" / "continue" / "/sgsd-orchestrate auto" | **Enter AUTO MODE** — start the loop, no questions |
| "next" | Execute ONE unit, then stop and report |
| "status" / "where are we?" | Read STATE.md frontmatter, report position |
| "stop" / "pause" | Write checkpoint, stop looping |
| "deliberate" | Run /sgsd-deliberate for strategic decision |
| "audit tokens" | Run /sgsd-token-audit --quick |
| **Planning intent detected** (see below) | **Run /sgsd-triage first** — let it route to deliberate/orchestrate/muda |

### Planning-intent detection (auto-invoke /sgsd-triage)

When the operator's message contains planning or figuring-out intent, invoke
`/sgsd-triage` before doing any other work. Do not improvise your own planning;
the triage skill runs the planning pipeline, classifies the result, and routes
to the right continuation. It respects DELIBERATION-FLOOR.

**Auto-invoke triggers (high confidence):**

- Starts with "I'm thinking about...", "I want to figure out...", "How should we...",
  "What if we...", "Let's plan...", "Let's explore...", "Design...",
  "Architect...", "Evaluate...", or "Should we..."
- Describes a problem or ambition without asking for immediate execution.
- Mentions tradeoffs, alternatives, or multiple valid approaches.
- Asks a research-style question the operator clearly wants thought through.

**Do not auto-invoke when:**

- The operator asks a direct factual question.
- The operator explicitly requests execution.
- The operator is mid-build and asking for a specific code change.
- The question is trivial and can be answered inline in under five minutes.

**Ambiguous?** Do not auto-invoke. Ask: "sounds like a planning question - want
me to run /sgsd-triage?"

### Auto-mode orchestration contract

Canonical command: `/sgsd-orchestrate auto`. Treat `/SGSD-orchestrate auto` as
the same operator intent; slash command implementations may still be lowercase.

Current worker connection and provider contract:

- Orchestration defaults to Fable. Explicit operator model selection wins over
  legacy model literals in this document.
- Codex with resolved model/effort owns phase research, planning, plan-check, verification,
  source-changing execution, spec-compliance review, per-dispatch ATC,
  phase-level ATC, MUDA, and other Codex-owned gates.
- Sonnet is not a fresh-clone default provider and is not a Codex fallback. If a
  later legacy line says to dispatch Sonnet for one of those surfaces, treat it
  as stale and route through Codex instead.

Every Codex dispatch must follow `/sgsd-workers`: start the existing wrapper
with Bash `run_in_background: true` and a checkpointed per-unit
`SGSD_WORKER_OWNER`; poll its project inbox, answer approved context, escalate
operator-only authority, and await wrapper exit/report validation. Preserve
worker UUIDs, task handles and report paths across compaction; discover live
workers before launching replacements. A queued/applied reply is not a passed
gate. SGSD worker mode is retained App Server + `danger-full-access` + approval
`never`; advisory no-edit roles remain workflow contracts, not OS isolation.
Never use `--last`, silently change models/auth, or start another Fable to answer
a question. The full supervision procedure overrides legacy blocking examples.
Supervision is priority-first: before launching any unit or advisory wave,
prepare absolute control/project paths, owner/dispatch bindings, fresh report
paths and expected schemas/validators. Check owned inboxes before lengthy reads
or report work. Pending questions preempt failed-peer investigation;
defer unrelated diagnostics until the question is answered or escalated.
An operator-only worker authority question (or its response deadline) is also
an explicit exception to the ordinary board/challenge recovery requirement:
escalate directly and do not spend on another model round to recreate missing
permission. Continue other authorized work; otherwise checkpoint for the operator.

In auto mode, SGSD owns the whole delivery loop. Phase-close summaries,
milestone-close summaries, cost summaries, research completion, planning
completion, and "operator review" summaries are intermediate states. Do not stop
there; write evidence and immediately continue with a tool call.

Canonical phase path:

1. Read state, roadmap, checkpoint, and config.
2. Ensure phase CONTEXT exists. If missing in auto mode, synthesize it from
   roadmap/state/checkpoint/audit evidence instead of pausing for discussion.
3. Research with Codex GPT-5.5/xhigh via SGSD's Codex wrapper. Claude should
   orchestrate the research prompt and process the report, not perform the
   research itself.
4. Run VTP enrichment after research when `.planning/config.json` enables it.
   If VTP MCP is absent, write an explicit degraded/bypass reason and continue.
5. Plan with Codex GPT-5.5/xhigh. The planner must consume RESEARCH plus VTP
   enrichment or the explicit VTP_STATUS row.
6. Run a quick Codex plan review applying ATC + MUDA before execution. NOGO
   routes back to Codex planning for a revised final draft.
7. Execute code only through `codex-executor [gpt-5.5/xhigh]`. Treat each
   executor dispatch as a fresh subagent-driven-development implementer run:
   bounded prompt, no inherited Codex context, one task/plan at a time, and no
   parallel Codex file writers in the same workspace. If Windows
   Codex cannot read files (`CreateProcessAsUserW`, `error 216`, or equivalent),
   use Codex read-pack patch mode before treating it as a blocker.
8. Run Codex spec-compliance review over raw artifacts before ATC: PLAN,
   Codex executor report, git diff, and verification output. Do not let the
   spec reviewer rely on the executor's own summary.
9. Verify and run required gates through Codex/local SGSD gate scripts, commit,
   close/advance phase or milestone, and immediately continue until no roadmap
   work remains.

Blocker recovery policy:

- Ordinary Codex blockers, malformed reports, plan uncertainty, missing local
  context, and implementation dead ends must not stop the loop immediately.
- First invoke the SGSD board (`sgsd-ceo` with the minimal board roster from
  `super-gsd/registry/board-members.yaml`) and ask for a concrete recovery
  decision.
- Then send the board decision to a separate Codex review/challenge instance.
- Choose the safest actionable recommendation, log the decision, and resume the
  loop.
- Codex host read failures are routing problems, not operator decisions, while
  `super-gsd/scripts/codex-patch-executor.sh` can run. Claude may assemble the
  bounded read-pack and apply Codex's unified diff; Claude must not author the
  code delta.
- Stop only when the user explicitly pauses/stops, all roadmap work is complete,
  or board plus Codex recovery cannot produce a safe local path because the
  remaining blocker is credentials, destructive ambiguity, external access, or
  another operator-only boundary.

---

## AUTO MODE — The Engine

### How The Loop Works

Claude Code gives you another turn as long as every response includes a tool call.
**Text-only = loop dies.** This is the fundamental mechanic.

**Therefore: in auto mode, EVERY response includes at least one tool call.**

### The Loop (Token-Optimized)

```
repeat {
  // 1. READ STATE (~200 tokens)
  Read .planning/STATE.md frontmatter

  // 2. CLASSIFY (~50 tokens)
  Derive classifier result from plan frontmatter/cache or run Codex/local check
  → { complexity, model: "codex|opus", atc_tier, deliberate }

  // 3. SELECT CONTEXT (~100 tokens)
  Derive context selection from plan evidence + sgsd-recall terms
  → { sgsd_recall_queries, file_reads, scripts_to_check }

  // 4. QUERY SGSD MEMORY (~200-600 tokens)
  sgsd-recall for each query → relevant decisions, patterns, scripts

  // 5. COMPOSE PROMPT (~500 tokens)
  Build agent prompt: compressed plan + overlay + SGSD memory results

  // 6. DISPATCH
  Agent(model: "{from classifier}", prompt: "{composed}")
  → Structured report (<300 words)

  // 7. PROCESS RESULT
  Parse: FILES_CHANGED, VERIFICATION, DEVIATIONS, BLOCKERS, SCRIPTS_CREATED, ONE_LINER

  // 8. CURATE LEARNINGS
  If SCRIPTS_CREATED → sgsd-curate to scripts/
  If DEVIATIONS contain new patterns → sgsd-curate
  If verifier found anti-patterns → sgsd-curate

  // 9. UPDATE STATE
  Update STATE.md progress
  Log to .planning/metrics/token-log.jsonl

  // 10. GIT COMMIT (NEVER skip)
  git add {specific files}
  git commit -m "feat({phase}-{plan}): {ONE_LINER}"

  // 11. LOOP
  Read STATE.md → tool call → loop continues
}
```

### The Golden Rule

**ALWAYS chain the next action as a tool call.**
- WRONG: "Phase 27 complete!" (text-only → loop dies)
- RIGHT: "Phase 27 complete" + `[Read .planning/STATE.md]` (loop continues)

### Exit Conditions (ONLY these 3)

1. **All phases complete** → text-only: "All phases done."
2. **Exhausted blocker** → board plus separate Codex challenge cannot produce a safe local path
3. **User says stop/pause** → write checkpoint, stop

**Nothing else is a valid exit.** Not phase boundaries. Not milestone boundaries.
Not "context is heavy from setup." Context percentage is observability only;
runtime compaction + external state are the context-management mechanism. ONLY these 3.

### Dispatch Rules (first match wins)

| # | Condition | Action | Agent | Model |
|---|-----------|--------|-------|-------|
| 0 | Auto mode entering milestone AND no `MILESTONE-READINESS.md` (or stale) | Run readiness audit through Codex/local checks | codex-readiness | gpt-5.5/xhigh |
| 0.5 | READINESS status = BLOCKED or PARTIAL AND user said "go" | Auto-continue on DEGRADED-PATH if one exists; pause only when no runnable path remains | — | — |
| 1 | Phase not discussed | AUTO MODE: synthesize CONTEXT.md from roadmap/state/checkpoint evidence; INTERACTIVE/NEXT: suggest /gsd-discuss-phase | orchestrator | — |
| 2 | Phase needs RESEARCH.md | Dispatch Codex research via `codex-exec.sh` | codex-research | gpt-5.5/xhigh |
| 2.5 | Research complete and VTP enabled | Run optional VTP enrichment if configured, otherwise write degraded row | VTP/Codex synthesis | codex |
| 3 | Phase needs PLAN.md | Dispatch Codex planning | codex-plan | gpt-5.5/xhigh |
| 4 | Plans need checking | Dispatch Codex plan-check | codex-plan-check | gpt-5.5/xhigh |
| 4.2 | Plan check passed | Run Codex plan-final ATC + MUDA review | codex-exec.sh | gpt-5.5/xhigh |
| 4.5 | About to make FIRST executor dispatch of a phase | Run phase-readiness re-probe | codex-readiness | gpt-5.5/xhigh |
| 4.6 | Phase-readiness returned DRIFT | Continue on deterministic degraded/local path; checkpoint only if no runnable executor path remains | — | — |
| 5 | Pending tasks exist | Dispatch serial SDD Codex executor with `{planId}-CODEX-FILES.txt` fallback allowlist | codex-executor.sh | gpt-5.5/xhigh |
| 5.1 | Codex executor hits Windows file-read block | Run Codex read-pack patch executor; Codex authors unified diff, SGSD applies it | codex-patch-executor.sh | gpt-5.5/xhigh |
| 5.4 | Codex changed files | Run spec-compliance review against raw PLAN/diff/report/verification artifacts before ATC | codex-exec.sh | gpt-5.5/xhigh |
| 6 | All plans executed | Dispatch Codex verifier | codex-verify | gpt-5.5/xhigh |
| 7 | Verification passed | Mark complete, advance | orchestrator | — |
| 8 | Verification failed | Dispatch Codex planner --gaps | codex-plan | gpt-5.5/xhigh |
| 9 | All phases complete | Exit loop | — | — |

### Readiness Gates — unattended-run contract

Rule 0 is the **milestone pre-flight**. It runs ONCE at the start of auto mode on a fresh or stale milestone and probes every phase's external deps upfront. Its purpose is to ensure that when you say "go" and walk away, the run either completes OR finds the degraded path within 2 minutes — not 4 hours in.

Rule 4.5 is the **phase drift check**. It re-probes only the current phase's deps right before the first executor burns tokens. Cheap (Codex/local, <10s), catches environmental drift mid-run (Docker dying, VPN dropping). Drift is not a reason to stop if a deterministic local/degraded path remains.

Manifests live at `.planning/milestones/{id}/MILESTONE-READINESS.md`. Drift events append to `.planning/metrics/readiness-log.jsonl`. Dashboards (SGSD1 banner, SGSD3 card) read these directly.

Readiness is **stale** if any phase directory under the active milestone has an mtime newer than the manifest. Stale manifest → re-dispatch rule 0.

### Model Routing

| Role | Model | Why |
|------|-------|-----|
| Orchestrator (you) | Opus | Judgment, dispatch, synthesis |
| Research | Codex GPT-5.5/xhigh | Read-only research report via SGSD Codex wrapper |
| Planner | Codex GPT-5.5/xhigh | Plan synthesis and repair |
| Plan final review | Codex GPT-5.5/xhigh | Fast ATC + MUDA challenge before execution |
| Code execution | Codex GPT-5.5/xhigh | Serial SDD implementer run; Claude orchestrates; Codex edits; patch mode handles Windows read-blocks |
| Spec compliance | Codex GPT-5.5/xhigh | Independent review of raw PLAN, diff, executor report, and verification before ATC |
| Verifier/checker/gates | Codex GPT-5.5/xhigh | Verification, readiness, ATC, MUDA, and plan-check |

### Sub-Agent Prompt Composition

Every sub-agent prompt includes:
1. **Compressed task plan** (XML format, ~800 tokens)
2. **Overlay** (efficiency rules + report format, ~80 tokens)
3. **SGSD memory results** (decisions, patterns, scripts, ~400-600 tokens)
4. **files_to_read block** (minimal, only what's needed)

Total prompt budget: <1,500 tokens. If over, trim file_reads first.

### Sub-Agent Report Format

Every agent returns EXACTLY:
```
FILES_CHANGED: path (created|modified)
VERIFICATION: `cmd` → exit N ✓|✗
DEVIATIONS: [Rule N] description | none
BLOCKERS: description | none
SCRIPTS_CREATED: path | purpose | interface | none
ONE_LINER: substantive summary
```
Max 300 words. No intro. No recap.

### Checkpoint Protocol

When user says pause/stop OR board plus separate Codex challenge cannot resolve
a real runtime/operator-only blocker after direct Codex, Codex read-pack patch
mode, and any configured remote/Linux Codex route have failed:

**Step 1:** Write `.planning/ORCHESTRATOR-CHECKPOINT.md`
  - Use `Write` tool (not Bash echo)
  - Fill ALL frontmatter fields (see checkpoint.md template)
  - Include "## Next Action" with the exact next dispatch description

**Step 2:** Commit checkpoint
  ```bash
  git add .planning/ORCHESTRATOR-CHECKPOINT.md
  git commit -m "chore(checkpoint): session end at phase {N}"
  ```

**Step 3:** STOP with text-only response
  "Checkpoint written. Next session: /sgsd-orchestrate go"

**On next session start — Step 1 of EVERY session:**
  Read `.planning/ORCHESTRATOR-CHECKPOINT.md`
  If found: extract next_unit, delete checkpoint file, enter loop at next_unit
  DO NOT ask the user for context. The checkpoint is the context.

### Commit Discipline

- `feat({phase}-{plan}): {one-liner}` — task code
- `docs({phase}): complete phase summary` — phase docs
- `chore: update STATE.md` — state files
- **Commit after EVERY unit. Never batch. Never skip. Never amend.**
- Stage specific files by name. Never `git add -A` or `git add .`

### Token Efficiency Rules

- Read STATE.md **frontmatter only** (offset 0, limit 30) — not full file
- Query SGSD memory instead of loading full .md files
- Sub-agent reports: 300 words max
- Plans: compressed XML (~800 tokens, not ~2,000)
- Codex/local classifier routes for classification, not Opus
- Log all token usage to `.planning/metrics/token-log.jsonl`
- Script reuse: query before creating new utilities

### Memory Retrieval (DLB-01 - replaces ByteRover)

Per DLB-01 (`.planning/decisions/DLB-01-memory-topology.md`), the SGSD-global
memory tier is a project-local filesystem store at `.planning/memory/` with a
`MEMORY.md` catalogue. The shell wrappers below are the stable callable
interface; legacy BRV/ByteRover command wrappers are not part of the live
contract.

- `sgsd-recall "{terms}"` — grep INDEX.md by query terms, emit top-N file
  contents with `<!-- sgsd-recall: type/slug -->` framing (~200 tokens per
  result). Supports `--type`, `--limit`, `--paths-only`. Lives at
  `super-gsd/scripts/sgsd-recall.sh`; auto-walks up from CWD to find
  `.planning/memory/`, with read-only legacy fallback for unmigrated BRV
  projects.
- `sgsd-curate --type T --slug S --summary "<=80 chars" [--tags "a,b"] < body.md`
  — atomic write of a new entry + INDEX.md update. Types:
  `pattern | anti-pattern | decision | expertise | script`.
- Query BEFORE dispatching (inject results into agent prompt).
- Curate AFTER processing (capture learnings from agent report).
- Scripts: always check `sgsd-recall "scripts {purpose}"` before creating
  new ones.

Revisit BM25 ranking infrastructure only at the 40-file tripwire. Until then,
grep + INDEX.md curation discipline is sufficient.

<!-- SGSD:COMMUNICATION-PROTOCOL:START -->
<!-- Managed section. Repo-scoped ONLY.
     The global communication prompt lives in ~/.claude/CLAUDE.md (revision 2026-08-18.4) and is
     NOT duplicated here. Board decision DLB-prompt-01 (2026-08-18) relocated the Recap rule out
     of the global prompt because it sources .planning/ files that do not exist on every machine.
     Canonical source of the block below:
       C:/Users/jack.berrow/Voice-Text-Plan/docs/prompts/CLAUDE-recap-repo-scoped.md
     Edit super-gsd/CLAUDE-OVERLAY.md, then run /sgsd-overlay-refresh. Do not hand-edit copies. -->

# Closing Recap, a repo-scoped rule

Applies only in repos containing `.planning/`. Relocated out of the global communication prompt by
board decision DLB-prompt-01 (2026-08-18), because it sources project files that do not exist on
every machine the global prompt runs on.

Companion to `docs/prompts/CLAUDE-communication-prompt.md`. Evidence in
`docs/prompts/claude-md-communication-prompt-enrichment.md`.

### 5. [LOCAL] Closing Recap

End every response with a `## Recap` block. It is the last thing written, so it is the first
thing read.

The block states where the work stands and what happens next, one line per field, in this order:

```markdown
## Recap
- **Milestone:** <id and title, or "none, ad-hoc work">
- **Phase:** <id and title, or "n/a">
- **Stage:** <where in the workflow: discussed / planned / executing / verifying / closed>
- **Why:** <the reason this work exists, in one clause>
- **Building:** <what is actually being produced>
- **Next:** <the single next action>
```

Rules:

- Source the values from `.planning/STATE.md` frontmatter, the active milestone `INTENT.md`
  and `ROADMAP.md`. Do not invent them.
- If a field is unknown, write `unknown` rather than guessing. If the repo has no
  `.planning/`, write `none, ad-hoc work` for Milestone and `n/a` for Phase, and still fill
  the other four.
- If the sources disagree, for example `STATE.md` and the governance hook reporting different
  phases, name both rather than picking the more convenient one.
- **Why** is the business or engineering reason, not a restatement of the task. Prefer the
  milestone's core value or core invariant.
- **Next** is one action, with an owner and a trigger. Write `none` when the work is closed and no
  authorised action remains. Never invent an action to fill the field.
- Keep the block to six field lines under the heading. It is a status header, not a summary of the
  response.
- The recap never replaces answering the question. Answer first, recap last.

## [LOCAL] Source-conflict guard

`.planning/STATE.md` is known to contradict itself and to go stale: on 2026-08-18 its
`active_phase` frontmatter and its `Current focus` prose disagreed, and `last_updated` was five
days old. Section 3's rule to name both sources when they disagree applies here. If STATE.md is
internally inconsistent, say so once in the Recap line affected and give both values. Do not
silently pick the more convenient one, and do not repeat the conflict notice on later turns in the
same session once it has been stated.

<!-- SGSD:COMMUNICATION-PROTOCOL:END -->
