# Game 1, round 1: blind critique (fresh agent, screenshots only)

## 1. Verdict

This is a dark, unlit prototype made of flat neon-magenta blocks and unexplained yellow and orange slabs in a navy void. The upgrade panel is the only part that looks like a Roblox game. A new player cannot tell where to mine, what a cave is, or what rebirth is.

## 2. Scores (0–10)

| Area | Score |
|---|---|
| Delivers the idea (mining, upgrades, rebirth, deeper caves) | 2 |
| World and level design (composition, landmarks, paths, depth, scale) | 1 |
| Art direction (palette, materials, lighting, atmosphere) | 2 |
| Crystal and prop quality | 2 |
| UI/UX | 5 |
| Feedback and game feel | 3 |
| First 10 seconds | 1 |
| Broken, placeholder or amateur (10 = polished) | 1 |
| **Overall** | **2 / 10** |

## 3. Flaws, most severe first

1. **The overview is unreadable (01).** The frame is almost uniform dark blue. The only visible world content is one thin purple line near the top-centre and a faint slab outline. There is no visible layout, no crystals, no paths and no caves. Either the map is empty or the lighting is broken. The overview should show a lit, readable map: a hub in the centre, and crystal fields in rings or zones around it with visible paths.

2. **Nothing visible is a cave, and there is no sense of depth (02, 03, 04, 07).** The idea is "deeper caves", but every eye-level shot shows a flat plane out to a horizon. There are no walls, ceilings, tunnels, stalactites or descents. The "CRYSTAL DEPTHS" sign (07) sits over a flat field. Caves should be real enclosed spaces. Each tier should be a carved tunnel entrance (a 12–16 stud arch of rock) leading down a ramp or shaft into a chamber with a rock ceiling. Tiers should be visibly gated by a barrier showing the rebirth count needed.

3. **The lighting is near-black and the fog is heavy (02, 03, 04, 06, 07).** Most pixels are #000010–#101040. The floor cannot be distinguished from the sky. The player cannot see where to walk. Raise the ambient light, add a visible cool blue-teal floor with a lit rock texture, and put point lights on the crystals. Use fog only for depth, not to hide an empty map.

4. **The crystals are flat, untextured magenta blobs (02, 03, 06).** They read as clumps of extruded cubes in one pure #FF00FF, with no facets, no internal gradient and no emissive core. The large crystal in 03 and the foreground one in 06 look like slabs. Real crystals should be hexagonal-prism spires, 3–7 per cluster, at varied heights and tilts, with a glass or neon material. They need a bright core fading to a darker rim and a colour per tier (cyan, amber, emerald, violet). Add sparkle particles and a point light on each cluster.

5. **A giant foreground crystal blocks the avatar and the camera (06).** A huge magenta crystal covers the lower half of the screen and hides the character. Crystals need a size cap relative to the avatar (about 1–1.5x avatar height at most), and spawn must not put one in the camera's line.

6. **There are unexplained flat-coloured slabs (02, 03, 04, 07).** A pure yellow box (02, 03, 07), a pure orange rectangle (03), a large amber wall with a black cut-out window (04), and a magenta cube (07) all read as unfinished blockout geometry. The amber structure in 04 is the biggest object in the frame and its purpose is unclear. Each should be a recognisable object: a sell station, an upgrade shop, a rebirth altar or a minecart. Each needs a distinct silhouette, materials such as rock, wood and metal, and a floating billboard label.

7. **There is no readable mining target or interaction (02, 03, 06).** Nothing shows a prompt like "Mine", a health bar on the crystal, or a pickaxe in the hand. The upgrade text says "+1 per press", which suggests a click-spam button and not physical mining. Crystals should show a hover highlight and a "Click / Tap to mine" prompt. Hits should have a swing animation, a crack stage, shards and a pop-up number. The pickaxe should be a visible tool.

8. **The avatar is not framed (06, 02).** In 06 the avatar is partly hidden and tiny. In 02 the yellow block dominates the centre. The camera should sit about 12–15 studs behind the avatar, and the avatar should stand on a lit hub pad with a clear silhouette.

9. **The scale and layout of the crystals are meaningless (02, 03, 07).** Small crystal clumps sit on dark plinths scattered evenly across a flat plane. There are no paths, no clustering and no value gradient. A top-100 mining game uses a hub with a ring of low-tier nodes, then richer fields further out and deeper down. It should have a clear route and a landmark visible from everywhere.

10. **The "CRYSTAL DEPTHS" gate is amateur (07).** The sign is a tiny dark-blue rectangle with small pale text, sitting on a brown studded beam over a single studded column. The text is unreadable at normal distance. A 3-stud sign with 24–32pt glowing text should be mounted on a big arch of rock with torches or crystals.

11. **The "play view" in 07 is not play mode.** The axis gizmo at top right is the Studio viewport. It shows a floating pink dot, a magenta cube and a thin cyan horizon line that looks like a seam. Any reviewer sees an edit-mode frame with scattered placeholder objects.

12. **The horizon looks like an artifact (06, 07).** In 06 the far edge is a flat grey wall that suggests an enclosed pit. In 07 a thin bright pale-blue line runs along the horizon. In 02 and 03 there is a hard blue band at horizon height. The world edge and sky should be real: a skybox with a cave-roof or star dome, and mountains or rock walls as a boundary.

13. **The upgrade panel overlaps other UI (05).** The top UPGRADES button and the bottom REBIRTH button peek out above and below the panel. The panel is also not centred relative to them. Hide or dim the HUD buttons while a modal is open, and add a dimmed backdrop.

14. **There are three Upgrades labels (05, all HUD shots).** A blue "UPGRADES" at top centre, a green "↑ Upgrades" at the left, and a panel titled "UPGRADES" all say the same thing. Remove one of the two HUD buttons. Mismatched colours and casing make it look like two different features.

15. **The currency is mislabelled (all HUD shots).** The counter shows a gold dollar-sign coin next to "CRYSTALS". It should show a crystal gem icon. The player cannot tell whether crystals are the currency or the thing being mined.

16. **The upgrade panel has only two items, and the icons are mismatched (05).** "Pickaxe Power" uses a pointing-finger icon, not a pickaxe. Only two upgrades exist, with no tiers, caps, next-level preview or sell-multiplier. Use a pickaxe icon that changes with level, show "Lv 0 → 1" and the stat change, and show 5–8 purchasable items including luck, bag capacity and walk speed.

17. **The text hierarchy in the panel is inconsistent (05).** "+1 per press" is set larger than "+0.5 Crystals a second", which is tiny and hard to read. The cost buttons show a bare number with no gem icon. The "Lv 0" badge overlaps the icon circles. Use one subtitle size (about 14–16pt on mobile), and put a gem glyph in the buy button. Grey out the buttons when unaffordable.

18. **The Rebirth button gives no information (all HUD shots).** It is always at bottom centre in the same blue as Upgrades. It shows no cost, no progress and no multiplier. It is shown at 0 crystals as if available. It should be a distinct, premium-coloured button (gold or purple). It should show a progress bar toward the requirement, locked at 0, and a "x1.5 multiplier" teaser. Without that, the rebirth loop cannot be understood.

19. **The mobile safe-area is risky (all HUD shots).** The bottom-centre REBIRTH button sits where Roblox's tool hotbar normally goes, so it will collide with the pickaxe tool slot. The left-middle Upgrades button sits in the thumb zone near the movement stick. The Roblox top bar (06) crowds the crystal counter. Move Rebirth to the right edge, keep the left-bottom free for the thumbstick, and offset the counter below the top bar.

20. **The HUD style clashes with the world (all).** The bubbly, studded, candy-lego UI is clean on its own, but the 3D world is flat neon on black with studded brown beams in one place. There is no art cohesion. The UI font and bevel style suggest a bright, cartoon world, and the scene is a dark void.

21. **There is no feedback on collecting (02, 03, 06).** There is no floating +N, no flying gem toward the counter, no screen shake, no sound cue visible, no crack stages. The only visible feedback is the green "!" badge on Upgrades when 10 crystals are held (06). That badge is a good touch, but it is the only one.

22. **The spawn force-field bubble looks like a leftover (06).** A large translucent teal sphere with white sparks surrounds the avatar, and a pink glowing slab sits behind. A spawn area should be a lit pad or portal with clear edges, not a bubble that hides the character.

23. **Black spiky shapes sit at the bottom of the frame (06).** Dark triangular silhouettes and a grey slab in the foreground look like stray shadow or geometry artifacts and obscure the path.

24. **The crystal "plinths" are black rectangles (02, 06).** Each crystal sits on a dark flat pad that does not blend with the floor. They look like pasted tiles. Grow the crystals from rock outcrops with a visible base, rubble and an emissive glow decal on the floor.

25. **The pink fragment at the left edge of 04 is hidden behind the green Upgrades button,** and the orange slab runs under it too. Several elements collide with HUD chrome. Keep the key objects in the central 60% of the frame.

26. **There is no goal communication in the first 10 seconds.** There is no objective text, no arrow, no tutorial prompt, no tool visible, no leaderboard or other players. A player sees "0 CRYSTALS", three buttons and a dark void. Add a short objective such as "Mine the glowing crystals", a floating arrow to the nearest node, and a first-run highlight on Upgrades once 10 crystals are earned.

27. **There are no social or retention hooks visible.** No leaderboard, no pets, no daily reward, no boosts and no other players are shown. The upgrade list is the only meta-system visible.

28. **The materials are one note throughout.** Everything is flat Plastic or Neon in solid colours. There is no rock, no wet stone, no metal and no glass. Give the floor a rocky normal-mapped texture, and the crystals a glass material with a refractive look.

## 4. What the top-studio version looks like

You spawn on a lit hub platform, a round stone plaza about 60 studs wide with a glowing rebirth altar in the centre and a shop stall to one side. A tall stone arch labelled in glowing letters, with a distinct amber crystal on top, marks the first cave mouth. Beyond it, a ramp descends into a cavern with a rocky ceiling. The cave is lit from within by clusters of cyan, magenta and amber hexagonal crystals, each a faceted glass spire with a bright core, a point light and floating sparkle particles.

Warm lantern light pools along a visible path. The cavern walls are textured rock with veins of ore. Deeper tiers are gated by locked doors that show "Rebirth 3 required", and each tier changes the palette, the crystal colour and the music.

Your avatar holds a visible pickaxe. Hitting a crystal makes it flash, show cracks and burst into shards. Gems fly into a counter that has a gem icon, and "+12" numbers pop up. The HUD has one clearly styled Upgrades button, a Rebirth button with a progress bar, and a short objective line on screen. The Upgrades window has a dimmed backdrop and 6–8 items with level previews, gem-priced buy buttons and greyed-out states. All of it is placed to be safe on mobile.

## 5. What is already good

- The HUD button style (rounded, bevelled, high-contrast white text with a dark outline) is legible and recognisably Roblox-genre.
- The upgrade cards in 05 have a clear layout: icon, level badge, name, effect line and a big green buy button. The panel hierarchy works once the text sizes are fixed.
- The red "!" badge on the Upgrades button when 10 crystals are held (06) is correct genre feedback.
- The magenta crystals do glow against the dark ground (06), and magenta against navy is a strong contrast that could become a good base palette once the crystals are shaped properly.
- The dark blue and violet cave mood is the right starting direction for a cave game if the lighting is raised.
- The "Auto Miner" card with a robot icon communicates idle income clearly.

## Recap
- **Milestone:** unknown (blind review; I read no planning files)
- **Phase:** n/a
- **Stage:** closed
- **Why:** an independent, screenshot-only critique of the t1-round1 build against a top-100 Roblox standard
- **Building:** a written review only; no files were created or changed
- **Next:** none