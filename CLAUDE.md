# Super GSD Orchestrator

> **START HERE — `docs/autonomy/`.** The most important artifact in this repository is the owner's
> autonomy research (`docs/autonomy/RESEARCH-REPORT.md`) and the mission it ends in
> (`docs/autonomy/OWNER_PROMPT.md`). Read `docs/autonomy/README.md`, `MISSION.md`, `CURRENT_STATE.md`
> and `NEXT_ACTION.md` before anything below. The hard safety envelope is enforced by
> `.claude/hooks/autonomy_guard.py`; `touch .autonomy/STOP` freezes every mutating tool.
>
> **Owner autonomy is enforced** — load `.claude/skills/apple-owner-autonomy/SKILL.md`. Decide instead of asking
> (AskUserQuestion is blocked), keep working until acceptance (a Stop hook blocks the turn while agent-doable work
> remains), and route only payments, account creation, passwords/2FA and CAPTCHAs to `docs/autonomy/OWNER_QUEUE.md`.

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

## SGSD orchestrator (archived)

The old SGSD loop, permissions, notification and dispatch rules live in `docs/sgsd/SGSD-ORCHESTRATOR.md`.
Read it only when asked to run SGSD. The live contract is `docs/autonomy/` (D-COST-1).

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
