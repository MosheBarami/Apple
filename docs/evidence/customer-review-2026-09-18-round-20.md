# Customer review — 2026-09-18, round 20

Fresh, read-only ordinary-customer pass of the live Apple site in Chrome via `cua_repl`. The
focus was image/3D feature promises, discoverability, limits, and whether a generated result can
be retrieved later. I used an already-authenticated session and an existing image-result project
only to inspect visible feature state. No generation request, spend, new project, Studio edit or
connection, upload, regenerate, save/download, delete, payment, or preference change was made.
Clicking the Images control only followed its visible plan/Usage route; I returned with browser
back.

## Overall opinion

The composer advertises both Images and 3D, but the usable contract is split across an entitlement
redirect, a disabled 3D gate, and a one-hour media cache. A prior generated image remains in the
conversation, yet its result is no longer retrievable and has no durable project-file location.
That makes media feel like a transient demo rather than an asset a customer can reliably keep.

## Reproduced, actionable findings

### R20-01 — Persistent “View results” opens expired media with no download path (P1)

Reproduction:

1. Open `/app` in the existing signed-in session and open the existing image-result project.
2. Expand the latest visible image reply’s `View results` control. The project header showed it was
   several hours old (`4h`).
3. The result panel visibly says `Generated image`, then `Unavailable: ...` and `Download
   unavailable.` The transcript still retains the result message and its `View results` affordance.
4. Navigate to `/app/usage` and back to the project, then expand the same result again. The
   unavailable state remains after leaving and returning to the project.
5. The project’s `Project files` drawer shows `0 files · 0 B stored` and accepts text extensions
   only (`.md`, `.txt`, `.json`, `.csv`, `.luau`, `.lua`, `.ts`, `.js`, `.yml`, `.yaml`). It contains
   no generated image or other media save location.
6. Public `/docs/privacy-and-data` says generated images and sound remain in cache for one hour;
   `/docs/credits-and-limits` says there is no image or model storage in project files.

Impact: a customer returning later sees a still-live retrieval control but cannot view or download
the asset. The docs disclose the one-hour cache, but the workspace gives no visible expiry timer,
durable save path, or recovery action; `Regenerate` is the only nearby action and warns that the
old reply cannot be brought back. A generated image that cannot survive a normal return visit is a
core media-result reliability failure.

### R20-02 — Images is discoverable but dead-ends at a paid tier that cannot be purchased (P1)

Reproduction:

1. In the composer, the `Images` checkbox is visible and unchecked. Its accessible help reads
   `Subscribe to Apple MAX for images`.
2. Activating that control navigates to `/app/usage`; it does not open an image preview, feature
   explanation, or an available purchase flow.
3. The model selector exposes `Apple Free · limited daily usage` and `Apple MAX — Subscribers ·
   upgrade to unlock`.
4. The Usage page says `Apple MAX: Available with a paid subscription`, while the Builder and
   Studio plan cards both say `Not available yet`. Public `/pricing` likewise says paid checkout is
   not open in this preview.
5. Searching public `/docs` for `image` returns only three general pages (Credits & limits, FAQ,
   and Privacy & data); there is no visible image-generation/how-to or result-retrieval guide.

Impact: a free customer can see an image promise but cannot tell whether images are available in
the current preview, what entitlement is required, or how to obtain that entitlement. The control
looks actionable until it redirects to a plan page whose paid path is explicitly unavailable. The
surface should either state the current preview limitation before the click or expose a clear,
current image capability/availability page.

### R20-03 — 3D has a visible gate but no public feature explanation (P2; not a new generic plugin finding)

Reproduction:

1. The composer visibly includes a disabled `3D` checkbox with accessible help `Connect Roblox
   Studio to use 3D`.
2. Expanding the Studio stage shows `Studio not connected` and says public installation is
   unavailable; it offers only the existing-plugin pairing path.
3. Searching public `/docs` for `3d` returns `Nothing matches “3d”`.

Impact: the disabled state gives a useful immediate cause, but a customer has no public explanation
of what “3D” produces, its limits/cost, or how a result is saved/retrieved. This records a
feature-specific discoverability gap; the already-known public plugin-availability blocker is not
counted again as a separate finding.

## Verified positives

- The composer labels the two media affordances and exposes an honest reason for each current gate:
  Images requires Apple MAX; 3D requires a Studio connection.
- The public docs state the one-hour media-cache limit and text-only project-file contract rather
  than silently implying permanent media storage.
- Reading the existing result, expanding drawers, following the plan route, and returning to the
  project caused no generation, billing, Studio, upload, or data mutation.

## Coverage boundary

This pass did not invoke image or 3D generation, click `Regenerate`, connect Studio, create a
project, upload/download an asset, or inspect private message content. It tests the visible
customer contract and retrieval state around an already-existing result, not the generation quality
or an actual Roblox-place edit.
