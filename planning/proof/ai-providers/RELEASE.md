# AI integration release and rollback

This change is not a completed release. The existing managed engine remains the default for old
requests. New route selection is explicit, pinned at run admission and displayed in run history.

## Rollout

1. Merge only after the required CI checks and review pass. Deploy a clean integrated `main` SHA
   through `infra/deploy-worker.mjs studpilot`, then the existing static deployment script. Verify
   the live health build SHA and actual authenticated routes; a successful upload is not acceptance.
2. Provision `AI_CREDENTIAL_KEY` as an independent random 32-byte base64 Worker secret. It must
   never be stored with the D1 ciphertext, logged, exposed in export or sent to the runner.
   The D1 table is created idempotently; existing application bindings are unchanged.
3. Set `AI_BYOK_ENABLED=true` only in the environment being evaluated. It defaults off. Connect
   an explicitly authorized user's API account, discover models, test native tools, select the
   exact connection/model, and verify a real website build in the evaluation Studio place.
4. `AI_OPENCODE_ENABLED` defaults off. Enable it only after provider permission, approved service
   credentials, runtime/isolation/overhead proof and the runner release gates in its README.
   Configure the independently signed HTTPS origin; no development personal key becomes public.
5. Keep the two flags separate. Neither route falls back to the other or the managed key.
   Other providers remain runtime-unverified until an account actually completes inference.

Provision secrets only through the existing reviewed secret loaders and deployment mechanism;
use an ignored mode-600 release file if passing `--secrets-file`. Never paste values into a PR,
command arguments, a screenshot, a transcript or analytics. Preserve the independent wrapping
key across deployments; changing it without re-encrypting every row makes saved credentials
unreadable. Key replacement in Connections is separate and increments its revision atomically.

## Rollback

Set the affected flag to `false` and deploy through the same verified script. Pinning and each
external model call both check the flag, so already-pinned runs stop at their next inference
boundary. Existing keys can still be listed and removed; saving/replacing/checking keys stops.
Legacy/managed requests remain on their original route. Keep the encrypted table and wrapping
key until users remove connections or account erasure applies; do not orphan credentials.

## Evidence boundaries

Contract CI calls no provider. UI fixtures prove presentation and browser state only. The real
Cloudflare REST matrix proves five isolated model capabilities; compile-only Luau does not prove
gameplay. OpenCode public service permission and the current isolated 403 are unresolved. No
container deployment, website inference acceptance, Studio build or publication is claimed.
