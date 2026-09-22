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
