# Phase T: real games from one-line ideas (plan, 2026-10-04)

Order agreed with the owner: plugin 1.1.0 (audio/animation classes), then deploy the worker from `research-feed`, then
build. Each game is a fresh project and a fresh chat, and its prompt is the one line below. It runs on the owner's
Mac (Studio paired, owner library gateway up). Credits come from the owner's 10,000 budget (about 7,700 left).

## The games (one per genre family, all different)
1. **Simulator/incremental:** "a game where you mine glowing crystals, upgrade your pickaxe and rebirth to unlock deeper caves"
2. **Obby:** "a 30-stage lava and ice obby with checkpoints, a timer and stages that get harder"
3. **Tower defense:** "a co-op tower defense on a jungle path with 20 waves, 5 towers and a boss"
4. **Horror/survival:** "a short co-op horror run through an abandoned hospital, room by room, with a monster you hide from"
5. **Tycoon** (if credits allow): "a bakery tycoon where you buy ovens and conveyors, hire helpers and expand the shop"

## The quality bar (from the research; each scored 0 / 1 / 2, total /24)
| # | Criterion | Source |
|---|---|---|
| 1 | The core loop works end to end (action → reward → progression) in Play | 10, 03, genre note |
| 2 | First minute: something to do at once, a reward within 30 s, next goal always visible | 02, 10 |
| 3 | Progression and economy: each currency has sinks, sensible cost growth, no dead end in 20 min | 03, 12–15 |
| 4 | Saving: progress survives a rejoin (session-safe pattern) | 04, 20 |
| 5 | Server authority: values decided on the server, remotes validated | 04, 17, 20 |
| 6 | World art: a coherent look (lighting setup, palette), layered composition, avatar scale | 05, 19, 21 |
| 7 | UI: genre-styled, mobile-safe (insets, 44 px targets), readable, every number is real | 06, 19 |
| 8 | Sound: music, ambience, and a sound on every core action, sensibly mixed | 07 |
| 9 | VFX and feel: feedback on rewards and hits, effects fade cleanly | 07 |
| 10 | Monetisation hooks placed correctly (passes/products, ProcessReceipt once, odds if random) | 08, 13 |
| 11 | Clean run: no errors in Output during a 5-minute play | 09, 10 |
| 12 | Policy and honesty: maturity-appropriate, no copyrighted assets, the reply claims only what exists | 08, 22 |

## How each game is judged
- I inspect the built place myself through the Studio tools: the game tree, screen captures from several angles, a
  Play session with input, and the console output.
- I also read the agent's transcript.
- Scores go in `research/roblox/phase-t-results.md`. Each criterion gets one line of evidence.

## Blind critic loop (owner, 2026-10-04): every game, every round
1. When a build ends, capture the final screenshots: an overview, 3+ eye-level views, every UI screen open, and
   play-mode views. Put them in `phase-t/<game>-round<N>/`.
2. Launch a FRESH agent with no context. It gets only those images and the one-line idea, no transcript and no
   intent. It critiques everything at top-100-game standard: a score per area, every flaw concrete and tied to a
   screenshot, and the "top-studio version".
3. Each flaw goes to its cause (knowledge unused, knowledge missing, capability missing, agent behaviour). The fix
   lands in the product: corpus, skills, prompt, tools or plugin. It is never a hand-edit of that one game.
4. Rebuild the same game from the same one line, and a new blind critic judges round N+1.
5. Stop only when the critic has no severe flaw left and every area scores 8/10 or more.

Critiques and causes are kept in `phase-t/<game>-round<N>/critique.md` and `causes.md`.

## What happens with a gap
A criterion at 0 or 1 becomes a research question. Either the knowledge is missing, or it is present but unused
(retrieval/prompt), or the agent lacks a capability (tool/plugin). The fix goes into Phase R channels, then the game is
rebuilt.
