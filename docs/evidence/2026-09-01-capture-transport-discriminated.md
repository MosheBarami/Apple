# The Studio capture transport, isolated from the camera path

**Date:** 2026-09-01 · **Place:** Golem Visual Benchmark (`116648235878426`) ·
**Studio instance:** `d99c6fb8-badc-4dda-a586-535878541a3e`

## What this adds

Gate 40 has been blocked on `screen_capture` timing out and taking the MCP transport
down with it. Five attempts were recorded before this session, all of them passing
`camera_position` and `look_at_position`. From those five the ledger concluded "the
fault is the capture transport rather than the capture parameters".

That conclusion was **not yet distinguished by an experiment** — every failing call
had also asked Studio to move the camera, so "capture is broken" and "the camera-set
inside capture is broken" predicted the same five results. If it were the latter,
Gate 40 would be reachable today by setting the camera through `execute_luau`, which
works, and then capturing with no camera arguments.

This session ran that discriminator.

## What was run

The world was verified current first, through `execute_luau`:

| folder | parts | wedges | corner wedges |
|---|---:|---:|---:|
| `Canyon.Cliffs` | 173 | 64 | 14 |
| `Canyon.Apron` | 64 | 4 | 0 |
| `Canyon` (total) | 934 | — | — |

The canonical player-eye viewpoints were resolved against live geometry, by the same
ground-probe rule `world/Viewpoints.luau` uses (`EYE = 5.4`, raycast ignoring
`Crystals`/`Signposting`/`Storytelling`):

| viewpoint | camera | look-at |
|---|---|---|
| `spawn` | `0, 5.9, -52` | `0, 47.6, 10` |
| `hub-landmark` | `0, 6.1, -14` | `0, 87.1, 18` |
| `frost-approach` | `0, 6.9, -30` | `0, 5.4, -66` |
| `meadow-wall` | `-36, 5.4, 120` | `-116, 18.2, 140` |
| `overlook` | `0, 5.4, 130` | `0, 5.7, -60` |

Then, in order:

1. **`screen_capture` WITH camera arguments** (`overlook`) → `Request timed out`.
   Immediately after, `execute_luau` → *"No Roblox Studio instances are connected"*.
   The transport recovered on its own after ~60 s, unprompted.

2. **Camera set through `execute_luau` instead** — `CameraType = Scriptable` before
   the `CFrame`, per F-10 — and verified by reading it back:
   `pos = 0, 5.4, 130`, `LookVector = 0, 0.0016, -1.0000`, `FOV 70`, `Scriptable`.
   So the working transport can place the canonical camera exactly.

3. **`screen_capture` with NO camera arguments at all** → `Request timed out`, and
   the transport went down again.

## Finding

**The camera path is exonerated.** A capture that asks Studio to do nothing but read
the framebuffer fails identically to one that also moves the camera, so nothing about
setting the camera is implicated.

The stronger phrasing — "the capture transport is the fault" — is elimination over
exactly two hypotheses, and a third was never varied: that this particular 934-part
place is simply too heavy to finish inside the capture timeout. That predicts both
results equally well. Testing it means capturing a near-empty place, which is a
different experiment and was not run. The prior conclusion was right; it is now supported by an
experiment that could have contradicted it rather than by five observations that
could not.

That closes the cheapest remaining route to Gate 40. Setting the camera out-of-band
does not help, because there is nothing wrong with setting the camera.

## What this does NOT establish

- Whether restarting Studio or its MCP plugin clears the fault. That is now the ONLY
  remaining operational step, and it was not attempted this session: the same Studio
  instance was needed, paired and working, for the §9 golden creation test, and
  `execute_luau` — which that test depends on — is healthy.

## The in-Studio render paths were checked, and there is no route there

Once the transport recovered, the datamodel was asked directly what render services
it has:

| service | present |
|---|---|
| `ThumbnailGenerator` | **no** |
| `CaptureService` | yes — `CaptureScreenshot`, `GetCaptureFilePathAsync`, `SaveScreenshotCapture`, `RetrieveCaptures` |
| `StudioService` | yes |

`CaptureService` looked like a way out: `GetCaptureFilePathAsync` would put a real
render — lighting, materials, atmosphere — onto disk where it could be read without
the MCP capture path at all. It was tried, with the canonical `overlook` camera
already set and verified. **`CaptureScreenshot`'s callback never fired** (8 s wait,
in Edit).

That is not a new finding, and recording it as one would be the mistake this project
keeps writing rules against. `apps/web/src/components/ws/playtest-card.tsx:5-7`
already states it: *"ThumbnailGenerator is not a valid service for plugins, and
CaptureService's callback never fires in edit mode — both verified against real
Studio."* This session reproduced that independently, from the other side of the
API, having forgotten it. The value here is the confirmation, not the discovery.

**So there is no in-engine capture route.** The remaining option is an operational
one — restart Studio and/or its MCP plugin — and nothing else.

## Standing

Gate 40 remains **UNPROVEN**, and it is blocked on tooling rather than on judgement.
Per §7 of the master mission this does not stop the rest of the run. The plugin
rasterizer still cannot stand in: it renders flat `SmoothPlastic` with no lighting,
materials or atmosphere, so it can say whether a composition reads and structurally
cannot answer *"finished game or prototype"*, which is the question the gate asks.
Offering it would be the same move as arguing the score up from metrics, which §5
forbids.
