# Research brief: Roblox game-making knowledge for Apple's agent

Each research agent writes ONE topic file in this folder, named in the coverage map below. The reader is a
pipeline that turns the file into (a) knowledge chunks the agent searches and (b) skill recipes the agent
follows while building games in Roblox Studio. Write for that reader: dense, factual and actionable.

## Sources (in order of trust)
1. create.roblox.com/docs (API reference, guides, tutorials) and the Roblox Creator Hub, including the Luau docs at luau.org.
2. devforum.roblox.com: staff announcements and highly-voted community resources and tutorials (name the author).
3. The Roblox corporate and creator blog, RDC (Roblox Developers Conference) talks, Roblox investor letters
   (for platform numbers).
4. Developer postmortems, interviews and talks (GDC, podcasts, YouTube talks by named devs), and reputable press (with dates).
5. Analytics sites (RoMonitor Stats, Rolimons, Bloxbiz/Gamefam reports): label their numbers "third-party".

Never invent a fact, number, API name or property. If you can't verify something, say "unverified" or leave it out.
Today is 2026-10-04. Flag anything older than 2024 that may be stale, and prefer 2025–2026 sources. Summarise in
your own words; quote at most a few words, never long passages.

## File format (Markdown)
```
# <Topic>
_Researched 2026-10-04 by <agent>. Sources: N._

## Key facts
- <fact> [S3]
...
## How to apply it (rules for an AI builder)
- DO / DON'T lines, concrete (numbers, property names, values, sizes, prices).
## Recipes (each becomes a skill)
### <Recipe name>
When to use: ...
Steps: 1. ... (Studio objects, properties, values; Luau where needed)
Pitfalls: ...
## Luau reference snippets
Short, correct and modern (task.wait, not wait; typed where helpful). Every API used must exist in current docs.
## Open questions / unverified
## Sources
[S1] Title, publisher/author, date, URL
```
Aim for depth: about 4,000–9,000 words, at least 25 distinct sources, and at least 8 recipes where the topic is buildable.

## Coverage map (topic file -> scope)
| File | Scope |
|---|---|
| `01-viral-hits.md` | Case studies of Roblox hits 2023–2026 (e.g. Grow a Garden, Steal a Brainrot, 99 Nights in the Forest, Dead Rails, Fisch, Dress to Impress, Rivals, Doors, Pet Simulator 99, Blox Fruits, Adopt Me, Brookhaven, Forsaken, The Strongest Battlegrounds, and newer 2026 hits). For each: the core loop, the hook, what made it spread (social mechanics, TikTok/YouTube), monetisation, update cadence, team size and time to build, peak CCU (with source). Then the cross-cutting patterns. |
| `02-discovery-growth.md` | How Roblox discovery and recommendation work now (2024–2026 changes and the signals: engagement, retention, session time, qualified play-through, monetisation), charts and sorts, thumbnails, icons and titles (incl. Roblox thumbnail personalisation / A/B testing), Creator Analytics benchmarks (D1/D7/D30, session length, payer conversion), launch strategy, updates and events, ads/sponsorships, friend invites and social features, short-video marketing. |
| `03-genre-design.md` | The design craft per genre: obby, tycoon, simulator, tower defense, horror/story, roleplay/hangout, battlegrounds/fighting, incremental/idle, social PvP/"steal", fishing/collecting, survival, party/minigames, racing. For each: core loop, progression (rebirths, pets/eggs, upgrades, zones), economy balancing, the first 5 minutes (FTUE), retention hooks (daily rewards, streaks, codes, limited events), and multiplayer and social design. |
| `04-luau-architecture.md` | Expert Roblox engineering: client/server model, Remote security and validation (anti-exploit), DataStores (session locking, ProfileStore, UpdateAsync, budgets, retries), MemoryStore, MessagingService, TeleportService, MarketplaceService.ProcessReceipt done right, CollectionService and Attributes, ModuleScript project structure, Luau type checking, performance (task library, Parallel Luau, memory leaks, connection cleanup), StreamingEnabled, network ownership, physics; new APIs of 2024–2026 (Input Action System, the new Audio API, EditableMesh/EditableImage, server authority, etc.). |
| `05-world-visuals.md` | World building and art direction: Lighting technologies, Atmosphere, Sky, post-processing values, terrain workflows, materials, MaterialVariant, SurfaceAppearance/PBR, level design (landmarks, paths, sightlines, focal points, layering, foreground/mid/background), avatar-relative scale (character height, door and stair sizes, corridor widths, jump distances), stylised low-poly vs realistic looks, colour palettes of top games, and performance budgets (parts, triangles, draw calls, textures). |
| `06-ui-ux.md` | UI/UX for Roblox: mobile-first (the platform's device split), Scale vs Offset, constraints and layouts, safe areas/GuiInset/TopBar, touch target sizes, fonts, the HUD and shop/inventory/currency/notification patterns of top games, UI animation with TweenService, gamepad selection and accessibility, UI art styles (with examples of games). |
| `07-anim-audio-vfx.md` | Animation (Animation Editor, rigs R15/R6, AnimationController for NPCs, priorities/blending, IK, procedural motion with tweens and springs), audio (the new Audio API vs Sound/SoundGroup, music rights on Roblox, ambient design, SFX for feedback), VFX (ParticleEmitter incl. flipbooks, Beam, Trail, Highlight, light effects) and game feel ("juice": camera shake, hit-stop, FOV kick, squash and stretch). |
| `08-monetization-policy.md` | Monetisation (game passes, developer products, Premium Payouts, subscriptions, rewarded video ads, private servers, price points and psychology), the creator economy and DevEx (2025–2026 rates), and policy: Community Standards, experience guidelines / content maturity labels, rules for paid random items, age and chat changes, the IP and music rules, and what gets games moderated. |
| `09-tools-ecosystem.md` | The 2025–2026 Studio ecosystem: Roblox Assistant and AI features (Cube 3D generation, code assist, the Studio MCP server), Creator Store and Toolbox safety (backdoors: require(id), getfenv/loadstring, obfuscation; how to vet models), packages, popular open-source libraries (ProfileStore, Promise, Signal, Trove/Janitor, Fusion/React-lua, Knit status), Rojo/Wally, and testing in Studio (Play solo, multi-client, Device Emulator, MicroProfiler). |
| `11-rdc-2026-and-roadmap.md` | RDC 2026 announcements with status, the creator roadmap, and 2026 investor-letter points that affect creators. |
| `10-from-scratch-playbook.md` | How experienced developers take a game from idea to launch: concept validation, scope, a vertical slice in days, an MVP checklist, playtesting, metrics-driven iteration, launch and update plan, and team workflows. Turn it into the step-by-step plan an AI builder follows to make a complete game from a one-line idea. |

## Round 2 (owner: "more research first", 2026-10-04) — depth over breadth
Same rules and format. Each note goes DEEPER than 03 for its genres: real numbers from real games (costs, multipliers,
timers, wave/enemy stats, drop rates, prices, progression curves, session/round lengths), the systems list a complete
game of that genre ships with, and what separates the hits from the clones. Every number sourced or labelled.
| File | Scope |
|---|---|
| `12-genre-simulator-incremental.md` | simulators, incremental/idle, collecting/RNG ("rolls", auras), clicker, upgrade trees, rebirth/prestige math, offline progress |
| `13-genre-tycoon-building.md` | tycoons (droppers, conveyors, plot buttons), base building, life-sim/house building, placement/plot systems |
| `14-genre-obby-racing-platform.md` | obbies (stage design, difficulty curves, checkpoints, timers), tower obbies, parkour/movement tech, racing and driving |
| `15-genre-defense-strategy.md` | tower defense (units, waves, enemy stats, economy, maps), RTS-lite, survival waves |
| `16-genre-horror-story-survival.md` | horror and story games (chapters, monsters/AI, scares, puzzles, lighting/sound), survival-crafting (hunger, day/night, crafting trees) |
| `17-genre-pvp-combat.md` | battlegrounds/fighting (movesets, combos, hitboxes, stun, cooldowns), shooters (gunplay, TTK, maps, matchmaking), sword fighting, ranked |
| `18-genre-social-roleplay-party.md` | roleplay/hangout towns, life-sim jobs, party/minigame rotations, social "steal/raid" games and 2025-26 trend formats |
| `19-visual-study-top-games.md` | how top games actually look: art direction, palettes, lighting, materials, UI art style, icons/thumbnails, what reads as "professional" vs "free model" — from analyses, showcases and dev posts |
| `20-systems-cookbook.md` | correct, modern Luau for the systems every game needs: inventory, quests, daily rewards, codes, leaderboards, trading, rounds/lobbies, NPC AI + pathfinding, melee/ranged hitboxes, vehicles, placement/build mode, followers/companions, admin tools, notifications |
| `21-building-craft.md` | how pro builders build: part/mesh modelling, low-poly technique, architecture and interiors, terrain sculpting, map layout process, kitbashing from Creator Store safely, optimisation while building |
| `22-player-psychology-audience.md` | who plays Roblox (age bands, regions, devices), what each age group wants, motivation models applied to Roblox, social play, fairness/pay-to-win perception, safety expectations of parents |
| `23-asset-and-audio-sourcing.md` | finding and using Creator Store models, meshes, decals, audio and music: search tactics, licensing, Roblox-owned/verified assets, audio privacy/permissions, MaterialVariants/textures, what an AI builder can and cannot fetch |
