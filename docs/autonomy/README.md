# docs/autonomy — the autonomous product-ownership harness

**This directory is the most important thing in the repository.** Every agent that works on Apple
starts here, before AGENTS.md's map and before any code.

| File | What it is | Who may read it |
|---|---|---|
| `RESEARCH-REPORT.md` | The owner's research, verbatim (sha256 `f5abb6924b0a2007c7b58070e1550c516e69ff9874750ded6d4c437904b0655b`). The design this harness implements and the reasons for it. | everyone |
| `OWNER_PROMPT.md` | **The mission.** The final takeover prompt from the report, verbatim. Every autonomous session is started from it. | everyone |
| `MISSION.md` | The product problem in one page — what a customer-stranger or fresh reviewer is given. | everyone, including strangers and reviewers |
| `ACCEPTANCE.json` | The objective completion contract. `scripts/autonomy-review-gate.py` reads it. | everyone |
| `CURRENT_STATE.md` | Directly measured facts about the repository and production, re-measured every session. | implementers |
| `NEXT_ACTION.md` | The single highest-value next action. | implementers |
| `CUSTOMER_FINDINGS.md` | What actually happened when the real product was used. Observations, not fixes. | implementers, critics |
| `PRODUCT_HYPOTHESES.md` | Hypotheses not yet tested. | implementers, critics |
| `DECISIONS.md` | Decisions with evidence, rejected alternative and a falsification condition. | implementers, critics — **never** customer-strangers or fresh reviewers |
| `EXPERIMENTS.md` | Experiments run and their measured outcome. | implementers, critics |
| `HANDOFF.md` | The compact handoff between sessions, in the report's format. | the next implementer only |
| `evidence/<UTC stamp>/` | Per-iteration evidence: git state, test results, screenshots, Studio readback, deployment ids. | everyone |

Separate FACT, OBSERVATION, HYPOTHESIS and DECISION. Never turn yesterday's decision into today's
fact. Never write secrets, tokens or private chain-of-thought into any file here.

## The runtime half (`.autonomy/`, gitignored)

```
.autonomy/state.json      supervisor state machine (iteration, failures, status)
.autonomy/result.json     each session's exit contract: continue | candidate_complete | human_blocked
.autonomy/STOP            emergency stop — touch it and nothing further mutates or deploys
.autonomy/runner.pid      the supervisor's pid, for kill -TERM
.autonomy/sessions/       one JSON transcript per fresh child session
.autonomy/backups/        pre-autonomy patch + untracked archive (recovery baseline)
```

## Operating it

```bash
# start the unattended supervisor (fresh `claude -p` child per session)
python3 scripts/autonomy-supervisor.py

# stop: no further session starts, and the PreToolUse guard denies every mutating tool
touch .autonomy/STOP

# terminate the supervisor itself (SIGKILL only as a last resort)
kill -TERM "$(cat .autonomy/runner.pid)"

# the deterministic gate an implementer must pass before deploying
bash scripts/autonomy-gate.sh

# the acceptance gate the supervisor runs before accepting candidate_complete
python3 scripts/autonomy-review-gate.py
```

The hard safety envelope is enforced outside the model by `.claude/hooks/autonomy_guard.py`
(PreToolUse, wired in `.claude/settings.json`), not by any sentence in a prompt.

## How the current run is being executed (a recorded decision, not a default)

The first run of `OWNER_PROMPT.md` (started 2026-09-22) is driven from the interactive Claude Code
session in the desktop app, because that is the only process on this machine that holds the owner's
signed-in Chrome and the Roblox Studio GUI — both of which the prompt names as release oracles
("REAL STUDIO IS A RELEASE ORACLE"). Fresh context for the customer-stranger, critic and reviewer
roles is provided by isolated subagents that receive only `MISSION.md`, the production URL and the
acceptance missions. The supervisor is installed, tested and ready for unattended multi-session
continuation; see DECISIONS.md D-AUT-1.
