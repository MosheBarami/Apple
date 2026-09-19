# Image durability and mobile release — 2026-09-18

## Shipped scope

New `generate_image` outputs use project-scoped private D1 storage rather than one-hour KV.
Quota admission and payload insertion are one guarded SQL write. Limits: 1 MiB decoded per
image, 64 images and 16 MiB encoded per project, 4096 images and 128 MiB encoded globally.
Existing images are never evicted to admit a new one. Conservative preflight refuses before
the paid model; save failures after generation return an error and no successful result card.

Project/account deletion records an ID-only tombstone before removing rows. The route refuses
legacy KV fallback when tombstoned, including failed sweep and late-preview scenarios. Temporary
preview writers retain their existing one-hour TTL; late cached bytes can remain, but cannot be
retrieved through the deleted project's image route. This residue is disclosed in receipts/docs.
Raster content type is detected from bytes; JPEG is no longer mislabeled PNG. Durable responses
are authenticated and `private, no-store`. No public image route or Roblox upload was introduced.

The composer checks actual paid-checkout availability. Free users get an honest MAX-unavailable
notice, not a redirect into unavailable purchasing. Both image and 3D controls disclose MAX.
The input draft is not cleared by the refusal. Expanded run paths wrap; Jump to latest is anchored
above the actual composer region, not at a fixed viewport offset.

## Validation actually executed

- Worker suite: **3262/3262**; web + site suite: **1883/1883**.
- Worker typecheck, web typecheck/build, site build and `git diff --check` passed.
- Newline-separated D1 DDL tested one statement at a time, matching the documented exec contract.
- Real SQLite-backed storage tests cover 90-day-old timestamps, project isolation, quota races,
  failed deletion, retry, late writes, invalid payloads and size bounds.
- Real Hono routes cover durable retrieval, MIME, owner/stranger isolation, project/account erasure,
  identical404s and deletion preventing legacy fallback. Auth/Supabase boundaries are test doubles.
- Real tool registry with a local AI stub: storage-full makes zero model/budget calls; storage
  failure after one model call emits no success panel or imageId. No paid provider was called.
- Falsification: removing the tombstone route fence made the targeted late-preview test fail
  **200 != 404**. Restored the fence and ran the full green suite. Earlier count-cap mutant likewise
  admitted65 instead of64 and failed before restoration.

## Deployment and direct browser observations

Official worker deploy verified version `581c1e69-9764-4f6f-bd71-70347cc4f3ed`,
health build `6d7a5be-dirty`. Official static uploader verified all8 web files and74 site files.
Initial web bundle `index-Dj85H7dx.js`; final 3D wording follow-up `index-DabPaM4X.js`,
CSS `index-bQpN-hqB.css`.

Root independently reproduced round22's deployed mobile defect before reloading:
at390px viewport, conversation client379px / scroll478px. After the new release, expanded Activity
measured379/379; at320px viewport it measured309/309. Jump bottom593.2px, composer top611.2px:
an18px gap rather than overlap. Root inspected the screenshot. Temporary viewport reset afterward.
Existing Studio run was only read; no prompt, Studio operation or regeneration was submitted.

In the isolated image QA project, root opened a historical image result: it correctly says unavailable,
older temporary previews may have expired, and disables downloading. Clicking Images stays at the
same project and displays “Paid subscriptions are not available yet. Your draft is kept.”
After the final follow-up reload, root also observed both `Images · MAX` and `3D · MAX`;
disconnected3D is disabled and its tooltip names both Studio and Apple MAX prerequisites.
Root closed its verification tab. Final weekly usage snapshot:80% consumed,20% remaining.

## Explicit limits

This does not recover expired old images or verify a newly generated paid image in production.
Durable write/read and deletion are executed locally; the deployed historical-image read and
unavailable-media UI are observed live. No new image generation, GPU training, payment, plugin
installation/publication or Roblox modification happened in this release. The existing Vite
large-chunk warning remains. Public plugin distribution and paid signup remain product blockers.

Budget ledger remains a$20 total ceiling with$0.05 reserved for earlier baseline requests,
not a provider-wide spending cutoff. Whole checklist weighted coverage remains59.3%, not readiness.
