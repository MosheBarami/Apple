import type { DocPage } from "@/lib/docs";

export const using: DocPage[] = [
  {
    slug: "writing-good-requests",
    title: "Writing good requests",
    description: "What to put in a request so the agent gets it right the first time.",
    body: `
The agent understands plain language, and a single sentence is often enough. But the request is the only thing it knows about what you have in your head, so a little detail goes a long way. The expensive request is almost always the one that had to be sent twice.

## Say what it is for

Describe the result and who it is for, not just the object. "A shop" could be a dozen things. "A shop where players spend coins on three speed upgrades, opened from a button on the left of the screen" is one thing.

## Point at what exists

If the request touches something already in your place, name it. The agent can read your place and will look, but a name removes the guesswork.

- "The door in \`Workspace.Lobby\`" rather than "the door".
- "The \`Coins\` leaderstat" rather than "the money".
- "The script that spawns enemies" works too; the agent will search for it.

You can also select something in Studio before you send. The agent sees the current selection, so "make the selected parts glass" does what it says.

## Give the numbers you care about

Timings, sizes, prices, colours, limits. "A 30 second intermission", "a 4 by 4 stud grid", "costs 250 coins". Where you leave a number out, the agent picks a sensible default and tells you what it picked.

## One goal per message

A request can be big ("a full round system"), but keep it to one goal. Five unrelated changes in one message are harder to review and harder to undo separately. Send them one after another instead; each run gets its own checkpoint.

## Describe behaviour, not code

You do not need to know how to script. "When a player touches the lava they respawn at the last checkpoint they reached" is a better request than a half-remembered API. If you do know what you want technically, say so: "use a RemoteEvent, validate on the server".

## Examples

| Vague | Better |
| --- | --- |
| Make a menu. | Add a main menu with Play, Settings and Credits buttons. Play closes the menu and spawns the player. |
| Add enemies. | Add a zombie that walks toward the nearest player and deals 10 damage a second on contact. Spawn three at the points in \`Workspace.ZombieSpawns\`. |
| Fix my game. | Players say they lose their coins when they rejoin. Check how \`Coins\` is saved and loaded and fix it. |
| Make it look nicer. | Change the lobby lighting to late afternoon: warm sun, soft shadows, light fog in the distance. |

## When the result is not right

Reply in the same chat and say what is off: "the button is too small on phones", "it should only trigger once per player". The agent keeps the context of the run. If the result is far off, [undo the run](/docs/checkpoints-and-undo) and ask again with the detail you now know was missing.
`,
  },
  {
    slug: "following-the-agent",
    title: "Following the agent's work",
    description: "What the agent shows while it works: reasoning, documentation searches, changes in Studio.",
    body: `
StudPilot works in the open. While a run is going, the chat shows what the agent is doing, step by step, so you are never waiting on a spinner wondering what is happening.

## What a run shows

### Reasoning

At the start of a run, and between larger steps, the agent writes a short account of what it understood and what it intends to do next. It streams as it is written. Once the agent moves on, the reasoning collapses to a single line; click it to read it again.

### Reading your place

Before changing things, the agent usually looks at what is there: the Explorer tree around where it will work, the scripts it may touch, the current selection, recent Output messages. Each read shows as a line naming what it looked at.

### Documentation searches

When the agent needs to check how Roblox works, it searches the official Creator Documentation and shows the search and the pages it read. See [Citations and sources](/docs/citations-and-sources).

### Changes in Studio

Every change is listed as it happens: instances created, properties set, scripts written or edited, things moved, grouped or deleted. Each line carries the full path of the instance, such as \`StarterGui.ShopGui.Frame.BuyButton\`, so you can find it in the Explorer. Script edits can be opened to see what changed.

### The summary

The run ends with a short reply: what was built, where it is, how to try it, and anything the agent wants you to check. Claims that came from the documentation carry numbered citations.

## Stopping a run

Click **Stop** while a run is going. The agent stops at its next step. Anything it already changed stays in your place, and the run's checkpoint still lets you undo all of it at once.

## Leaving and coming back

A run keeps going on StudPilot's side if you close the tab or your connection drops; it does not depend on the browser being open. When you come back to the project, the chat catches up with everything that happened. If Studio disconnects during a run, the agent stops making changes and says so.

## The cost of a run

When a run finishes, its cost in credits shows under the reply. Your balance is always visible in the composer. See [Credits and limits](/docs/credits-and-limits).
`,
  },
  {
    slug: "citations-and-sources",
    title: "Citations and sources",
    description: "How the agent searches the official Roblox documentation and cites what it used.",
    body: `
Roblox changes. APIs are added, deprecated and renamed, and a model's memory of them goes stale. So rather than relying on what it remembers, the StudPilot agent looks things up while it works, in the official Roblox Creator Documentation, and tells you what it read.

## When the agent searches

The agent searches when a request depends on how a Roblox API, service or feature behaves: the arguments of a function, the limits of a service, the right way to save data, how a property interacts with another. It does not search for things it does not need, so a small change often has no searches at all.

Each search shows in the chat as it happens, with the query and the pages it opened.

## How citations appear

When the summary says something that came from the documentation, it carries a numbered citation like \`[1]\`. The numbers link to the exact pages the agent read, listed under the reply. Open them to check the source yourself.

\`\`\`text
Coins are saved with DataStoreService when the player leaves and on a
60 second autosave, which stays well under the per-key write limit [1].

[1] Data stores, create.roblox.com/docs/cloud-services/data-stores
\`\`\`

## Why it matters

- **You can check the work.** A claim with a source is one you can verify in a click.
- **Fewer outdated patterns.** The agent builds against the documentation as it is today.
- **You learn as you go.** The citations are a reading list for the parts of Roblox your game uses.

## What it searches

The agent's searches go to the official Roblox Creator Documentation. It does not cite forums, videos or random websites as sources. When it adapts a model or asset from the Creator Store, the asset's page is linked the same way.
`,
  },
  {
    slug: "checkpoints-and-undo",
    title: "Checkpoints and undo",
    description: "Every run saves a checkpoint first, so any run can be undone in one click.",
    body: `
You should never have to worry about what the agent might do to your place. Before a run changes anything, StudPilot saves a checkpoint of the parts of your place the run is about to touch. If you do not like the result, undo the run and the place is back exactly as it was.

## Undo a run

Every run that changed your place has an **Undo** button under its reply. Click it, confirm, and StudPilot restores the checkpoint taken before that run. Instances the run created are removed, instances it deleted come back, and properties and scripts it changed return to their earlier values.

Undo works best newest first. Later runs are often built on top of earlier ones, so if you want to go back several runs, undo them in order from the latest.

## Undo in Studio

Each change the agent makes is also recorded as an ordinary undo step in Studio. So **Ctrl+Z** (**Cmd+Z** on macOS) in Studio steps back through the agent's changes one at a time, just like your own edits. This is handy for taking back one small change from a larger run.

## How long checkpoints are kept

StudPilot keeps the 25 most recent checkpoints for each project. Taking the 26th removes the oldest one. Checkpoints are kept with the project on StudPilot's side, so they survive closing Studio, restarting your computer or reconnecting the place.

## What a checkpoint covers

A checkpoint is a snapshot of what the run was about to change, not a copy of your whole place. That keeps it quick to take and quick to restore. It means:

- Parts of your place the run did not touch are not in its checkpoint, and undoing the run leaves them alone.
- If you edited something by hand after the run and that same thing was part of the run, undoing the run returns it to its state before the run, so your later edit to it is replaced.

> [!TIP] Save your place too
> Checkpoints protect you from the agent. They are not a backup of your game. Keep publishing or saving your place in Studio as you normally would, and use Studio's version history for anything older than your last 25 runs.

If an undo does not go through, see [Undo failed](/docs/troubleshooting#undo-failed).
`,
  },
  {
    slug: "projects",
    title: "Projects",
    description: "A project is one game: its connected place, its chat and its checkpoints.",
    body: `
A project on StudPilot is one game. It holds the place you connect from Studio, the whole conversation with the agent about that game, and the checkpoints for every run.

## Create a project

On [studpilot.app](/app), click **New project** and give it the game's name. You can connect a place right away or start chatting first; the agent can answer questions and plan without Studio, but it needs a connected place to build.

## One project per game

Keep each game in its own project. The chat is the game's memory: the agent reads the conversation to understand what you have built so far and what you asked for before. Mixing games in one project means mixing that memory.

If a game has several places (a lobby and a match place, for example), you can use one project and connect whichever place you are working on. The agent sees which place is connected.

## The chat

There is one agent and one chat per project. You do not pick modes or switch between a builder and an inspector: ask for what you want and the agent works out whether to read, explain, plan or build.

The chat scrolls back through the whole history of the project. Each run shows its steps, its changes, its citations, its cost and its Undo button.

## Rename or delete a project

Open the project's menu to rename it or delete it. Deleting a project deletes its conversation and checkpoints. It does not touch your place in Studio: everything the agent built stays there. Deleting cannot be undone.
`,
  },
  {
    slug: "game-art-and-sound",
    title: "Game art and sound",
    description: "Pictures and sound effects the agent makes, and how they get into your game through your Roblox account.",
    body: `
Most requests need no art: the agent builds interfaces from Roblox's own UI objects, and worlds from parts, terrain and Creator Store assets. When a design does need a picture or a sound that does not exist yet, the agent can make one.

## What it can make

- **Pictures:** button and panel skins, icons, title banners, item pictures, tiled textures (for example studs or wood) and backgrounds. They are drawn by an image model running on Cloudflare. Labels and numbers stay live text, so they can change in the game.
- **Sound effects:** pickups, clicks, hits, whooshes, ambience and more, made from a catalogue of sound recipes (no AI model; the same recipe and seed always give the same sound). For something the catalogue does not have, the agent looks in the Creator Store instead.

## Allowing uploads

A picture or sound has to be a Roblox asset before your game can use it. StudPilot uploads it **to your own Roblox account**, never to anyone else's, and only after you allow it once:

1. Open **Settings** and find **Roblox uploads**.
2. Press **Connect Roblox for uploads** and sign in to Roblox.
3. On Roblox's screen, press **Select** next to your account under **Your Accounts**, then **Confirm**. Without selecting the account, Roblox refuses every upload.

You can disconnect it in the same place. Until uploads are allowed, the agent builds the look in-engine instead (colours, gradients, outlines, Roblox's own textures) and tells you once.

## What to know

- **Uploads are permanent.** Roblox does not let anyone delete an uploaded image; it stays in your inventory even if the agent stops using it.
- **Roblox moderates them.** A new picture or sound can show as blank or silent for a few minutes while Roblox reviews it, and Roblox's filter sometimes refuses an innocent picture. The agent rewords and tries once more, then tells you.
- **Pictures cost credits.** Each picture is charged by the image model's usage; sound effects cost nothing to make. See [Credits and limits](/docs/credits-and-limits).
- **The agent checks its work.** It looks at what it built with its own render of your place and fixes what does not fit, so ask it to change anything you do not like.
`,
  },
  {
    slug: "credits-and-limits",
    title: "Credits and limits",
    description: "How credits work, what requests cost, when they reset and what happens when you run out.",
    body: `
A credit is a unit of AI work. Every request uses some, depending on how much work the agent does. A hard, visible allowance is what lets the Free plan be free: no card, no trial clock, no surprise bill.

## Your balance

Your balance shows in the composer, right where you type, so you always know what you have before you send. When a run finishes, its cost shows under the reply. Balances are shown with two decimals.

## What requests cost

| Request | Typical cost |
| --- | --- |
| A small change | 0.5 to 1.4 credits |
| A typical request | About 1.4 credits |
| A big system or a whole area | 4 to 12 credits (an estimate) |

These are typical costs, not quotes. A run is charged for the work it actually did, so a long run can cost more than its figure. Specific requests cost less, because the agent spends less time searching your place for what you meant.

## Allowances

| Plan | Per day | Per month |
| --- | --- | --- |
| Free | 5 credits | Up to 30 |
| Pro | Up to 20 | 100 credits |
| Max | Up to 30 | 300 credits |

A Top-up adds 50 credits that do not expire and are used after your daily allowance. Paid plans and top-ups are listed on the [pricing page](/pricing); checkout is closed during the beta.

## Resets

- The **daily** allowance resets at midnight UTC, one fixed moment for everyone.
- The **monthly** limit resets at 00:00 UTC on the 1st. A new day does not lift it.
- Unused credits do not roll over. You have whichever of the two limits is smaller.

## When you run out

New requests are declined with a clear message and the time your credits reset. Everything that does not use the agent keeps working: reading the chat, browsing your projects, undoing runs, connecting Studio. Nothing is deleted or lost.

## Failed runs

A step that fails on StudPilot's side is not charged. A run that ends in failure having changed nothing in your place gives its credits back automatically, and the reply says how many. A run that changed your place keeps its cost however it ended, because you still have what it built. Stopping a run yourself is not a failure, so it is not refunded.

## The shared limit

StudPilot also caps what the whole service spends in a day, shared by everyone. It can be reached while you still have credits; a run stopped by it says "StudPilot has reached today's shared building capacity". It resets at midnight UTC.
`,
  },
];
