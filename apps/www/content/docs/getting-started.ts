import type { DocPage } from "@/lib/docs";

export const gettingStarted: DocPage[] = [
  {
    slug: "overview",
    title: "What StudPilot is",
    description: "An AI agent for Roblox that builds what you describe, inside your own place in Roblox Studio.",
    body: `
StudPilot is an AI agent for Roblox. You describe what you want in plain words, and it builds it inside the place you have open in Roblox Studio: interfaces, scripts and game systems, terrain and maps, effects and sound, animation, fixes to things that are already there. There is no menu of predetermined outputs to choose from. If you can describe it, you can ask for it.

You talk to one agent in one chat. It reads your place, works out what you mean, looks things up in the official Roblox documentation when it needs to, and then makes the change in Studio while you watch. Everything it does lands in your place as ordinary instances and scripts, and every run can be undone.

## How it fits together

StudPilot has two parts that work as one:

- **The app at studpilot.app.** This is where you sign in, keep a project for each game, and chat with the agent. It shows the agent's work as it happens: what it is thinking about, what it searched for, and each change it makes.
- **The StudPilot plugin in Roblox Studio.** You install it once. It connects your open place to your project so the agent can read the place and make changes in it. It only acts on the place you connected, and only while it is connected.

The work itself happens in Studio. The app is where you ask and follow along.

## The flow in five steps

1. **Open a project** on [studpilot.app](/app). A project belongs to one game and keeps that game's chat and checkpoints.
2. **Install the plugin** in Roblox Studio. You do this once per computer. See [Install the plugin](/docs/install-the-plugin).
3. **Click Connect** in your project with Studio open. There is no code to copy. See [Connect Studio](/docs/connect-studio).
4. **Describe what you want.** A sentence is enough; more detail gets you closer on the first try. See [Writing good requests](/docs/writing-good-requests).
5. **Watch it work.** The agent streams its reasoning, cites the documentation it read and builds in your place. When it finishes, the result is in Studio and the run is one click from undone.

## What it is good at

StudPilot is a general agent, so the honest answer is "most things you would do in Studio by hand". A few examples of requests people send:

- "Add a settings menu with music and SFX volume sliders that save between sessions."
- "Make a round system: 30 second intermission, teleport everyone to the arena, last player standing wins."
- "Turn the baseplate into a small rocky island with a beach and a few trees."
- "Find a free low-poly campfire on the Creator Store, put it at the spawn and add a crackling sound."
- "My leaderboard stops updating after a player rejoins. Find out why and fix it."

The [guides](/docs/build-an-interface) walk through one request of each kind from start to finish.

## What it does not do

- It does not publish your game or upload anything to your Roblox account.
- It does not touch places you have not connected, or files on your computer.
- It does not run arbitrary code in Studio. It works through a fixed set of typed operations, listed in [What the plugin can change](/docs/plugin-permissions).
- It does not turn one sentence into a finished, polished game. It is very good at the next step, and the next one after that.

> [!NOTE] StudPilot is in beta
> The Free plan gives you 5 credits a day with no card. Paid plans are listed on the [pricing page](/pricing) but checkout is closed during the beta.

StudPilot is an independent product. It is not made, affiliated with or endorsed by Roblox Corporation.
`,
  },
  {
    slug: "install-the-plugin",
    title: "Install the plugin",
    description: "Add the StudPilot plugin to Roblox Studio. You do this once per computer.",
    body: `
The StudPilot plugin is the part that lives in Roblox Studio. It connects the place you have open to a project on studpilot.app, reads what the agent needs, and applies the changes the agent makes. You install it once per computer, and it stays installed for every place you open.

## Before you start

- **Roblox Studio**, signed in with your Roblox account, on Windows or macOS.
- **A StudPilot account.** Sign in at [studpilot.app](/login) with email, Roblox, or Google or Discord where the sign-in page offers them. StudPilot is for people aged 13 and older.

## Install from the Creator Store

> [!WARNING] The Creator Store listing is temporarily unavailable
> Public installation from the Creator Store is paused while the listing is restored. When it is back, the Connect panel in the app links straight to it, and the steps below apply as written. Until then, StudPilot cannot be installed by everyone; the chat on studpilot.app still works without Studio.

1. Open the StudPilot plugin page on the Creator Store. The app links to it from the Connect panel in every project.
2. Click **Get Plugin**. Roblox adds it to your inventory; it is free.
3. Open Roblox Studio (or restart it if it was open) and open any place.
4. Open the **Plugins** tab. You will see a **StudPilot** button in the toolbar.

That is all the installing there is. The first time the plugin talks to studpilot.app, Studio asks whether to allow it. That happens when you connect, described in [Connect Studio](/docs/connect-studio).

## Keeping it up to date

Studio updates plugins from the Creator Store on its own when it starts. If the app says your plugin is out of date, open **Plugins → Manage Plugins** in Studio, find StudPilot and click **Update**, then restart Studio.

## Removing it

Open **Plugins → Manage Plugins**, find StudPilot and click the bin icon. Removing the plugin disconnects every place it was connected to. Nothing in your places is removed: what the agent built is ordinary Studio content and stays where it is.
`,
  },
  {
    slug: "connect-studio",
    title: "Connect Studio",
    description: "Link the place you have open in Studio to a project. One click, no codes.",
    body: `
Connecting tells StudPilot which place in Studio belongs to which project. Once a place is connected, the agent can read it and build in it from the project's chat.

## Connect a place

1. Open the place in Roblox Studio, with the StudPilot plugin installed.
2. Open your project on [studpilot.app](/app). If you do not have one for this game yet, create it; a project is one game.
3. Click **Connect** in the project. There is no code to copy or type.
4. The first time, Studio asks whether StudPilot may connect to \`studpilot.app\`. Click **Allow**. This is Studio's own permission prompt for plugins that use the internet; you see it once.

When the connection is live, the project shows the name of the connected place, and the plugin's panel in Studio shows the project it belongs to.

> [!TIP] One place, one project
> Keep a project per game and connect the same place to it each time. The project's chat and checkpoints are that game's history, so mixing games in one project makes both harder to follow.

## What connecting allows

While a place is connected, the agent can read the place (its instances, properties and scripts, the current selection and the Output window) and make changes through the plugin's typed operations. The full list is in [What the plugin can change](/docs/plugin-permissions). There is no separate "allow edits" step: connecting a place to your project is the permission, and disconnecting takes it away.

## When the connection drops

The connection lasts as long as Studio has the place open. If Studio closes, the place is closed, or your network drops, the project shows Studio as disconnected. Open the place again and click **Connect** to pick up where you left off; the chat and checkpoints are kept in the project, not in Studio.

Entering **Play** or **Run** mode in Studio pauses the connection so the agent never edits a running game. Stop the playtest and the connection resumes.

## Disconnect

Click **Disconnect** in the project, or close the place in Studio. See [Disconnect](/docs/plugin-disconnect) for what is kept and what stops.

If Connect does not find Studio, see [The plugin can't connect](/docs/troubleshooting#the-plugin-cant-connect).
`,
  },
  {
    slug: "first-request",
    title: "Your first request",
    description: "Send a request, follow the agent's work, check the result in Studio and undo it if you want.",
    body: `
With a place connected, you are one message away from a change in Studio. This page walks through a first request so you know what to expect at each step.

## 1. Write the request

Type into the composer at the bottom of the chat. Start with something small and visible, so you can see the whole loop quickly:

\`\`\`text
Add a part above the spawn that slowly spins and glows orange.
Players who touch it get a speed boost for 5 seconds.
\`\`\`

The composer shows your credit balance as you write, so you know what you have before you send. Press **Enter** to send, or **Shift+Enter** for a new line.

## 2. Follow the agent

The agent's reply streams in as it works. You will see, in order:

- **Its reasoning**, a short running account of what it understood and what it plans to do. It is collapsed once the run moves on; open it to read it in full.
- **Documentation it searched.** When the agent needs to check how something works in Roblox, it searches the official Creator Documentation and shows what it read, with links. Here it might look up \`TweenService\` and \`Humanoid.WalkSpeed\`.
- **Each change it makes in Studio,** one line per change: the part it created, the script it wrote, the property it set, with the instance's path.
- **A short summary** at the end of what it built and how to try it, with numbered citations back to the documentation it used.

You can keep using Studio while it works. If you want it to stop, click **Stop**; changes made so far stay in the place and can still be undone.

## 3. Check it in Studio

Press **Play** in Studio and walk into the part. Everything the agent made is ordinary Studio content: select the part in the Explorer, open the script, change the numbers. It is yours.

## 4. Ask for changes

Reply in the same chat. The agent remembers the conversation and the place:

\`\`\`text
Make the boost 3 seconds and add a whoosh sound when it starts.
\`\`\`

## 5. Undo if you want

Before a run changes anything, StudPilot saves a checkpoint. Click **Undo** on a run to put the place back exactly as it was before that run. Each individual change is also an ordinary undo step in Studio, so **Ctrl+Z** (or **Cmd+Z**) works too. See [Checkpoints and undo](/docs/checkpoints-and-undo).

## Next

- [Writing good requests](/docs/writing-good-requests) to get closer on the first try.
- The [guides](/docs/build-an-interface) for longer walkthroughs: interfaces, game systems, terrain, Creator Store assets, effects, animation and fixing an existing game.
`,
  },
];
