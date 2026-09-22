# EXPERIMENTS

## E-1 — Historical no-verifier trap, real production run (2026-09-22 21:15 IDT)

- **Setup:** production worker bd6ab34-dirty; project 81b7c2f8… "Acceptance 22 Sep (disposable)"; Studio
  Place1.rbxl, Apple Studio 1.0.0, edits allowed; Agent, Autonomous OFF, make-from-scratch.
- **Prompt:** the benchmark vis-01-lamppost prompt, verbatim.
- **Measured:** the model's plan had 3 steps (viewport_info, create_instances, render_view) and no
  verifier; the product appended inspect_visually with an announcement; no propose_plan refusal loop;
  the run proceeded to a checkpoint and viewport_info. **Trap fixed in production.**
- **Then:** model step 3 took 90 s and returned 6500 output tokens (the ceiling); the partial
  create_instances call failed; the next model call failed in 305 ms; run ended `error`; 28 Credits
  refunded. **New trap found → F-001, D-RUN-1.**

## E-2 — Same prompt via "Try again" (2026-09-22 21:19 IDT)

- **Measured:** identical failure: calls 71 s/4559, 6 s/6, 91 s/6500 (ceiling), then failed 272 ms;
  `error`, 27 Credits refunded, opsFailed 1. **Deterministic, not a flake.**
