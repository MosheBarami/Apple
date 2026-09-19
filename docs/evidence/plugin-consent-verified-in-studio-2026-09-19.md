# The edit-consent gate, exercised live in Roblox Studio — 2026-09-19

w29 asks for a plugin with **explicit inspection/edit consent**, safe typed operations, executable
tests and **real Studio verification**. Every other criterion had evidence; consent had only source
lines. This is the part that had been read and never run.

Installed build: `apps/apple-plugin/release/apple-studio.rbxm` (96,797 bytes) copied to
`~/Documents/Roblox/Plugins/AppleStudio.rbxm`, Studio restarted, panel opened from **Plugins →
Apple**. Two older Apple builds were moved out of the plugin folder first, so the button that was
clicked is unambiguously this one. Signed in as **Shahar474**.

## What the panel says before anything is connected

```
Apple — Your place. Your control.
Not connected
Access: inspect only
[ Enable edits… ]            ← greyed, inert
"Edits stay off until you allow them. This build supports a limited set of place
 operations. It cannot publish, upload assets or run code inside the plugin."
No actions yet
Apple Studio · 1.0.0 · independent preview
```

The consent button is **not merely defaulted off — it is inactive**, because
`init.server.luau:219` reads `edits.Active = connected and not connecting`. Consent is scoped to a
connection and cannot be pre-granted before one exists. That is also why this verification needed a
real pairing rather than a screenshot of the idle panel.

## Paired, and still read-only

A pairing code was minted from the live workspace (project *Lumen Isles — creation journey*) and
entered in the plugin. The panel then read:

```
Connected · Lumen Isles — creation journey
Access: inspect only
[ Enable edits… ]            ← now active
```

**Pairing granted nothing.** Connecting a place and allowing writes to it are two separate acts,
and the second one had not happened.

## The two-step, clicked

| click | `Access:` line | button label | disclosure |
|---|---|---|---|
| — | inspect only | `Enable edits…` | "Edits stay off until you allow them…" |
| 1st | **inspect only** | `Allow edits for this connection` | "Apple may create or change supported objects and scripts in this place. Writes require edit mode and an undo recording. Disconnecting turns this permission off." |
| 2nd | **edits allowed for this connection** | `Turn edits off` | back to the standing text |

The first click changes **only** the disclosure and the label. The access line does not move. That
is the property the two-step exists for, and it is visible on screen rather than inferred.

Turning consent **off** takes one click, not two. The asymmetry runs in the safe direction.

## The control pair: the same request, minutes apart

This is the part that makes the above a measurement instead of a UI tour. One request, sent twice
from the deployed product, over the same pairing, differing only in consent.

**Consent OFF** — sent "Create a single Part named ConsentProbe in Workspace. Nothing else."

> The attempt to create the "ConsentProbe" part was blocked by Studio with the message:
> **"writes require explicit edit consent"**.

The plugin's own action log recorded the refusal as `⊠ create_instances`. Nothing was created.

**Consent ON** (two clicks, then the same request):

> The Part "ConsentProbe" has been successfully created in the Workspace.

And read back from Studio's Explorer rather than from the model's claim:

```
Workspace
 ├ Camera
 ├ Terrain
 ├ SpawnLocation
 ├ Baseplate
 └ ConsentProbe        ← present
```

So the refusal was caused by the consent gate, not by a broken write path: the write path works,
and it was the gate that stopped it.

The plugin was returned to `Access: inspect only` afterwards.

## The executable test, and its falsification

`apps/apple-plugin/tests/entry-runtime.test.mjs` runs the **real** `init.server.luau` against a
Studio mock and asserts the whole state machine: starts readonly; pairing does not grant writes;
first click only discloses; second click grants; leaving edit mode retires a pending first click;
disconnect clears permission; the execute fence rejects after Studio leaves edit mode.

Falsified, to prove it is a guard rather than decoration. Mutation applied to the source, one site,
verified unique before editing:

```lua
-  else
-    confirmingEdits = true      -- first click discloses
+  else
+    allowEdits = true           -- first click grants
```

Result:

```
entry.luau:461: first click only discloses
ℹ fail 1
```

The test goes red on exactly the assertion the mutation breaks, and green again on revert. A guard
nobody has seen fail is not known to be a guard.

## Not verified

- **Public distribution.** The asset (`107230158271368`, Shahar474) is published but the Creator
  Store listing was refused under Community Standards; see
  `docs/evidence/plugin-store-blocked-2026-09-19.md`. This verification used a locally installed
  build, which is the developer path, not the customer path.
- **The refusal's user-facing remedy.** The product relayed the refusal accurately and then invented
  a fix: it told the user to check *"File > Project Settings > Security → Allow Scripted Updates"*,
  which does not exist in Roblox Studio, and never mentioned the actual remedy — pressing
  **Enable edits…** twice in the Apple panel. The gate is correct; the guidance around it is wrong.
  Recorded as an open defect rather than smoothed over here.
- **Edit mode transitions.** `StudioTestService.EditModeActive` retiring a pending confirmation is
  covered by the executable test and was not reproduced by hand in the running Studio.
- **Any operation other than `create_instances`.** One refused op and one granted op is a control
  pair, not a capability sweep.
