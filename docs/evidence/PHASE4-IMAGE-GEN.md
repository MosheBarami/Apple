# Phase IV — Cloudflare image generation, measured

Probed live 2026-08-31 through the authenticated Cloudflare API against account
`e9b8acf2…`, model `@cf/black-forest-labs/flux-1-schnell`, `steps: 4`.

## It works

| case | prompt | latency | PNG (approx) |
|---|---|---|---|
| `icon-coin` | gold coin + full art-direction recipe (221 chars) | 1,436 ms | ~173 KB |
| `bare-control` | `"a gold coin"` (11 chars) | 1,310 ms | ~344 KB |

Both returned `result.image` as base64. Latency is ~1.3–1.5 s at 4 steps, which
is inside the range where an icon can be generated inside a build step rather
than as an offline job.

## The measurement worth keeping

**The recipe-guided image is half the size of the bare-prompt control.**

That is not a coincidence and it is useful. Flat vector art — large areas of
constant saturated colour, bold near-black outlines, no gradients, no texture
noise — compresses far better than a detailed or photoreal render. So the
*encoded PNG size, normalised against the requested pixel area, is a cheap
deterministic proxy for whether the model actually went flat*.

That matters because manifest §39 wants deterministic checks **before** an
expensive model critic. A photoreal render dressed up as a Roblox icon is the
single most likely failure of an image step, and this catches it for zero
neurons and zero latency. It is a heuristic, not a style judgement: it will not
tell you an icon is ugly, only that it is not flat.

## Operational finding: the local token cannot do this

`CLOUDFLARE_API_TOKEN` in `.env` is deploy-scoped. It passes
`/user/tokens/verify` (200) and `/accounts` (200) but returns **403 Authentication
error** on `/accounts/{id}/ai/models/search` and on `/ai/run/*`.

So image generation cannot be driven from a local script with that token. It has
to run **inside the worker through the `AI` binding**, which needs no token at
all. That is the correct architecture anyway — it keeps model access server-side
per §47 — but it means anyone testing this from a laptop will hit a 403 and
should not conclude the model is unavailable.

## Model shortlist available on this account

Ten text-to-image models are in the catalogue. Beyond `flux-1-schnell`:
`flux-2-klein-9b`, `flux-2-klein-4b`, `flux-2-dev`, `leonardo/phoenix-1.0`,
`leonardo/lucid-origin`, `stabilityai/stable-diffusion-xl-base-1.0`,
`bytedance/stable-diffusion-xl-lightning`, `lykon/dreamshaper-8-lcm`, and
`runwayml/stable-diffusion-v1-5-inpainting`.

`flux-1-schnell` is the starting point because it is cheap, fast and
open-weight/commercially usable, which §20 asks for explicitly. A comparison
across the others against the style spec has **not** been run — that is a
benchmark still owed.

## Not claimed

- No generated image has yet been judged against the style spec by eye. Size is
  a flatness proxy, not a verdict.
- Text rendering was not attempted, deliberately: §4 of the style spec requires
  heavy uppercase type with a black stroke, which image models render
  unreliably. Type belongs in real Roblox `TextLabel`s with a `UIStroke`, where
  it is sharper and controllable.
- No cost-per-image figure is recorded yet; it needs to come from the worker's
  own neuron ledger rather than a guess.
