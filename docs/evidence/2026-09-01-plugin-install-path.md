# The only install path that works today, run verbatim

**Date:** 2026-09-01 · **Mission Phase I (plugin onboarding).**

## Why this needed checking

`STUDIO_PLUGIN_STORE_LIVE` is `false`. The plugin asset exists on Roblox
(`132128477945417`) but is not distributed, so the Creator Store route does not work —
and `/docs/plugin` says so, in the page's own words:

> Not available yet. … the store page loads, but it will not offer the plugin for
> install, so the steps below will not work yet. We would rather say that plainly than
> sell you a broken link.

That is the right call and it is left alone. But it makes `/docs/build-from-source` the
**only** working way to get the plugin into Studio today, and that page had never been
executed as written.

## Run as documented

The page's command, verbatim, from the repository root:

```
rojo build apps/plugin/default.project.json --output golem-plugin.rbxm
```

```
Rojo 7.7.0
Building project 'GolemPlugin'
Built project to golem-plugin.rbxm
```

62,332 bytes, from 119,397 bytes of Luau source (`.rbxm` is LZ4-compressed).

Contents checked rather than assumed — every module the plugin needs is in the binary:

```
GolemPlugin, Generation, Ops, Paths, Render, Serializer, Version
```

So the documented path produces a real plugin, not an empty shell, and the instructions
are accurate as written.

## What this does not establish

The build is verified; the *install* is not. The remaining steps — dropping the `.rbxm`
into `~/Documents/Roblox/Plugins` and restarting Studio — were not performed here, so
this proves the artefact is produced correctly and the command is right, not that a
first-time reader ends up with a working Golem button. The page's own framing is also
worth keeping in view: it opens with "This is not how you install Golem. It is the
development and debugging path." For a non-developer there is currently **no** install
path at all, and that is a distribution blocker (`BLOCKERS.md` §4), not a documentation
one.
