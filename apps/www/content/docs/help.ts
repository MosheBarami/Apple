import type { DocPage } from "@/lib/docs";

export const help: DocPage[] = [
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "What to do when the plugin can't connect, a run gets stuck, credits run out or an undo fails.",
    body: `
Most problems have a quick fix. Find the symptom below; if nothing here helps, email [support@studpilot.app](mailto:support@studpilot.app) with the project name and roughly when it happened.

## The plugin can't connect

When you click **Connect** and the project does not find Studio:

1. **Is the place open?** Studio must have a place open, not just the start page.
2. **Is the plugin installed and enabled?** Open **Plugins → Manage Plugins** in Studio. StudPilot should be listed and switched on. If it is not there, [install it](/docs/install-the-plugin).
3. **Are you signed in to the same account?** The plugin connects to the account you are signed in with on studpilot.app.
4. **Is Studio in Play or Run mode?** Stop the playtest; the plugin does not connect during one.
5. **Restart Studio.** Plugins load when Studio starts, so a freshly installed or updated plugin needs a restart.

## HTTP requests are disabled

If the plugin says it cannot reach StudPilot, Studio is probably blocking its HTTP permission. This happens if you clicked **Deny** on the first prompt.

1. In Studio, open **Plugins → Manage Plugins**.
2. Find StudPilot and open its permissions.
3. Allow HTTP requests to \`studpilot.app\`.
4. Click **Connect** again in the project.

Your game's own **Allow HTTP Requests** setting (Game Settings → Security) is unrelated and does not need to be on. If you are on a school or work network, a firewall may also block the connection; try another network to check.

## The agent seems stuck

A long run can spend a while reading a big place or working through many changes, and the chat shows each step as it happens. If nothing new has appeared for a few minutes:

- **Check Studio is still connected.** If Studio disconnected, the agent cannot continue changing the place. Reconnect and ask it to continue.
- **Reload the page.** The run continues on StudPilot's side while the page is closed, and the chat catches up when you return.
- **Stop it.** Click **Stop**, then send the request again, more specifically if you can. Changes made so far stay in the place and can be undone.

## The agent built the wrong thing

[Undo the run](/docs/checkpoints-and-undo), then send the request again with the detail that was missing. See [Writing good requests](/docs/writing-good-requests). If it was close, reply in the same chat and say what to change instead.

## Out of credits

The app tells you when your credits reset: daily allowances at midnight UTC, monthly limits on the 1st. Everything except new requests keeps working. If you see "StudPilot has reached today's shared building capacity", it is the service-wide limit, not yours, and it resets at midnight UTC. See [Credits and limits](/docs/credits-and-limits).

## A run cost more than expected

Runs are charged for the work they did, so a broad request on a large place can cost more than the typical figures. A run that failed without changing your place gives its credits back automatically. To spend less, make requests specific and name what they touch.

## Undo failed

If undoing a run does not go through:

- **Check Studio is connected** to the same place the run was made in. Undo restores through the plugin, so it needs the place open and connected.
- **Stop any playtest.** Undo cannot change the place while Studio is in Play or Run mode.
- **Try again.** If the connection dropped part-way, a second attempt usually completes it.
- **Use Studio's undo.** The agent's changes are also normal Studio undo steps, so **Ctrl+Z** (**Cmd+Z**) can take them back one at a time, as long as Studio has not been closed since.

If it still fails, do not keep editing that area by hand; email support with the project name and the run, and we will help restore it.

## Something else

Email [support@studpilot.app](mailto:support@studpilot.app). Include the project name, what you asked for, what happened and roughly when. Never include a password or card number.
`,
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Short answers to the questions people ask most.",
    body: `
## What can StudPilot build?

Anything you can describe for a Roblox place: interfaces, scripts and game systems, terrain and maps, models from the Creator Store, effects and sound, animation, and fixes to games that already exist. It is one agent you talk to, not a menu of templates.

## Do I need to know how to script?

No. You describe what you want in plain words. If you do script, you can be as technical as you like, and you can read and edit everything it writes.

## Does it work on games I already have?

Yes. Connect the place and the agent reads what is there before it changes anything. See [Improve an existing game](/docs/improve-an-existing-game).

## Can it break my place?

Every run saves a checkpoint first, and Undo puts the place back. Each change is also a normal Studio undo step. See [Checkpoints and undo](/docs/checkpoints-and-undo).

## Who owns what it makes?

You do. What the agent builds is ordinary content in your place. Assets inserted from the Creator Store stay under the Creator Store's terms, as when you insert them yourself.

## Is my game used to train AI?

No. Data from Roblox is never used for AI training. See [Privacy and data](/docs/privacy-and-data).

## Which AI model does it use?

StudPilot runs its agent on models hosted by Cloudflare Workers AI. There is no model picker: StudPilot chooses and tunes the model so you do not have to.

## Does it work on Mac?

Yes. Roblox Studio on Windows and macOS both run the plugin. The app runs in any modern browser.

## Is StudPilot made by Roblox?

No. StudPilot is independent and is not affiliated with or endorsed by Roblox Corporation.

## How do I contact you?

Email [support@studpilot.app](mailto:support@studpilot.app).
`,
  },
  {
    slug: "changelog",
    title: "Changelog",
    description: "What changed in StudPilot, newest first.",
    body: `
## October 8, 2026

### A new website and documentation

studpilot.app has a new design and these docs are new: guides for every kind of request, the plugin's exact permissions, and troubleshooting.

### Chat catches up after a dropped connection

If your browser loses its connection during a run, the chat now recovers every update when it reconnects, instead of missing steps.

### Runs no longer stall silently, and you can stop them

A run that cannot continue now says why rather than waiting with no end. Runs can be stopped from the chat.

## October 7, 2026

### The agent reads the Roblox Creator Documentation

The agent can search the official Roblox Creator Documentation while it works, and cites the pages it used in its replies.
`,
  },
];
