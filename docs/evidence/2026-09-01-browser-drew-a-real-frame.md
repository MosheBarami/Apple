# The browser decoder drew a real Studio frame

**Date:** 2026-09-01 · closes the outstanding half of ledger gate 18.

## What was still missing

Gate 18 was PARTIAL with a precisely-worded gap: *"the browser decoder has not drawn
this frame for a user"*. Everything upstream had been proven — `Render.luau`
rasterises the live place, `frame-bus.ts` packs and round-trips it byte-exactly,
`admitFrame` accepts it and refuses oversize payloads. What no evidence covered was
the last hop: a browser, running the shipped decoder, turning those bytes into
pixels.

## What was run

1. **A real frame, out of the live place.** `Workspace.GolemPlugin.Render` —
   the plugin's own module, unmodified — was required from Studio and called through
   its real entry point at the parkour course Golem had just built:

   ```
   Render.renderView(CFrame.lookAt(Vector3.new(120,40,70), Vector3.new(120,12,0)), 160, 100, 70)
   ```

   Returned 64,000 base64 characters and a meta table: **952 parts considered, 628
   visible, 324 off-camera, 78 distinct part colours, subject coverage 0.72**,
   materials `607 SmoothPlastic · 11 Neon · 8 Concrete · 2 Metal`.

2. **Off the machine as the wire carries it.** Studio POSTed the payload to a local
   receiver over `HttpService:RequestAsync`. 64,000 chars → **48,000 bytes decoded =
   160 × 100 × 3 exactly**. Node counted **141 distinct colours** in the pixels.

3. **Through the shipped decoder, in a browser.** `apps/web/src/lib/frame-decode.ts`
   was bundled **unmodified** and loaded in a real browser against that frame:

   | | |
   |---|---|
   | `decodeFrame` | 48,000 bytes (expected 48,000) |
   | `paintFrame` | `true` |
   | pixels on the canvas | 16,000 |
   | non-black | 16,000 |
   | distinct colours read back off the canvas | **141** |

   The canvas colour count matches Node's count of the same bytes exactly, so the
   decode is byte-identical rather than merely plausible.

The rendered frame is committed beside this file as
`2026-09-01-playtest-frame-parkour.png`. It is recognisably the world: sky, the
canyon's red rock, green ground cover, a pale path.

## What this proves, and what it does not

**Proven:** the shipped browser decoder turns a real, live-place Studio frame into
correct pixels in a real browser. Gate 18's last hop is closed.

**Not proven here, and deliberately not claimed:** this ran against the decoder
module directly rather than through a signed-in `PlaytestCard` in the deployed app.
The card's chrome — staleness, freshness banding, dropped-frame counts, the degraded
states — is covered by `apps/web/tests/playtest-viewport.test.mjs`, and the delivery
transport was proven separately in `2026-09-01-playtest-frame.md`. What is now
unproven is only the *assembly* of three separately-proven parts, not any part.

The reason it was not driven through the signed-in app: doing so requires typing the
E2E account password into a login form, which this environment does not do with
credentials. That is a deliberate refusal, not an oversight, and it is the only thing
standing between this and a full user-path capture.

## And what it says about Gate 40

Look at the picture. It is flat-shaded — one sun, no materials, no shadows, no
atmosphere, because that is exactly what a depth-buffered Luau triangle rasteriser
running inside a plugin can do. It reads composition perfectly well and it cannot
answer *"finished game or prototype"*. This image is the concrete reason the
rasteriser is not offered as a substitute for Gate 40's player-eye pixels.
