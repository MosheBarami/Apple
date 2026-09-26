# Strategic owner lifecycle (inactive until explicitly activated)

`autonomy-supervisor.py --owner --config /absolute/owner-config.json` defaults to
`continuation_mode: "native_goal"`. It invokes configured Opus with
`-p "/goal <goal_condition>" --output-format stream-json --verbose`. Native Claude
owns all continuation turns within that process; the supervisor observes heartbeat,
STOP, identity and mission state and only considers recovery after process exit.
The same durable UUID is resumed and the explicit goal re-armed after an unmet exit.
`resumed_turn` is an explicit compatibility option, never an automatic fallback.
Fresh evaluations remain separate: `autonomy-supervisor.py --reviews-only`.
Owner runtime does not write evaluator state/result/streak. Canonical user mission
instructions supersede historical handoffs and are injected at invocation/recovery;
Claude is instructed to reread the canonical mission every native goal turn.

## Prepare without activation

Run the renderer from the approved worktree, selecting the intended persistent root:

```sh
python3 scripts/autonomy/install-owner-launchagent.py \
  --root /Users/moshe/Desktop/RbxAI \
  --mission /Users/moshe/.codex/owner/missions/761ee501797a59aa/mission.json \
  --model claude-opus-5-5 \
  --goal-condition-file /Users/moshe/Desktop/RbxAI/docs/autonomy/CLAUDE-OWNER-GOAL.txt \
  --output-dir /Users/moshe/Documents/Apple-OS/runtime/strategic-owner
```

The target root must already contain this implementation and its STOP hook wiring.
The helper discovers the current absolute Python/Claude invocation paths, validates
CLI help and repository root, and renders configuration and a plist. `--install`
optionally copies the plist into user LaunchAgents; it **never** calls launchctl.
Do not render configuration against a temporary worktree for enduring use unless
that worktree is explicitly approved to remain the owner's persistent checkout.
No plist was installed or activated during implementation.

`max_sessions`, `max_wall_clock_hours` and `session_seconds` accept positive values
or `null` (unbounded). Owner defaults are null and never inherit legacy 72-hour state.
Failure retries are capped by `max_failures` (default 3), with persisted deadlines
and bounded delays (default 5/30/120 seconds). There is no model fallback.
`goal_condition` is required for native mode: one
nonempty line, at most 4,000 characters, excluding goal-clear aliases. The renderer
requires `--goal-condition` or `--goal-condition-file`; it does not infer the full
objective from a possibly narrower product-only ledger goal. Parent must supply the
approved full objective before activation. Parent has supplied
`docs/autonomy/CLAUDE-OWNER-GOAL.txt`; use that full condition without substituting
the narrower ledger goal. Parent access evidence is
`docs/evidence/claude-owner-access-2026-09-26.md`. These remain parent-owned files.
The inactive preview was rendered against this isolated worktree, not installed;
rerender against the approved durable root once the code is integrated and access
works. Illustrative condition (the supplied parent file takes precedence):

> Complete the Apple Roblox Studio product: scripts/autonomy-review-gate.py exits 0 on fresh independent browser/Studio/gameplay evidence, while the approved full owner objective has a persistent strategic Opus owner, deterministic single-instance recovery, independent evaluations and canonical mission state; preserve STOP and account/provider boundaries.

A native achieved/impossible/paused/cleared verdict or zero exit alone never establishes
completion. `candidate_complete` requires all three: an explicit owner result
receipt with `status: "candidate_complete"`, a readable existing evidence file
referenced by `full_objective_audit`, and a passing independent acceptance gate.
Missing receipt, `continue`, or missing audit cannot qualify even if the product gate
is green. No exact native achieved-stream schema is assumed. The full-objective audit
must cover real owner compaction/restart, autonomous owner agency, listed assets,
independent evaluations, canonical mission state, and every other approved objective
requirement with evidence. Parser/access evidence alone is not that audit. The path
check only verifies a nonempty readable report under docs/evidence or
docs/autonomy/evidence; it does not independently establish the report's truth.
Parent/fresh audit must verify its substance before a completion claim.
Otherwise native exits become bounded recovery attempts with persisted backoff,
or an explicit human blocker. Structured fatal provider results (including the
observed organization subscription restriction) record a terminal diagnostic code
after one attempt; restart cannot retry through that blocker. Unknown errors remain
bounded by `max_failures`. Both relay and agent stdin are DEVNULL, preventing
inherited parent-shell/Python source from becoming additional Claude input.

## Observe, stop and recover

- `.autonomy/owner-runtime.json`: atomic, fsynced heartbeat, supervisor birth
  identity, session UUID, configured model, canonical mission path and child intent.
- `.autonomy/owner-sessions/<token>/`: private local relay/agent birth identities,
  exit receipt and per-turn result/output. Do not print spec/output: these contain
  mission context or conversation content. Logs/state contain no authentication data.
- OS flock files are held open, never deleted. The child relay and CLI inherit the
  execution lease and a canonical mission execution lease. The agent wrapper publishes its own birth identity before exec, independently of the relay, and checks canonical pause/STOP before inference. Legacy builder children also inherit their shared execution lease. A mission-level
  supervisor lock also excludes owners in different checkouts. Supervisor restart
  observes surviving identities without killing or duplicating them, including the interval before identity publication. Unknown
  lease holders and corrupt runtime fail closed.
- SIGTERM/SIGINT to the supervisor gracefully detaches and preserves the child;
  a later supervisor invocation reconciles it. No SIGKILL is used by owner mode.
- Repository `.autonomy/STOP`, canonical mission-directory `STOP`, or canonical
  mission pause/completion/block prevent new turns. STOP/mission halt requests
  SIGTERM only for verified owner children, waits a bounded grace period and records
  any surviving child; there is no forced kill. Repository STOP also freezes mutations
  through the existing safety hook.
- A configured session deadline preserves a surviving child and records a terminal
  human blocker. A supervisor crash cannot erase failure backoff.
- Terminal runtime intent is persisted before startup heartbeat publication and remains sticky across launchd restarts. A canonical pause cannot downgrade a provider/technical blocker into a resumable pause. Removing STOP alone
  does not restart an owner. A recorded living child is still reconciled on restart,
  even with terminal runtime: present STOP/canonical pause requests verified graceful
  termination; a sticky runtime blocker alone preserves the child without duplication.
  To resume a deliberate pause, first set the canonical mission active through the
  owner's approved mission workflow, then invoke:
  `python3 scripts/autonomy-supervisor.py --owner --config /absolute/owner-config.json --resume-owner`.
  This flag only clears `paused`, refuses STOP/still-paused missions, retains child
  records and session UUID, and does not clear completion or technical blockers.
  After this one explicit resume, normal supervisor/LaunchAgent invocations can resume
  the recorded lifecycle without the flag. Other terminal states require an authorized
  operator to inspect/reconcile children and leases before changing runtime to `ready`.
  Never clear `child`, delete lock inodes, or reset
  session identity to bypass liveness. Missing native conversation evidence triggers
  a new UUID and reconstruction from canonical state; other resume errors remain
  bounded failures rather than silently starting a new owner.

## Activation constraints

Wait for the parent's UI work and canonical/current-doc updates to finish. Confirm
there is no interactive or other owner modifying the selected root; uncontrolled
interactive processes do not acquire this lease. Confirm explicit model access and
Max authentication in the launchd user environment, browser/Studio permissions and
pairing, and that `dontAsk` plus the existing hooks permit required authorized tools.
The renderer's help check proves flags, not model/account or GUI availability.
KeepAlive restarts nonzero exits with a 30-second launchd throttle; successful
terminal exits stay stopped, including after login because runtime is sticky.

Verification uses only isolated fake children:

```sh
node --test tests/autonomy-owner-lifecycle.test.mjs tests/autonomy-harness.test.mjs tests/owner-autonomy-hooks.test.mjs
```

The 2026-09-26 explicit tool-free `claude-opus-5-5` probe exited 1 with a
reported restriction on Claude Code subscription access, no reported model
and $0 reported cost. Parent subsequently verified that the visible browser profile
is Free and privately matched its account to CLI auth status, which still reports
cached Max. Server OAuth requires Max. This is an observed entitlement mismatch,
not proof of an organization-admin switch. No alternate API environment/key helper
is configured. Sanitized parent evidence:
`/private/tmp/apple-native-goal-probe/sanitized-proof.json` (temporary local evidence;
parent owns its durable preservation). A response from the requested model remains
blocked; cached CLI auth status alone does not establish access.

Official native [goal documentation](https://code.claude.com/docs/en/goal) confirms
non-interactive `/goal`, streaming output and active-goal restoration on resume.
The parent's bounded experiment recognized `Goal set` but returned the same reported
provider access refusal. This establishes parser applicability only: actual Opus goal
turns, model availability and native goal resume remain unverified. No duplicate goal
probe or additional real API call was made during this lifecycle change. Complete
those proofs only after the account entitlement/access boundary is legitimately resolved.
Goal evaluation also requires applicable workspace trust and enabled hooks. Native
goal verdicts judge transcript evidence and do not replace independent customer
reviews or the repository's evidence gate. Current prompt snapshots are disabled
via the installed CLI flag so resumed invocations receive current receipt/context.
