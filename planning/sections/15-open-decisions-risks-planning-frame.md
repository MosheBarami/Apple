# 15. Open decisions, risks, and the planning frame

_Written by the Claude Code session that ran 2026-10-02 → 10-04, from first-hand evidence. This is the section to
plan from. Every decision below is the owner's; options and trade-offs are laid out so a planner can ask him
multiple-choice questions._

## 15.1 The central problem, stated plainly
Apple's agent **knows** a lot now: 23 cited research notes, 1,025 searchable passages, 519 skills, 23 auto-pushed
craft cards. Its **tools** are now mostly fit for purpose: live Creator Store assets, UI that obeys layout rules,
self-checks that fire, and a blind critique before answering.

Yet three rounds of the same game scored **2, 1.5 and 1.5 out of 10** from an independent blind critic. The traces
show why:
- The build model, **GLM 5.3 Flash** (small, fast, cheap), cannot carry a long creative build.
- It reaches for a fixed **template** (`compose_game`: tycoon / plot-sim / lane-defense) and stops.
- Or it gets lost: it read code for 30 steps and built nothing.
- It cannot turn "build a crystal cave world" into dozens of correct, coordinated tool calls.

The owner chose to **keep the cheap model**. So the final product must be designed so that a small model succeeds,
or the model decision must be reopened with honest economics. Everything else is secondary to this.

## 15.2 Decisions the owner must make (in dependency order)

### D1. What exactly is "the final product"?
| Option | What the user gets | Feasibility with today's stack |
|---|---|---|
| A. **Full game from one line** (today's promise) | A complete, publishable game: loop, world, UI, systems, sound, VFX, monetisation | Not reached in 3 rounds. Needs the D2/D3 answers below |
| B. **Genre kits, deeply customised** | The user picks a genre (simulator, obby, tycoon, TD, horror…); the agent assembles a high-quality kit and themes it deeply to the idea | Much more feasible for a small model. The kits carry the quality and the model does the theming |
| C. **Co-pilot inside Studio** | Builds parts on request (a map area, a shop UI, a system), and the user steers | Closest to what works today. Competes directly with Roblox's free Assistant (`research/roblox/09`, `11`) |
| D. Hybrid: B as the default path, A as "magic mode", C for edits | Covers all users | The most work, and the best product |

### D2. Build model and economics
| Option | Quality outlook | Cost per build (rough) | Notes |
|---|---|---|---|
| Stay on GLM 5.3 Flash ($0.15/$0.50 per M tokens) | Low ceiling unless the harness and kits do the heavy lifting | Cheapest (a round cost 82–192 credits) | The owner's current choice |
| Stronger Workers AI models (GLM 5.3 full, DeepSeek V4 Pro, Kimi K2.7 Code: $0.95–1.40 in / $3.96–4.40 out) | Unmeasured. The comparison was cancelled before any run completed | ~6–10× | Needs price rows and per-step caps (both were reverted). Tool support confirmed in the Workers AI catalog |
| Mixed: a strong model for planning and design, Flash for execution | Plausible best value | Modest increase | Not built |
| An external frontier model via AI Gateway | Highest ceiling | Highest cost; new provider dependency | Not built; conflicts with the "zero-cost architecture" memory |

### D3. How the agent builds (architecture)
- **Templates → kits.** Turn `compose_game`'s three fixed maps into a library of high-quality, themeable genre kits:
  world, systems, UI and audio as one coherent package. The small model only fills in a structured theme spec:
  names, palette, assets, numbers.
- **The harness plans and the model fills.** Harness-driven step plans already exist as WIP on branch `fix-r3`: a
  numbered list of exact tool calls built from facts. This could become the core execution engine, a "build
  recipe" interpreter, with the model filling parameters rather than inventing the sequence.
- **Asset-first world building.** The live Creator Store search works. Placement is the weak link: auto-placement,
  clustering and scale normalisation.
- **Keep the blind critique** in the product, and the owner's external blind-critic loop for evaluation.

### D4. Who is the customer?
Options:
- young Roblox creators (13–17; must respect age rules);
- adult hobbyists (18+; growing fastest and the highest spenders);
- small studios;
- the owner himself as a game factory.

The research (`research/roblox/22`) shows 35% under 13, 38% 13–17 and 27% 18+. Under-16 reach for new games requires
Plus or a fee plus engaged-player thresholds. This changes onboarding, safety, pricing and tone.

### D5. Which genres first?
The research gives real economics per genre (`research/roblox/12`–`18`). A small model plus kits favours genres with
strong templates:
- simulator / incremental
- tycoon
- obby
- tower defense

Story horror and PvP combat are harder: AI, netcode and hitboxes. Trend formats (steal or raid, brainrot) decay fast
(-95–99% within months), which argues for evergreen genres plus fast theming.

### D6. Website and brand
- The v4 direction (ai-sdk.dev / awesome-llm aesthetic) is parked WIP.
- Decide:
  - finish v4 or restart;
  - whether "Apple" is a safe name (trademark risk, unexamined);
  - how much the site matters before the product quality is real.

### D7. Plugin distribution
- The free-model insert uses `game:GetObjects`, which the Creator Store's rules restrict for published assets.
- Options:
  - keep it local-only for the owner;
  - publish and risk moderation;
  - find a compliant path (owner uploads, `AssetService`).

### D8. Repository and GitHub (old-goal items, not re-confirmed after the reset)
- Push `research-feed` and open the giant PR.
- Apply rulesets, Codespaces and Packages.
- Finish the repo reorganisation.
- Clean up dozens of stale worktrees.

### D9. Success metrics
Today's measure is the blind critic (target ≥8/10 in every area). For the final product, also consider:
- time to first playable game;
- credits per game;
- user retention;
- the share of games the owner would publish.

## 15.3 Risks
| Risk | Likelihood | Impact | Evidence | Mitigation options |
|---|---|---|---|---|
| A small model cannot reach the quality bar | High | Fatal to promise A | 3 rounds at 1.5–2/10 | D1-B/D, D2 mixed, D3 kits and recipes |
| Roblox ships the same thing for free (Assistant, Planning Mode, Playtest Agent, scene generation) | Medium–high | High | `research/roblox/09`, `11` | Differentiate on full games, kits, quality and speed |
| Policy and moderation: plugin rules, paid random items, maturity labels, Kids/Select gating, the 2026 publishing requirements | Medium | High | `research/roblox/08`, `22` | Build compliance into kits; owner publishes |
| Cost exposure on Workers AI | Medium | Medium | `pricing.ts` caps, BudgetDO | Keep per-step and daily caps; mixed models |
| Solo non-technical owner, giant codebase (5,400+ tests, huge `session.ts` and `tools.ts`) | High | Medium | `planning/sections/06` | Simplify; plan in verifiable small steps |
| The name "Apple" | Unknown | Potentially high | Never examined | Legal check before any launch |
| Scope churn (frequent pivots) | High | Medium | `planning/sections/02` | Lock a final spec and change it only through an explicit decision log |
| The owner library depends on one Mac (gateway at 127.0.0.1:63747) | High | Medium | `planning/sections/03`, `06` | Decide whether the library is a product feature or a private tool |
| **Plugin removed twice from the Creator Store** for "Misusing Roblox Systems"; listing not live; the new `GetObjects` insert path conflicts with an earlier decision to ban it | High | High | section 3 (`03-product-business-vision.md`) | A compliant distribution plan before any publish; owner decision D7 |
| **The account holder's age.** `docs/GO-LIVE.md` states the owner is 15, which blocks Stripe/payments until an adult holds the account | Certain (per docs) | Blocks revenue | section 3 | An adult account holder or guardian arrangement before launch |
| **Spend caps removed** (2026-09-29): theoretical maximum bill ≈ $330,005/month; AI Gateway overage uncapped | Low–medium | Very high | section 3 | Restore global daily/monthly caps before any public traffic |
| **Pricing copy is wrong by 13–23×.** "~163 builds/month" assumed a 77-credit build; real games cost 1,000–1,800 credits, more than every self-serve daily cap | Certain | High (trust, churn) | section 3 | Reprice around measured cost per game; never tested as a paying customer (the owner is unmetered) |
| **Self-check cost.** It made small builds ~16× dearer (139 → 2,273 credits on 11 items) for a judge gain of 7.09 → 9.36/18 | Certain | Medium | section 3 | Decide where checks pay for themselves; tier them |
| **Owner library rights.** Commercial use is only owner-attested; a memory note calls some content "saveinstance dumps" (copies of others' published games) | Medium | High (legal, moderation) | section 3 | Rights audit; keep it private or drop it from the product |

## 15.4 What the final-product spec should contain (for the planner to produce)
1. A product definition in one page: user, promise, core flow, out of scope.
2. The quality bar: the blind-critic rubric with the ≥8/10 target, plus the research-derived checklists per genre.
3. The agent design: model strategy, kit and recipe architecture, asset strategy, checks.
4. The experience: onboarding, pairing, the chat or flow, how users see progress, how they fix things.
5. Business: pricing, credits, costs per build, margins.
6. Website and brand.
7. Compliance: Roblox policies, age rules, the plugin's Creator Store rules.
8. Operations: deploy, monitoring, cost guardrails.
9. Milestones, each with verifiable acceptance tests. For example: "Game 1 scores ≥8 in every area from a fresh blind critic", "credits per game ≤ X".
10. **The final handoff for Claude Code:** an ordered, verifiable task list with file paths and commands, built from the dossier's section 12 and section 6.

## 15.5 Suggested planning process (for Claude Cowork)
1. Read sections 2 (owner), 8 (evidence) and 15 (this section) first. Then 4 (research), 3 (business), 6
   (architecture), 10 (web) and 12 (repo).
2. Ask the owner D1, D2 and D4 as multiple-choice questions, with these trade-offs.
3. Draft the one-page product definition. Review it with the owner.
4. Design the agent architecture for the chosen D1/D2. If a cheap model is kept, make the kit and recipe engine the
   centrepiece.
5. Define milestones, each with acceptance tests the blind critic can check.
6. Produce the Claude Code handoff: current state (from sections 6 and 12), the ordered tasks, the commands and the
   verification steps.
