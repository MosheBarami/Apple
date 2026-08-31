# Evidence ledger

One file per experiment. A claim in a commit message or a PR body should be
traceable to a file here that records the method, the numbers, and what was still
wrong afterwards.

| file | date | what it establishes |
|---|---|---|
| `2026-09-01-persistence-roundtrip.md` | 2026-09-01 | Save → restart → load proven in the published-private benchmark place |
| `2026-09-01-ui-motion-frames.md` | 2026-09-01 | Panel open/close measured frame by frame, overshoot +1.78%; 2 of §O's 14 categories |
| `2026-09-01-detexture-ab.md` | 2026-09-01 | Texture is a property, not a fact; the tint constraint falsified, and the mesas rejected again |
| `2026-08-31-semantic-gate-live.md` | 2026-08-31 | The semantic intent gate on real Studio geometry |
| `PHASE4-MODEL-ROUTING.md` | 2026-08-31 | Cloudflare Unified AI reachable with no provider key; the blocker is credit, not credentials |
| `PHASE4-IMAGE-GEN.md` | 2026-08-31 | Workers AI image generation timing, and encoded PNG size as a free flatness gate |

Related, outside this directory:
- `../FAILURES.md` — confirmed failures and falsified beliefs
- `../BLOCKERS.md` — external and human-only blockers
- `../DECISIONS.md` — decisions and their reasoning
- `../evals/RESULTS.md`, `../evals/FINDINGS.md` — benchmark results
- `../ROBLOX-STYLE-SPEC.md`, `../evals/VISUAL-RUBRIC.md` — the quality bar
