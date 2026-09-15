# Roblox's own models on Hugging Face: can we serve them, and should we?

Asked of the five Roblox-published models the survey named. The answer for every one of them is
**no, not today** — for different reasons, all of them checkable.

Nothing here is remembered. Every number below is re-derived on each run of
`node scripts/harvest-hf.mjs` from the live Hub API plus this repository's own files, and written
to `packages/training/data/hf/REJECTED.json` under `models[].serving`. If a fact in this document
stops matching that file, the file is right.

---

## The short version

| model | licence | artefact | Workers AI | M2 Pro 32 GB | verdict |
|---|---|---|---|---|---|
| `Roblox/Llama-3.1-8B-Instruct-RobloxGuard-1.0` | openrail | PEFT LoRA, r=16 | **no** ×2 | **no** — gated base | not wired |
| `Roblox/roblox-pii-classifier-v2` | Apache-2.0 | full weights, 560 M | **no** | **yes**, 2.24 GB | not wired, see §4 |
| `Roblox/voice-safety-classifier-v3` | Apache-2.0 | full weights, 320 M | **no** | **yes**, 1.28 GB | out of scope — no voice |
| `Roblox/cubepart` | openrail | full weights | **no** | **not measured** | see §5 |
| `Roblox/cube3d-v0.5` | openrail | full weights | **no** | **not measured** | see §5 |

---

## 1. RobloxGuard cannot run on Workers AI. Three independent reasons.

It is a **PEFT LoRA adapter, rank 16**, over `meta-llama/Llama-3.1-8B-Instruct` — read live from
its `adapter_config.json`, not from the card.

1. **Cloudflare serves an adapter on *its* base, never on one you supply.** The LoRA-capable bases
   are Mistral-7B-v0.2, Gemma-2B/7B and Llama-2-7B (`docs/audit/INFERENCE-PROVIDERS.md` §2, this
   repository's own verified provider audit). Llama-3.1-8B is not among them.
2. **Independently: the product's own catalogue has no Llama-3.1 base at all.**
   `apps/worker/src/providers/workers-ai.ts` lists `gpt-oss-120b`, `gpt-oss-20b` and
   `llama-3.2-11b-vision-instruct`. Nothing else.
3. **Rank 16 exceeds the r ≤ 8 upload cap.** Even onto a base that did qualify, this adapter would
   be rejected at upload.

Any one of the three is sufficient. This is the same wall `packages/training/lora-apple-v1.yaml`
already hit from the other side — its "rank 8 keeps the Cloudflare path open" comment was refuted
in the provider audit, and rank 16 here is the same door being closed a second time.

## 2. RobloxGuard *could* fit on the M2 Pro. It still cannot be run there.

The base is 8.03 B parameters in BF16 = **16.06 GB**, or about **4.4 GB quantised to 4 bits**.
Either fits in 32 GB. Capacity is not the blocker.

The blocker is that `meta-llama/Llama-3.1-8B-Instruct` is `gated: "manual"` under the `llama3.1`
licence. The weights cannot be downloaded by anyone who has not personally accepted Meta's terms
and been approved by hand. That is the owner's decision to take, in his own name; a harvester must
not take it for him and must not report the model as available as though it had been taken.

Two further facts that would matter even after that gate opened:

- The M2 Pro is the **only training hardware** (`packages/training`). An 8 B guard model sharing it
  with the LoRA lane competes for the same memory bandwidth.
- `docs/audit/INFERENCE-PROVIDERS.md` §3.3 already classifies the local lane as **advisory, with a
  hard timeout** — a machine that must be awake, unthrottled and networked. A *safety* check that is
  only sometimes reachable is worse than no check, because the absence looks like a pass.

## 3. The licence is a third wall, and it applies wherever the model runs

RobloxGuard, `cubepart` and `cube3d-v0.5` are all **openrail**. OpenRAIL permits commercial use but
attaches **use-based restrictions that must flow down to every downstream user**. Nothing in
`packages/corpus/data/sources.json` can express a flow-down obligation — the registry models
permissive/not-permissive and nothing else — which is exactly why the gate admits permissive SPDX
ids only.

Six datasets were rejected at that same gate in the same run. Admitting a use-restricted model
through it would make the gate decorative.

## 4. What the product actually uses instead, today

**RobloxGuard classifies chat turns. That is not this product's safety surface.**

Apple's safety-critical surface is **third-party Luau arriving from the Roblox catalogue and being
inserted into a customer's place**. That is handled by a static scanner, not a model:

- `apps/worker/src/assets.ts` — `scanScriptSource()` (backdoor `require(id)`, obfuscated blobs,
  HTTP-calling scripts) and `brokerAsset()`, which sequences the scan with the style ranker.
- `verifyCreatorStoreAsset()` / `judgeAssetDetails()` — the provenance, type, price and moderation
  gate that runs *before* anything is fetched.
- `apps/worker/src/tools.ts` — the `run_luau` filter, so the escape hatch is not a way round the
  scanner.

And it is pinned as *running*, not merely as *existing*:
`packages/evals/src/asset-safety.test.mjs` §6–§10 drive the real tool through the real dispatcher
against a fake Studio. The file's own header records why: the scanner once shipped with 47 passing
tests and **zero call sites**.

`roblox-pii-classifier-v2` is the one model here that is genuinely servable — Apache-2.0, ungated,
560 M parameters, 2.24 GB. It is **not** wired, and should not be wired on the strength of being
available: there is no measurement yet showing that user prompts to this product carry PII. Wiring
a classifier to a surface nobody has measured produces a number, an alert path and a cost, and
answers no question that has been asked.

## 5. Roblox Cube (`cubepart`, `cube3d-v0.5`)

Both are openrail (§3). Both also report **no safetensors index** on the Hub, so their footprint
could not be derived — the harvester records that as `NOT MEASURED`, which is not the same as "it
fits", and says so in those words.

Separately, the 3-D generation lane is settled elsewhere and not by capability: see
`docs/backlog/BLOCKERS.md` on Text-to-3D persistence, and the standing decision that the 3-D mascot
and Meshy are cancelled. Cube changes none of that. It would still produce a mesh that
`GenerationService` cannot persist as a Roblox asset.

---

## How to re-check any of this

```sh
node scripts/harvest-hf.mjs          # full run; re-derives every verdict from the live Hub
# then read: packages/training/data/hf/REJECTED.json -> models[].serving
```

A capped run for review must name its own output directory, because a truncated gate written to the
canonical path would be indistinguishable from the real one:

```sh
node scripts/harvest-hf.mjs --limit 200 --out-eval /tmp/smoke/robloxqa --out-training /tmp/smoke/training
```
