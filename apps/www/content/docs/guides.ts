import type { DocPage } from "@/lib/docs";

export const guides: DocPage[] = [
  {
    slug: "build-an-interface",
    title: "Build an interface",
    description: "Menus, shops, HUDs and settings screens that work on desktop, phone and console.",
    body: `
Interfaces are a good first project: you see the result as soon as you press Play, and it is easy to say what you want changed. This guide builds a settings menu end to end.

## The request

\`\`\`text
Add a settings menu opened by a gear button in the top right corner.
It has sliders for music and sound effects volume and a toggle for
camera shake. Save the settings so they come back next time the
player joins. Keep it readable on phones.
\`\`\`

## What the agent does

1. **Reads your place.** It checks \`StarterGui\` for existing screens so the new one fits in, and looks for sounds and any existing settings code.
2. **Looks things up when it needs to.** Saving per-player settings means data stores, so expect a search of the documentation for \`DataStoreService\` and its limits, cited in the summary.
3. **Builds the screen.** A \`ScreenGui\` with the button and a panel, laid out with \`UIListLayout\` and \`UIPadding\`, sized with scale rather than pixels and capped with \`UISizeConstraint\` so it holds up on small screens.
4. **Writes the scripts.** A \`LocalScript\` drives the panel and the sliders; a server \`Script\` loads and saves the settings, with a \`RemoteEvent\` between them.
5. **Summarises** what it made, where, and how to test it.

## Check it

Press **Play**. Open the menu, move the sliders, leave and rejoin a test server. Use Studio's **Device** emulator to check a phone-sized screen.

## Refine it

Reply in the same chat:

- "Match the font and colours of the main menu."
- "Animate the panel sliding in from the right, 0.2 seconds."
- "Add a reset to defaults button."

## Tips

- Name the screen you want to match, or select it before sending.
- Say which devices matter. "Mostly mobile" changes the button sizes the agent chooses.
- If you already have a design, describe it in words: layout, colours, corner radius, font.
`,
  },
  {
    slug: "script-a-game-system",
    title: "Script a game system",
    description: "Rounds, currencies, quests, leaderboards: systems that run on the server and survive rejoining.",
    body: `
Game systems are where the agent saves you the most time: the logic, the remote events, the data saving and the edge cases nobody enjoys writing. This guide builds a round system.

## The request

\`\`\`text
Make a round system. 20 second intermission in the lobby, then
teleport everyone to the spawns in Workspace.Arena. The round lasts
2 minutes or until one player is left. The winner gets 50 Coins on
the leaderboard. Show the timer and the status at the top of the screen.
\`\`\`

## What the agent does

- Reads \`Workspace.Arena\` to find the spawn points, and checks for an existing leaderboard or \`Coins\` value.
- Writes the round loop as a server \`Script\` in \`ServerScriptService\`, keeping state on the server where players cannot tamper with it.
- Adds the \`leaderstats\` folder if there is none, and saves Coins with a data store, citing the documentation it used for the limits.
- Puts the timer and status into a small HUD, updated from the server through attributes or a \`RemoteEvent\`.
- Handles the cases that break naive versions: players leaving mid-round, joining mid-round, and nobody being left.

## Check it

Use **Test → Clients and Servers** with two or three players so you can see a round actually end. Watch the Output window: the agent writes clear messages for anything it expects might go wrong.

## Refine it

- "Players who die go back to the lobby to spectate."
- "Pick a random map from ServerStorage.Maps each round."
- "Give everyone 10 Coins for taking part."

## Tips

- Give exact numbers: times, rewards, player counts.
- Say where things live if they exist already.
- Ask the agent to explain the system when it is done. It will walk through the scripts it wrote, which is useful the first time you need to change them yourself.
`,
  },
  {
    slug: "build-a-map",
    title: "Build a map or terrain",
    description: "Terrain, layouts, lighting and atmosphere, from a description of the place.",
    body: `
The agent can shape terrain, place and arrange parts and models, and set up lighting and atmosphere. Describe a place the way you would describe it to a level designer.

## The request

\`\`\`text
Turn the baseplate into a small rocky island in a calm sea. Sandy
beach on the south side where players spawn, grass and a few pine
trees inland, a low cliff on the north side. Late afternoon light
with a little haze.
\`\`\`

## What the agent does

- Removes or keeps the baseplate as you asked, and fills terrain with the materials named: rock, sand, grass, water.
- Shapes the island in layers so the beach slopes into the water and the cliff rises on the north side.
- Places trees, from models already in your place or the Creator Store if you allow it (see [Find and adapt Creator Store assets](/docs/creator-store-assets)).
- Moves the \`SpawnLocation\` to the beach.
- Sets \`Lighting\`: time of day, sun, ambient colour, and an \`Atmosphere\` for the haze.

## Check it

Fly around in Studio before you press Play; terrain is easiest to judge from above and from the player's height. Then walk it, to check the spawn and the slopes.

## Refine it

- "Make the cliff twice as tall and add a path up to the top."
- "Fewer trees near the spawn so it does not feel crowded."
- "Change the time to night with moonlight."

## Tips

- Give sizes in studs when they matter ("about 300 studs across").
- Name directions or landmarks, so follow-ups like "the north side" are clear.
- Big maps are big runs. Build the shape first, then details, in separate requests: each gets its own checkpoint.
`,
  },
  {
    slug: "creator-store-assets",
    title: "Find and adapt Creator Store assets",
    description: "Ask for models, meshes and sounds from the Creator Store, placed and adjusted for your game.",
    body: `
Not everything should be built from parts. For props, characters, vehicles and sounds, the Creator Store usually has something good, and the agent can find it, bring it in and adapt it.

## The request

\`\`\`text
Find a free low-poly campfire on the Creator Store and put it next to
the spawn. Make the fire flicker and add a quiet crackling sound that
you can hear only when you're close.
\`\`\`

## What the agent does

- Searches the Creator Store for assets that match, preferring free assets that fit the style you asked for.
- Inserts the one it picks into your place, positions it and scales it to fit.
- **Checks what came in.** Free models can carry scripts. The agent reads any scripts inside an asset before keeping them, removes anything that is not needed for what you asked, and tells you what it removed.
- Adds the light and sound, with \`RollOffMaxDistance\` set so the sound fades with distance.
- Links the asset's Creator Store page in the summary so you can see its creator.

## Check it

Look at the asset in the Explorer: what it contains, and whether it has scripts. Press Play and walk up to it to hear the sound fade in.

## Refine it

- "Try a different campfire with more stones around it."
- "Make it about half the size."
- "Turn off the light at daytime."

## Tips

- Describe the style ("low-poly", "realistic", "cartoon") so what comes in matches your game.
- Ask for a specific asset by its ID if you already have one in mind.
- Respect creators: the Creator Store's terms apply to everything you insert, the same as when you insert it yourself.
`,
  },
  {
    slug: "vfx-and-sound",
    title: "Add VFX and sound",
    description: "Particles, beams, trails, lighting effects, sound effects and music.",
    body: `
Effects make a game feel alive, and they are fiddly to tune by hand. The agent can build them from a description and adjust them as you react.

## The request

\`\`\`text
When a player collects a coin, play a short sparkle burst where the
coin was and a bright "ding" sound. The coins should also slowly spin
and bob up and down while they wait to be collected.
\`\`\`

## What the agent does

- Finds the coins and the script that collects them, so the effect plays at the right moment.
- Builds the sparkle as a \`ParticleEmitter\` set to emit a single burst, with size and transparency curves so it fades out cleanly.
- Adds the sound from the Creator Store or your place, and plays it from the coin's position so it is heard in 3D.
- Animates the spin and bob with \`TweenService\` or a lightweight loop, keeping it on the client where it costs the server nothing.

## Check it

Press Play and collect a few coins. Effects are easier to judge in motion; ask for changes in plain terms.

## Refine it

- "The sparkle is too big, about half."
- "Make the ding a bit lower and quieter."
- "Add a gold trail to the player for a second after collecting."

## Tips

- Describe the feeling as well as the thing: "punchy", "soft", "magical", "heavy".
- For music, say when it should play and how it should change ("calm in the lobby, faster during rounds").
- Name the moment the effect belongs to, so the agent can hook it into the right script.
`,
  },
  {
    slug: "animate-a-rig",
    title: "Animate a rig",
    description: "Idle loops, emotes, door and machine animations, and playing them at the right moment.",
    body: `
The agent can animate rigs and objects and wire the animations into your game: an NPC's idle, an emote on a key press, a drawbridge that lowers when a button is pressed.

## The request

\`\`\`text
The shopkeeper NPC in Workspace.Shop should play a gentle idle loop
(breathing, looking around now and then) and wave when a player comes
within 10 studs.
\`\`\`

## What the agent does

- Reads the rig to see whether it is R15 or R6 and what it has: \`Humanoid\` or \`AnimationController\`, an \`Animator\`, existing animations.
- Uses animations already in your place or available to you where they fit, and builds simple keyframed motion where it does not need a full animation, such as a door swinging or a platform moving, with tweens.
- Writes the script that plays the idle on a loop and the wave on proximity, with a cooldown so it does not wave every frame.

## Check it

Press Play and walk up to the NPC. Check the animation priorities: the wave should play over the idle and return to it cleanly.

## Refine it

- "Make the wave happen only once per player."
- "Slow the idle down."
- "Have him turn to face the player while waving."

## Tips

- Name the rig and say what type it is if you know.
- Animation assets you upload are owned by your account; the agent uses what is available to your place and does not upload anything for you.
- For complex character animation, the agent sets up and wires the animations; hand-keyed performance is still best done in the Animation Editor.
`,
  },
  {
    slug: "improve-an-existing-game",
    title: "Improve an existing game",
    description: "Work on a place that already has years of scripts and builds in it.",
    body: `
StudPilot is not just for new places. Connect a game you have been working on for a long time and the agent works inside it, reading what is already there before it changes anything.

## Start by asking

On an unfamiliar or large place, a good first message is a question, not a change:

\`\`\`text
Give me an overview of how this game is put together: the main
systems, where their scripts are, and how data is saved.
\`\`\`

The agent reads the place and explains it. Asking costs a fraction of a build and gives both of you a shared picture of the game.

## Then change it

\`\`\`text
Add a daily login reward to the existing Coins system: 25 Coins on
day one, going up by 25 each consecutive day up to day seven.
\`\`\`

The agent builds on what exists. It finds the Coins system you already have and extends it, rather than creating a second one next to it.

## Clean-up and refactoring

- "The shop scripts repeat the same purchase code five times. Merge them into one ModuleScript without changing behaviour."
- "Find deprecated API calls in my scripts and replace them."
- "Move all the remote events into one folder in ReplicatedStorage and update every script that uses them."

For changes that touch many scripts, the summary lists every script it edited, and the whole run undoes in one click.

## Tips

- Be specific about what must not change: "keep the existing save format so players don't lose progress".
- Work in steps: understand, then plan, then change. Ask the agent for a plan first if the change is large.
- Keep publishing as you normally would. Checkpoints cover the agent's runs, not your whole history.
`,
  },
  {
    slug: "fix-errors",
    title: "Fix errors",
    description: "Find and fix bugs from the Output window, a description of the symptom, or both.",
    body: `
Debugging is one of the most useful things to hand to the agent. It can read your scripts, see the Output window, and trace a problem across scripts faster than scrolling through them.

## From an error message

If there is an error in Output, you can simply say:

\`\`\`text
Fix the error in the Output window.
\`\`\`

The agent reads recent Output messages, follows the stack trace to the script and line, works out the cause, and fixes it. It explains what was wrong in the summary.

## From a symptom

Many bugs do not throw errors. Describe what you see:

\`\`\`text
My leaderboard stops updating after a player rejoins. Coins still
go up in the shop, but the number on the leaderboard stays the same.
\`\`\`

The agent reads the scripts involved, finds where the value and the leaderboard drift apart, and fixes the cause rather than the symptom. When the bug only shows while the game is running, it may ask you to reproduce it in a playtest so it can read the Output.

## Check it

Reproduce the problem the way you found it. If it is a rejoin bug, test with **Clients and Servers**. If the fix is not right, say what still happens; the agent keeps the context.

## Tips

- Say how to reproduce it: "after rejoining", "only on mobile", "when two players buy at once".
- Mention what you already tried, so the agent does not repeat it.
- Ask "why did this happen?" afterwards if you want to avoid the same bug next time.
`,
  },
];
