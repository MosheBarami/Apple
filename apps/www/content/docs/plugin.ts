import type { DocPage } from "@/lib/docs";

export const plugin: DocPage[] = [
  {
    slug: "plugin",
    title: "About the plugin",
    description: "What the StudPilot plugin does in Roblox Studio, and what it never does.",
    body: `
The StudPilot plugin is the agent's hands in Roblox Studio. It connects the place you have open to a project on studpilot.app, sends the agent what it needs to read, and applies the changes the agent makes. It is deliberately narrow: a fixed set of typed operations, on one connected place, while you have it open.

## Install, connect, disconnect

- [Install the plugin](/docs/install-the-plugin), once per computer.
- [Connect Studio](/docs/connect-studio) to a project with one click.
- [Disconnect](/docs/plugin-disconnect) from the project or by closing the place.

## Design rules

- **It opens disconnected.** Installing the plugin does nothing until you connect a place to a project.
- **One place at a time.** It acts only on the place you connected, never on other places or files on your computer.
- **Typed operations only.** The agent cannot send code for the plugin to run. Every action is a specific, checked operation such as "create this instance" or "set this property". Anything outside the list is refused. See [What the plugin can change](/docs/plugin-permissions).
- **Every change is undoable.** Changes are recorded as normal Studio undo steps, and every run has a checkpoint.
- **No publishing, no uploads.** The plugin never publishes your place and never uploads anything to your Roblox account.
- **Readable source.** The plugin's code is plain Luau with no hidden or binary parts.
`,
  },
  {
    slug: "plugin-permissions",
    title: "What the plugin can change",
    description: "The Studio permissions the plugin uses, what it reads, and the operations it can perform.",
    body: `
This page is the exact boundary of what the plugin can do. If something is not listed here, the plugin cannot do it.

## The permission it asks for: HTTP

The plugin talks to StudPilot over HTTPS. Roblox Studio asks you to allow this the first time, with a prompt naming the domain \`studpilot.app\`. This is Studio's own per-plugin permission, and you can change your answer at any time in **Plugins → Manage Plugins** by clicking the plugin's permissions.

This is separate from your game's **Allow HTTP Requests** setting (\`HttpService.HttpEnabled\` in Game Settings → Security). That setting controls whether scripts in your running game can make HTTP requests. StudPilot does not need it and does not change it.

The plugin also uses Studio's script editing permission when the agent writes or edits scripts; Studio may ask you to allow script injection for the plugin the first time.

## What it reads

While a place is connected, the plugin can read:

- The instance tree of the place: names, classes, hierarchy.
- Properties and attributes of instances.
- The source of scripts in the place.
- The current selection in Studio.
- Messages in the Output window.

It reads what a request needs, not the whole place at once. It cannot read files on your computer, other places, or anything about your Roblox account.

## What it can change

Through typed operations, on the connected place only:

- Create, delete, rename, move, group and ungroup instances.
- Set properties and attributes, including position, size and transforms.
- Clone instances.
- Create scripts and edit their source. An edit is refused if the script changed since the agent read it, so it never overwrites your newer work.
- Insert assets from the Creator Store.
- Shape terrain and change lighting.
- Set the selection and move the camera, so you can see what the agent is pointing at.

Each class and property the plugin is allowed to write is on an allowlist. A write to anything else is refused.

## What it never does

- Run code it receives. There is no "execute this" operation.
- Publish your place or save it to Roblox.
- Upload anything to your Roblox account.
- Start a playtest on its own.
- Act on a place you did not connect, or keep acting after you disconnect.
`,
  },
  {
    slug: "plugin-disconnect",
    title: "Disconnect",
    description: "Stop the connection between Studio and a project, and what is kept when you do.",
    body: `
You can end a connection at any time, from either side.

## How to disconnect

- In the app: open the project and click **Disconnect**.
- In Studio: close the place, or close Studio.
- To stop everything: open **Plugins → Manage Plugins** in Studio and disable or remove the StudPilot plugin.

## What happens

- The agent can no longer read or change the place. A run in progress stops making changes and says Studio disconnected.
- Your place keeps everything the agent built. It is ordinary Studio content.
- The project keeps its chat and its checkpoints. Connect the same place again later and you can still undo earlier runs.

## Reconnecting

Open the place in Studio and click **Connect** in the project. Nothing needs to be set up again.
`,
  },
];
