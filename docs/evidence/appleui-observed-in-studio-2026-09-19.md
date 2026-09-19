# AppleUI rendering and a server-decided purchase, observed in Roblox Studio — 2026-09-19

w23 stood open on one sentence: *"Actual Studio rendering and real server-wired purchase results
remain unverified and required."* Thirteen executed Luau behavioural tests and install-path checks
had passed, and not one of them had ever seen a pixel.

Both are now observed, in Studio play mode on the Shahar474 account.

## What was run

`APPLE_UI_SOURCE` (35,768 bytes) was extracted from `apps/worker/src/ui-kit.ts` — the exact string
`install_module: ui_kit` ships — and installed into a place as three real instances, through the
Studio command bar over a local JSON server:

| instance | where | what it is |
|---|---|---|
| `AppleUI` | ReplicatedStorage | the shipped kit, unmodified |
| `AppleUIBoot` | StarterPlayerScripts | a LocalScript that mounts it and forwards purchases |
| `ApplePurchaseServer` | ServerScriptService | a **Script** owning prices, wallets and ownership |

The client's `onRequest` does not decide anything. It sends an item id to a `RemoteFunction` and
returns whatever the server answered.

## Rendering — observed

With the kit driven through its own API (`setBalance`, `setStatus`, `setObjectives`, `setItems`,
`notify`, `open`):

- **HUD, top right** — a balance card reading `BALANCE / 1,250 coins` with an icon, and a `Shop`
  button.
- **Objectives panel** — "Reach the second checkpoint / Completed", "Collect 500 coins" with a
  **filled progress bar at 320 / 500**, "Survive the night round".
- **Toast, bottom** — `Info — Welcome back - your streak is 4 days`.
- **Shop panel** — "Upgrades" with a Close button, a scrim dimming the world and the HUD behind
  it, a scrollbar, and rows: Speed Boost 75 coins, Double Jump 150 coins, Lantern 200 coins, each
  with a `Choose` button.

It looks like a product. Not a grey slab.

## The purchase — observed, and the server is the one deciding

```
click Choose on Speed Boost
  -> client InvokeServer("speed_boost")
  -> server: price 75, not owned, balance 1250 >= 75, deduct
  -> returns (true, "Purchased for 75 coins.", 1175)
  -> panel status: "Purchased for 75 coins."
  -> HUD balance: 1,250 coins  ->  1,175 coins

click Choose on Speed Boost AGAIN
  -> server: already owned
  -> returns (false, "You already own that.")
  -> panel status: "You already own that."
  -> HUD balance: 1,175 coins  (UNCHANGED — no double charge)
```

The second click is the one that matters. A client-side shop would have charged twice.

## Two things the kit got right, found by getting them wrong first

**It refuses a malformed call rather than rendering something wrong.** My first
`setObjectives` passed `{id, label, done}`. The real contract is `{id, title, completed}`, and the
kit's assertion rejected the whole call — which stopped the boot script, so `setItems` never ran
and the shop showed "No items available yet." That was my error and the kit's correct behaviour.

**It will not claim a purchase the server did not confirm.** My first `onRequest` only printed and
returned nothing. `onRequest` must return `(accepted, message)`, and returning nothing is a
refusal — the panel showed **"Request failed. Try again."** rather than optimistically marking the
item bought. The success path was only wired after seeing that failure path work.

## Not verified

- **This is not the product's billing.** The server script here is a local stand-in written for
  this test: an in-memory wallet in one Studio session. It proves the UI's purchase CONTRACT end to
  end — client asks, server decides, UI reports, balance follows — and it proves nothing about
  Stripe, Credits or `apps/worker`.
- **Not `install_module`.** The kit was installed by hand through the command bar because the
  shipped plugin cannot reach this place. What was rendered is byte-identical to what
  `install_module: ui_kit` writes; the install PATH through the plugin is not what was exercised.
- **One theme, one viewport.** `theme = "studio"` at Studio's default window size. No mobile
  layout, no other theme, no gamepad navigation.
- Nothing was published, saved into the owner's place file, or uploaded.
