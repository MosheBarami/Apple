# PRODUCT HYPOTHESES

Untested beliefs. Each names the experiment that would test it. A hypothesis moves to DECISIONS.md
only after the experiment in EXPERIMENTS.md measured it.

- **H-1:** A first-time creator's biggest drop-off is Studio connection, not prompting. The workspace
  should lead with connection state until Studio is paired, then get out of the way.
  *Test:* customer-stranger mission on a fresh account; time from sign-in to first Studio mutation;
  count of hesitations before finding Connect.
- **H-2:** Large builds should be decomposed by the product (batched create_instances calls), not left
  to the model to fit into one tool call. *Test:* lamp, bedroom and plaza prompts after D-RUN-1; count
  calls per build and failures.
- **H-3:** Autonomous-on as the default surprises new creators (long, expensive runs they did not ask
  for). *Test:* fresh reviewer reaction + credits spent on a first small request with it on vs off.
- **H-4:** The execution surface is most trusted when it shows the current observable action plus
  Studio readback evidence (what changed in the place), not a plan checklist. *Test:* fresh reviewer
  comprehension of what Apple did, with and without a readback summary.
- **H-5:** Plan vs Agent is understandable only if Plan's read-only nature is visible at the moment of
  choosing. *Test:* stranger asked to "look at my game without changing it".
- **H-6 (measured 2026-09-22, revised):** Cost is dominated by WASTED STEPS, not per-step context size.
  Measured on run 76b59615: an Agent step offers 69 tool schemas (65,399 chars ≈ 18k tokens:
  40,066 description, 21,341 parameters; install_module alone 7,380), but Workers AI prefix caching hits
  ~90% of the input on every step after the first (e.g. in 21,834 / cached 21,696), so a warm step is
  60–120 neurons (2–4 Credits at 30 neurons/Credit). A cold first call ("Hi") pays ~21k fresh tokens
  ≈ 9 Credits. E-4 spent ~90 of its 195 Credits on ~40 steps that re-read work the trim had made it
  forget. *Test:* rerun the coin prompt after the run-record fix (worker 30d97330) and compare steps and
  Credits; only then consider shortening the five descriptions over 1,200 chars (≈3.4k tokens per
  cold call).
- **H-7 (2026-09-22):** The default model is the ceiling on debugging quality, and the 24k-char transcript
  is the ceiling on what it can hold. Measured: run 3bcf3f57 read a 60-line script ~30 times without
  seeing that it searches BaseParts named "coin" while the coins are Models; run a95f86fa then wrote
  `model.Transparency`. Both product models route to the same model (`gatewayModelFor` returns the mode).
  Raising MAX_PROMPT_CHARS is cheap in Credits (~90% of input is prefix-cached at $0.03/M) but NOT free in
  storage: AgentState must stay under 128 KiB or persistWithShedding drops the transcript, and a
  36-tool trace alone is ~60 KB. *Test:* log AgentState byte size per step for a week of real runs;
  then an A/B of 24k vs 40k on the mission set, and — owner decision, it changes unit cost — a stronger
  model for Apple MAX on the same set.
