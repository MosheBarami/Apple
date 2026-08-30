# Golem Specialist-AI Strategy — Decision Document

**Date:** 2026-08-31
**Supersedes / extends:** [`docs/research/hf-specialists.md`](./hf-specialists.md) (2026-08-30)
**Inputs:** nine domain surveys, each adversarially reviewed twice (a correctness refuter and a
feasibility reviewer). Eighteen verdicts were commissioned; **seventeen were returned**. The ninth
domain (`synthetic-data-training`) was truncated in transmission and its two verdicts never
arrived — see §6.1. Every place a verdict refuted or corrected its survey, **the verdict is
treated as authoritative and the correction is stated explicitly below.**

**Scope rule applied throughout:** licences are quoted from the actual `LICENSE`/README **body**
text where a reviewer read it. Where the only evidence is a Hub `license:` tag or README
front-matter, it is labelled **TAG-ONLY** — because reading front-matter *is* reading the tag, which
is the exact step the `Roblox/cube3d` precedent forbids. Several surveys wrote "verified in README
frontmatter"; a verdict correctly called that out as a method failure, and this document does not
repeat it.

---

## 1. Headline verdict

# Train nothing. Adapt nothing. Adopt no third-party model.

Not "not yet on this one axis" — **no** across all nine domains, on evidence that is independent in
each. The owner's four-part test is applied below, and the result is not close.

### 1.1 The owner's four tests

| # | Test | Result | Why |
|---|---|---|---|
| 1 | **Is there a measurable weakness?** | **PARTIAL — real, but under-instrumented** | The visual defect is genuine and has now been scored twice by the live service: `golem-plaza-baseline` **2/10**, `golem-plaza-improved` **5/10** (`packages/evals/tasks-visual/regression/RESULTS.md`, both fail the ≥6 gate). But that is *n = 2*, and RESULTS.md itself says two fixtures is not a calibration set. The 12-task visual suite exists and **has never run** (§3.2). |
| 2 | **Is there a legal dataset — real or synthetic — that addresses it?** | **NO** | Nine domains, zero clean in-domain corpora. The Roblox visual gap is total (one repo: `Shashashasha/Roblox_Images_Dataset`, <1K unlabelled JPEGs, no licence). Every adjacent corpus is either non-commercial at source (3D-FRONT, KonIQ-10k, ScanNet++, nuScenes, Waymo, Matterport3D, ShapeNet), tag-vs-provenance split (IL3D, 3D-SynthPlace, HouseLayout3D, OS-Atlas-data, Q-Tool), or licence-absent (BLINK, ShowUI-desktop-8K, Who_and_When, RICO). |
| 3 | **Does a suitable model exist?** | **NO — on reachability, before quality** | Cloudflare Workers AI is a fixed catalogue. It has **no** image-embedding model, **no** IQA/aesthetic scorer, **no** reward model or PRM, **no** GUI-grounding model, and **no** 3D task category at all. Nothing in this document can be served from the $10/mo path. BYO-LoRA does not rescue it (§5.3). |
| 4 | **Is there an eval that can measure the improvement?** | **NO, today** | The 56-task coding eval is saturated at 98.9% with 1.5 pt run-to-run variance. The visual grader (`packages/evals/tasks-visual/grade-visual.mjs`) is written, tested and **blocked**: `validateMetrics()` demands `metrics.ground`, `metrics.lighting`, `metrics.parts.smallPropCount`, and nothing in the plugin emits them. The only `metrics.json` on disk is the empty `_template`. |

**Two of four gates fail outright; the fourth fails today.** Under the owner's own rule — *"do not
fine-tune merely to say Golem has a custom model"* — the question is closed.

### 1.2 The three structural reasons, in order of finality

**(a) Reachability kills it before cost or licence.** Workers AI serves only Cloudflare's own
catalogue. A verdict independently confirmed the live catalogue carries text-only embeddings plus
`resnet-50` / `detr-resnet-50` / image-to-text / multimodal-LLM image inputs — no scorer, no image
embedder, no 3D. And the in-Worker fallback is closed by arithmetic, not opinion: the Worker bundle
limit on Paid is **10 MB gzipped / 64 MB uncompressed**, and ONNX-Runtime-Web's WASM binary alone is
~10 MB *before any weights*. (The screenshot-critique survey cited the 128 MB **per-isolate memory**
limit here; a verdict corrected it — memory is the wrong limit, bundle size is the one that bites,
and the smallest int8 CLIP pair at 152.7 MB misses by ~15×, not 1.2×.)

**(b) The best specialists lose to generalists on the axis that matters.** The single most useful
datapoint in the whole survey set is `TorpedoSoftware/Luau-Devstral-24B-Instruct-v0.2` — Apache-2.0,
103 A100-hours of Dr. GRPO, purpose-built for Luau. On its own LuauLeetcode unit-test benchmark it
scores **41.15%**. Its unspecialised base, Devstral Small 2507, scores **39.91%**. A generic
off-the-shelf coder, Qwen3-Coder-30B-A3B, scores **52.49%**.

> **Correction honoured.** The survey claimed v0.2 placed 4th behind "Claude Opus 4.1, Sonnet 4 and
> GPT-5". A verdict read `assets/bench-unit-tests.png` and refuted it: the order is Opus 4.1
> 78.87%, Sonnet 4 74.43%, **Qwen3-Coder-30B-A3B 52.49%**, Devstral v0.2 41.15%, **GPT-5 37.57%**.
> v0.2 *beats* GPT-5. The third model ahead is a generic coder. This makes the point **stronger**
> than the survey did: 103 A100-hours of domain specialisation bought ~1.2 points over its own base
> and still lost to an unspecialised coder by 11.3 points. What specialisation *did* buy was lint,
> format and typecheck compliance — because those were the four GRPO reward signals.

**(c) Distillation is economically inverted here.** How2Judge (arXiv:2602.08808) distilled 73K GPT-5
judge annotations into Qwen3-8B and reached 90.5% agreement with the *teacher*. Distillation's whole
payoff is cheaper-than-teacher inference. Golem's teacher is `@cf/zai-org/glm-5.3-flash` at
$0.15/M in, $0.03/M cached, $0.50/M out — a measured **63–72 neurons ($0.0007–0.0008) per critique**.
A distilled student would cost **more**, because Golem has nowhere free to serve it. And the ceiling
is set by the teacher: on 3D embodied scenes LEGO-Eval (arXiv:2511.03001) measured a naked VLM judge
at Holistic F1 0.40 / Cohen's κ **0.05** — chance. Distilling a κ=0.05 teacher reproduces noise
faster. The measured jump to F1 0.81 / κ 0.63 came entirely from **21 structural inspection tools**,
not from a better-trained judge.

### 1.3 What actually changed since the 2026-08-30 pass

Four things, and only one of them is a new opportunity.

1. **The "no eval exists" claim is partly obsolete, but not in the way the luau survey said.** Two
   permissive external code evals exist (`TorpedoSoftware/LuauLeetcode`, `TorpedoSoftware/RobloxQA-v2.0`).
   *A verdict refuted the framing:* the prior report named a **visual/world-quality** category as the
   prerequisite (`hf-specialists.md:53`, `:243`), because the code axis is saturated. Both new
   benchmarks measure the same saturated code axis. They de-saturate a solved problem.
2. **The visual instrument is written and blocked.** `tasks.json` (12 tasks × 12 atomic
   constraints), `rubric.json` (7 arithmetic hard-fails, cap ladder, and a test literally named
   `THE EXISTENCE-ONLY CHEAT CANNOT PASS`), and a 37 KB grader all exist. Nothing emits the metrics
   the grader requires. **This, not any model, is the bottleneck.**
3. **A genuinely free, in-path, zero-neuron signal was missed by every survey.** `apps/worker/src/png.ts`
   decodes the raw RGB buffer only to re-encode it as PNG. No luminance, contrast, colorfulness or
   edge-density code exists anywhere in the repo, and all 8 hard-fails in `vision.ts:198-231` read
   *scene properties*, never pixels. **The loop renders pixels and then judges everything except the
   pixels.** See §3.2.
4. **The 3D-generation recommendation inverted.** Both verdicts refuted it — see §1.4.

### 1.4 The most consequential refutation: Roblox `GenerationService` output does not persist

The 3D survey's central recommendation was "don't host 3D — Roblox's free first-party
`GenerationService` produces a *more game-ready artifact* anyway." A feasibility verdict read the
plugin source and inverted it:

- `apps/plugin/src/Generation.luau:20-21, 116` and `sessionScoped = true` (lines 160, 231): output is
  `Content{SourceType = Opaque}`, `MeshId` empty, and **"does not survive save/publish."** A
  generated prop vanishes when the customer publishes their place.
- The persistence fix is **unbuilt**: `CreateAssetAsync` appears in `Generation.luau` only inside a
  comment; the single `CreateEditableMeshAsync` call (line 455) serves triangle counting.
- Route P1 carries two blockers the repo itself marks *"Test this before shipping"*: the
  EditableMesh/EditableImage ID-verification plus Creator Dashboard toggle, and
  `CreateEditableMeshAsync` permission rules against `SourceType = Opaque` content.
- The "~6k triangles, textured" figure attributed to `GenerationService` is **unsourced** — the
  official API reference states no pricing, quotas, triangle count or output format. A verdict
  flagged it as the least-evidenced claim in that survey.

This does not change the verdict (don't buy or rent a GPU — that survives). It changes what the
fallback *is*: the free first-party path is currently a **preview**, not a delivery mechanism.

---

## 2. Every candidate considered

**Legend.** `VERBATIM` = a reviewer read the actual licence text. `TAG-ONLY` = Hub `license:` field
or README front-matter only, nothing corroborating — treat as unverified. `NO LICENCE` = no tag and
no file; default copyright, i.e. all rights reserved.

### 2.1 Screenshot critique / IQA / aesthetic scoring

| Repo id | Licence (verbatim where read) | Commercial | Accept / reject |
|---|---|---|---|
| `q-future/Q-ReAlign-Mini-0.8B` | `apache-2.0` **TAG-ONLY**; `Q-Future/Q-ReAlign` GitHub has **no LICENSE file** (404 on main *and* master) | **unverified** | **Reject.** Best-licensed modern scorer found, but uncorroborated at both ends: a verdict found its declared `base_model` `Qwen/Qwen3.5-VL` **does not resolve on the Hub** — the survey silently substituted `Qwen/Qwen3.5-0.8B`. Not servable regardless. |
| `q-future/one-align` | Hub tag `mit`; upstream `Q-Future/Q-Align` LICENSE is **"S-Lab License 1.0"** VERBATIM — non-commercial | **no** | **Reject.** The cube3d pattern exactly: MIT tag over a non-commercial code licence. 3.4M downloads means the conflict is widely ignored, not resolved. |
| `zhiyuanyou/DeQA-Score-Mix3` | `mit` tag; GitHub LICENSE is genuinely MIT (fetched) | unverified | **Reject.** Weights fine-tuned from `MAGAer13/mplug-owl2-llama2-7b` — Llama-2-derived yet tagged apache-2.0; the Llama 2 Community Licence chain is addressed nowhere. Trained on KonIQ+SPAQ+KADID, all research-use. 16 GB, unservable. |
| `chaofengc/IQA-PyTorch-Weights` | `cc-by-nc-sa-4.0` VERBATIM; library code **"PolyForm Noncommercial License 1.0.0"** VERBATIM | **no** | **Reject — hard.** This one repo is how MUSIQ, MANIQA, CLIP-IQA, TOPIQ, NIMA, LIQE, HyperIQA, DBCNN, BRISQUE and NIQE are practically consumed. Both weights and library are non-commercial. |
| `harpreetsahota/CLIP-IQA` | `license_name: s-lab-license-1.0` — *"Redistribution and use for non-commercial purpose"* VERBATIM | **no** | **Reject.** *Correction:* ships a single 409 MB `iter_80000.pth`, not the "17KB–474KB head" the survey claimed. |
| `shunk031/aesthetics-predictor-v2-sac-logos-ava1-l14-linearMSE` | **NO LICENCE** — and a verdict found **no README.md at all** | **no** | **Reject.** *Correction:* 1.22 GB, not "~600 MB fp32". AVA-trained: scores photographic aesthetics, not 3D construction. |
| `fsw/aesthetic-predictor-v2-5_onnx` / `discus0434/aesthetic-predictor-v2-5` | **AGPL-3.0** (verified via GitHub licence API) | restricted | **Reject** for a hosted SaaS. *Correction honoured:* AGPL §13 obliges offering the **AGPL work's** corresponding source, not automatically Golem's entire source unless combined into one work — the survey's "source-disclosure event" overstated scope. Same for `cafeai/cafe_aesthetic`. |
| `xswu/HPSv2` | apache-2.0; GitHub `tgxs002/HPSv2` Apache-2.0; data `ymhao/HPDv2` apache-2.0 — full chain | **yes** | **Reject on fit.** Cleanest chain in the survey. Ranks diffusion outputs, not 3D renders. Reference point only. |
| `zai-org/ImageReward` | apache-2.0; `THUDM/ImageReward` LICENSE fetched = Apache 2.0; `ImageRewardDB` apache-2.0 | **yes** | **Reject on fit.** Second clean chain. Grades diffusion-image preference. |
| `yuvalkirstain/PickScore_v1` | **NO LICENCE** on the weights (GitHub code is MIT; code licence ≠ weight licence) | **unverified** | **Reject.** 15.4M downloads with no grant of any kind. Download count is social proof, not a licence. |
| `gaoyuan-ai/SA-IQA-model` | apache-2.0 with explicit README text: *"The released SA-IQA model weights are licensed under the Apache License 2.0"* | **yes** | **Reject on cost.** Most domain-relevant find (interior scenes: distortion / harmony / layout / lighting). 9B / ~18 GB bf16. README states it does **not** generalise beyond interiors. |
| `gaoyuan-ai/SA-BENCH` | **DISPUTED** — LICENSE file + README License section say Apache-2.0; one verdict found the *same card's* Intended Use section reads *"non-commercial research on image quality assessment"*; the other verdict read the LICENSE and called it "genuine Apache-2.0" | **disputed** | **Reject the data; the four axes are ideas and ideas are not licensed.** The two adversarial reviewers disagree — see §6.2. Do not describe SA-BENCH as unencumbered Apache-2.0. |
| `mlx-community/SigLIP2-NR-IQA-KonIQ` | apache-2.0; card adds *"Training data KonIQ-10k is research-use — validate licensing for commercial deployment"* | restricted | **Reject.** The most honest card in the field. Still measures photographic distortion. |
| `zibuyu-02/IQA-T1` | `mit` tag; GitHub LICENSE MIT (verified) | restricted | **Reject the weights, keep the finding.** Its Q-Tool dataset is MIT-tagged but contains 10,373 images **from KonIQ-10k** — the tag covers annotations, not images. ECCV 2026; independently validates the tool-grounded architecture. |
| `trojblue/distill-q-align-quality-siglip2-base` | apache-2.0; base `google/siglip2-base-patch16-512` apache-2.0 | restricted | **Reject.** *Correction:* the survey wrote the repo id as `trojblib/...` — it does not exist. Distils Q-Align **outputs** (S-Lab upstream, unsettled) and is domain-locked to 5.8M Danbooru/Twitter anime images. |
| `google/siglip2-base-patch16-224` (family) | `apache-2.0` **TAG-ONLY** (front-matter) | yes | **Reject on serving.** Correct pick *if* an image-text ranker ever becomes affordable. Absent from Workers AI; ONNX int8 vision+text exceeds the Worker bundle limit. |
| `Marqo/marqo-ecommerce-embeddings-B` / `-L` | `apache-2.0` **TAG-ONLY** — *correction:* `-B`'s own README front-matter reads it directly; inferring from the `-L` sibling was the per-vendor pattern the cube3d rule forbids | yes | **Reject on serving.** Closest published analogue to catalogue ranking. Claimed +17.6% MRR / +20.5% nDCG@10 is **self-reported on Marqo's own eval sets**. |
| `nomic-ai/nomic-embed-vision-v1.5` | apache-2.0 (card metadata) | yes | **Reject on size.** 92.9M — smallest credible image encoder; shares a space with `nomic-embed-text-v1.5`, so one index. Still past the Worker ceiling once the text tower loads. |
| `Alibaba-NLP/gme-Qwen2-VL-2B-Instruct` | apache-2.0 (README front-matter); base apache-2.0 | yes | **Reject on cost.** The Apache-2.0 answer to the CC-BY-NC multimodal retrievers. 2.2B needs a real GPU. |
| `jinaai/jina-clip-v2` · `jinaai/jina-reranker-v2-base-multilingual` | **cc-by-nc-4.0** | **no** | **Reject.** The most-recommended open multimodal embedder (2.7M downloads) is non-commercial. Also `region:eu`. |
| `facebook/metaclip-2-worldwide-huge-quickgelu` · `nvidia/MM-Embed` | **cc-by-nc-4.0** | **no** | **Reject.** Note `facebook/PE-Core-B16-224` is Apache-2.0 — licence varies per repo *inside one org*. |
| `apple/aimv2-large-patch14-224` | `apple-amlr` | **no** | **Reject.** |
| `openai/clip-vit-base-patch32` | **NO LICENCE** — no tag, none in README (verified). Card: *"**Any** deployed use case of the model — whether commercial or not — is currently out of scope"* and names image search in a constrained environment as *"also not recommended"* | restricted | **Reject.** 668M downloads; the most-downloaded CLIP is the one that must not ship. |

### 2.2 Game-scene understanding & spatial reasoning

> **This section carries the survey's only outright refutation on licence grounds.** The survey
> recommended calibrating the judge on BLINK + VSI-Bench and called them *"two free, licence-clean
> actions."* A verdict refuted this: all three recommended benchmarks are unclearable for a
> commercial SaaS, and each licence had been "verified in README frontmatter" — i.e. the tag.

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| `LEGO-Eval/LEGO_Bench` | apache-2.0 (README front-matter) — **TAG-ONLY**, no LICENSE file | yes (schema) | **Reject the data, take the method.** 130 instructions × ~9.6 atomic constraints. Methods aren't copyrightable, so the decomposition idea is free. *Correction:* the survey's claim "Golem's renderer + metrics ARE that tool layer" is **wrong** — LEGO-Eval's 21 tools include 10 per-object/per-relation scene-graph queries (`get_object_info`, `get_spatial_relation`); Golem's metrics are scene-**global** aggregates and cannot adjudicate "red chair left of desk". That layer is unbuilt work. |
| `BLINK-Benchmark/BLINK` | **NO LICENSE FILE.** README disclaims provenance: images come *"from existing image datasets"*; forensics images *"manually collected… from online search"*; copyright owners invited to complain | **no / unverified** | **Reject.** Apache-2.0 covers annotations, not third-party images. |
| `nyu-visionx/VSI-Bench` | apache-2.0 covers **QA text only**; video is redistributed ScanNet / ScanNet++ / ARKitScenes. ScanNet++ ToU VERBATIM: *"only for non-commercial research and educational purposes. Commercial use is strictly prohibited."* ARKitScenes is Apple NC | **no** | **Reject.** Both verdicts independently. Parquet is text-only (8 cols, 85–175 KB, **no pixels**) — the annotations are useless without frames you cannot license. |
| `RunsenXu/MMSI-Bench` | `cc-by-4.0` tag contradicted by its own README Acknowledgment: nuScenes (**CC BY-NC-SA 4.0**), Waymo (NC), Matterport3D / Ego4D (signed agreements). Images embedded in a 704 MB parquet | **no** | **Reject.** NC-SA cannot be relicensed CC-BY. |
| `qizekun/OmniSpatial` | apache-2.0 (README front-matter) — **TAG-ONLY** | unverified | **Reject.** ICLR 2026. `Perspective_Taking` is the relevant task type, but the same frontmatter-is-the-tag problem applies and no reviewer read a LICENSE. |
| `Shashashasha/Roblox_Images_Dataset` | **NO LICENCE** | **no** | **Reject.** The *only* Roblox image dataset on the Hub: <1K unlabelled JPEGs, no captions, no ratings. Almost certainly scraped, so third-party copyright is live. Concrete proof the gap is total. |
| `badigadiii/game_screenshots_11k` | **NO LICENCE** | **no** | **Reject.** 11,078 rows of `{image, text}` where `text` is a title, not a rating. No supervision signal. |
| `klima7/minecraft-segmentation` | `mit` | yes | **Reject on fit.** The only permissively-licensed game-render dataset located anywhere. Wrong engine, wrong task, wrong art direction. |
| `Voxel51/GQA-Scene-Graph` | **NO LICENCE** | unverified | **Reject.** Representative of all SGG data: photographs from Visual Genome/GQA. Golem already holds exact geometry from Studio — pixel-derived structure is strictly noisier. |
| `manycore-research/SpatialLM1.1-Qwen-0.5B` | `cc-by-nc-4.0` | **no** | **Reject.** Architecturally the most Golem-shaped model found (emits structured 3D layout as text). Killed three times: NC, point-cloud input, and it re-derives facts Golem knows exactly. |
| `manycore-research/SpatialLM-Llama-1B` | `llama3.2` | restricted | **Reject.** The commercially-usable v1 is superseded; the 1.1 line went **NC** — a licence downgrade worth recording. |
| `a8cheng/SpatialRGPT-VILA1.5-8B` · `a8cheng/SpatialRGPT-Bench` | **NO LICENCE** (tags are only `safetensors llava_llama region:us`; bench README is `dataset_info` only) | **no** | **Reject.** Base VILA-1.5 is NVIDIA non-commercial and Llama-3-derived. Undeclared licence is a hard no. |
| `shyamsn97/Mario-GPT2-700-context-length` | **NO LICENCE** | unverified | **Reject.** Representative of all PCG-ML: output space is a tile grid, not an engine object hierarchy. |
| GameCraft-Bench (`FreedomIntelligence/gamecraft-bench`) | Apache-2.0 | yes (code) | **Reject as an eval, keep the number.** 140 Godot tasks, best agent **41.46%**. Rubrics and judge prompts are **deliberately held out**. That headroom profile — not 98.9% — is what a build-quality eval should look like. |

### 2.3 World-layout planning

| Repo id | Licence (verbatim where read) | Commercial | Accept / reject |
|---|---|---|---|
| `github.com/allenai/Holodeck` | Apache-2.0 (raw LICENSE read) | **yes** | **Accept the architecture, not the code.** LLM emits spatial relational constraints → solver optimises. Solver source unread (GitHub rate-limited); Luau/JS portability unverified. |
| `github.com/princeton-vl/infinigen` | BSD-3-Clause (raw LICENSE read) | **yes** | **Accept the DSL idea.** Constraint DSL + solver, zero dataset dependency — which is *why* it has no contamination. Blender/Python, needs porting. |
| `github.com/UCSB-AI/LayoutGPT` | **MIT** — *correction honoured:* the survey read `main/LICENSE` (404, branch doesn't exist). Default branch is `master`; `master/LICENSE` returns MIT, *"Copyright (c) 2023 Weixi Feng"* | **yes (code)** | **Accept the method; reject the exemplars.** Survey said "restricted"; the verdict corrected it to **yes** for the code. The shipped 3D exemplars are 3D-FRONT and cannot be used. |
| `github.com/mxgmn/WaveFunctionCollapse` | MIT (raw LICENSE, © 2016 Maxim Gumin) | **yes** | **Accept as an option.** Deterministic constraint propagation; well-understood failure modes. |
| `architext/gptj-162M` | `apache-2.0` **TAG-ONLY** — a verdict found **no LICENSE file** | **restricted** | **Reject.** Survey called it "genuinely clean because procedurally generated". *Correction:* the card says it was *"pre-trained on the Pile"* and only **fine-tuned** on Grasshopper data. The Pile is contested (Books3) and was withdrawn after a copyright complaint. Weights confirmed 329,164,611 bytes. No serving path regardless. |
| `THEODOROS/Architext_v1` | apache-2.0 (front-matter + Licensing Information section) | yes | **Reject on fit.** The only permissively-licensed layout dataset verified end to end, because a parametric Grasshopper script generated it. 2D apartment polygons — useless content, useful precedent. |
| `THEODOROS/Architext-gptj-6B` | apache-2.0 tag | — | **Reject — does not exist.** Repo contains only `.gitattributes` and `README.md`. **No weight files.** The card reads as though they were published. |
| `github.com/nv-tlabs/ATISS` | NVIDIA Source Code License §3.3 VERBATIM: *"only may be used or intended for use non-commercially and with NVIDIA Processors… non-commercially means for research or evaluation purposes only"* | **no** | **Reject.** Doubly disqualifying: non-commercial **and** hardware-restricted. Also 3D-FRONT-trained. |
| `github.com/tangjiapeng/DiffuScene` | Sony custom licence §4 VERBATIM: *"The Work and Derivative Works only may be used or intended for use non-commercially"* | **no** | **Reject.** GitHub shows only `NOASSERTION` — exactly why tags must not be trusted. Plus an AGPL-like network clause and a military-use ban. |
| `github.com/sunfanyunn/LayoutVLM` | **NO LICENCE** (404 on main *and* master; no licence text in README) | **no** | **Reject.** Strongest recent method (CVPR 2025). No grant means no permission. Ask the authors rather than vendoring. |
| `WenxuZhou/IL3D` | tagged `apache-2.0`; README lists contents as `3D-FRONT.zip`, `HSSD.zip`, `layout.zip`. `hssd/hssd-hab` is **cc-by-nc-4.0** | **no** | **Reject — the cautionary example.** Largest, most attractive recent layout dataset; the tag is simply false about the contents. |
| `B3rrYang/3D-SynthPlace_indoor_scenes_dataset` | tagged `apache-2.0`; OptiScene paper says *"upgraded from the 3D-Front dataset"* | **no** | **Reject.** *Correction, stronger than the survey:* OptiScene states 3D-SynthPlace combines **7,306 3D-Front + 9,360 Holodeck-Synth** scenes — it **contains** ~44% 3D-FRONT, not merely derives from it. |
| `houselayout3d/HouseLayout3D` | tagged `mit`; geometry from Matterport3D | **no** (survey said "restricted") | **Reject — upgraded to hard no by verdict.** Matterport EULA §2.4(a)(ii) bars *"create, use or distribute any Matterport Dataset Derived Information for any non-academic purpose"*, defined to include *"any models trained on the Matterport Dataset"*. **Weights are covered, not just geometry.** |
| 3D-FRONT / 3D-FUTURE (Alibaba) | §3.2 *"for scientific research purpose only"*; §3.3.1 *"You shall not commercialize the data sets"*; §3.3.3 forbids using *"the results obtained based on the data sets for commercialization **or providing external services**"* | **no** | **Reject — root of the contamination.** *The verdict pulled out the clause the survey missed:* "or providing external services" is a **direct hit on SaaS**. Any lineage touching this is out, whatever the tag says. |

### 2.4 Luau code specialists

> **Both verdicts refuted this survey.** The conclusion (adopt no model) survives; the supporting
> evidence and the proposed replacement do not.

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| `TorpedoSoftware/LuauLeetcode` | `apache-2.0` **TAG-ONLY** — no LICENSE file; upstream `newfacade/LeetCodeDataset` also tag-only, and `problem_description` carries LeetCode's copyrighted statements | **unverified** | **Reject for now.** *Corrections:* test split is **208 rows**, not 226 (the 226 figure was copied from a model card describing the pre-2025-10-14 split). And `Luau-Devstral-24B-Instruct-v0.2` lists this dataset as its **GRPO training data**, so it cannot fairly compare Golem to that model. Needs Studio + Jest-Lua; measures LeetCode algorithmics, not the scene defect. |
| `TorpedoSoftware/RobloxQA-v2.0` | MIT (full text reproduced in card body) | **yes** | **Accept — cheapest real win in this domain, but low priority.** 3,000 held-out MCQs; dedup **before** split; independent verifier re-derived answers; option-length bias measured at 29.8% vs 25%. Ships in ~a day: shuffle options, string-match, no execution. ~$0.19 per full run; subsample ~300 (~$0.02) per commit. **It measures the saturated axis.** |
| `TorpedoSoftware/Luau-Devstral-24B-Instruct-v0.2` | apache-2.0 (card) — but **inherits the `roblox-info-dump` restriction** via v0.1's training data and v0.2's imatrix | restricted | **Reject.** Unservable (24B, no Workers AI route, r=128, merged BF16 + GGUF only). Its *value* is the benchmark row in §1.2. |
| `TorpedoSoftware/Luau-Qwen3-4B-FIM-v0.1` | apache-2.0 | yes | **Reject on shape.** Fill-in-the-middle autocomplete. Golem writes whole scripts via tool calls; it does not do IDE autocomplete. |
| `Roblox/luau_corpus` | MIT (first-party, opt-in Data Sharing programme) | **yes** | **Keep as a provenance anchor.** Still the only unambiguously clean Luau corpus. Still last modified Nov 2023 — predates the current API surface. |
| `TorpedoSoftware/Roblox-Luau-Reasoning-v1.0` | MIT | yes | **Reject (no training).** Derived from `Roblox/luau_corpus`, inherits both the clean provenance and the staleness. |
| `Pinkstack/luau-pretrain-corpus-filtered` | ODC-BY | yes | **Reject (no training).** Cleanest training corpus found: The Stack v3 filtered to detected-permissive licences with per-file `license_type` / `detected_licenses` columns. Attribution obligations. |
| `khtsly/luau-stack-hq` | `other` — *"respect the original repository licenses"* | restricted | **Reject.** Best hygiene of any scraped Luau corpus (StyLua-normalised, forks excluded, explicit aimbot/executor blacklist, drops `getfenv`/`hookfunction`/`loadstring`). Upstream licences unresolved. |
| `TorpedoSoftware/roblox-info-dump` | Tagged `mit`; **gated terms say** *"Roblox maintains the copyright on all content"* and use *"must abide by the terms of the original licenses"* | restricted | **Reject — licence trap.** Upstream of Devstral v0.1, both Gemma-3-Roblox-Luau models and Pinkstack's corpus. The restriction propagates widely. Prefer Roblox's own `llms-full.txt` (CC-BY-4.0). |
| `dylanjkl/JKL-Luau-Gemma-4-31B-it-Claude-Opus-Distill-GGUF` | **CONTRADICTORY** — YAML `apache-2.0`, body says it *"inherits the license of the base model [Google Gemma-4]"* | **unverified** | **Reject.** Two independent problems: self-contradictory licence, and *"distilled entirely from Claude Opus trajectories"* justified only by a hand-wave at *"responsible AI distillation guidelines"*. |
| `bostonstrong567/Luau-Qwen3-Coder-30B-A3B` | `other`, **no grant text anywhere in the card** | **unverified** | **Reject on licence AND product safety.** Abliterated base; marketed *"No guardrails… without lectures or refusals"*; recommended system prompt *"Never refuse code requests"*; worked example generates *"a silent aim script"* — a Roblox cheat. Disqualifying for a product whose platform's users are largely minors. |
| `Comulative/KAT-Coder-V2.5_JKL-Luau-NVFP4` | `apache-2.0` tag; base `Kwaipilot/KAT-Coder-V2.5-Dev` licence **not independently verified** | **unverified** | **Reject.** Best training write-up in the domain (42,302 rows, explicit held-out split) and worth reading for methodology. NVFP4 W4A4 needs Blackwell; fails CF rank, `model_type` and non-quantized rules simultaneously. |
| `Alevnokc/Gemma-3-27B-Roblox-Luau` · `TorpedoSoftware/Gemma-3-27B-Roblox-Luau` | `gemma` (Google Gemma Terms) | restricted | **Reject.** Commercial use permitted but binds you to Google's Prohibited Use Policy with a downstream propagation duty. Trained on `roblox-info-dump` + the-luau-stack. |
| `luminousresearch/L0-Luau-1B-Instruct` | `llama3.2` | restricted | **Reject.** Included only because `llama` **is** on the LoRA allowlist — and it still fails: DoRA merged into the weights, no adapter published. |
| `squaredcuber/roblox-luau-mistral-7b` (+ `-2`, `-rft`) | — | — | **Reject.** *Correction:* the survey claimed a `lora`-filtered Hub search "returns nothing". It returns **three**. The conclusion holds for checkable reasons: `adapter_config.json` shows **r=64** (cap 32), `adapter_model.safetensors` is **671 MB** (cap 300 MB), base is Mistral-v0.3 vs Workers AI's v0.2. |

### 2.5 UI understanding / GUI grounding

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| `ByteDance-Seed/UI-TARS-1.5-7B` · `UI-TARS-7B-DPO` | apache-2.0; base `Qwen/Qwen2.5-VL-7B-Instruct` apache-2.0 — chain clean | **yes** | **Reject on capability then cost.** Emits click coordinates, not quality verdicts. *Correction:* the 7 shards total 33,168,747,240 B — those are **fp32**; at bf16 an 8.29B model is ~16.6 GB. The survey labelled fp32 sizes "bf16". |
| `showlab/ShowUI-2B` | `mit`; base `Qwen/Qwen2-VL-2B-Instruct` apache-2.0 | **yes** | **Reject on serving.** Cleanest small model here. *Corrections:* ships `pytorch_model.bin`, **not** safetensors, so the Hub reports no parameter count — the survey's "2,209M" is `UGround-V1-2B`'s figure. 4,418,202,778 B is verified. |
| `microsoft/GUI-Actor-2B-Qwen2-VL` | `mit`; base apache-2.0 | **yes** | **Reject on serving.** Single `model.safetensors` of 4,454,990,312 B (4.15 GiB), byte-verified. |
| `microsoft/GUI-Actor-Verifier-2B` | `mit`; base `ByteDance-Seed/UI-TARS-2B-SFT` apache-2.0 | yes | **Reject — named so nobody rediscovers it.** It verifies whether a **proposed click point** is correct, not whether a UI is well-designed. "Verifier" ≠ quality judge. |
| `microsoft/GUI-Actor-3B-Qwen2.5-VL` | Tagged `mit`; base `Qwen/Qwen2.5-VL-3B-Instruct` ships **"Qwen RESEARCH LICENSE AGREEMENT … FOR NON-COMMERCIAL PURPOSES ONLY"** VERBATIM | **no** | **Reject — cube3d pattern.** Microsoft's MIT covers Microsoft's contribution; it cannot relicense Alibaba's base. Critically, `Qwen2.5-VL-3B-Instruct` carries **no Hub licence tag at all**, so a tag filter shows this as clean. Verified by a reviewer. |
| `osunlp/UGround-V1-2B` (+7B, 72B) | apache-2.0; base apache-2.0 | yes | **Reject.** Pure visual grounding; outputs a coordinate. |
| `OS-Copilot/OS-Atlas-Base-7B` · `Pro-7B` | apache-2.0; base apache-2.0 | yes | **Reject.** The 4B variant's base chain (`OpenGVLab/InternVL2-4B` → Phi-3-mini) was **not verified** — and 4B is exactly the tier where Qwen hid a research licence. |
| `Hcompany/Holo1-7B` | apache-2.0; base apache-2.0 | **yes** | **Reject on cost.** *Correction:* the quoted $0.13/task is a **full multi-step WebVoyager task at 10 attempts** on the vendor's hosted inference (vs GPT-4.1 at $0.54), not a unit inference price. |
| `Hcompany/Holo1-3B` | "H Product RESEARCH LICENSE AGREEMENT" (3 Jun 2025) VERBATIM: *"FOR NON-COMMERCIAL PURPOSES ONLY"*; *"If you are commercially using the Materials, you shall request a license from us."* | **no** | **Reject.** Same family, same week, opposite answer to the 7B. Within a family the **small** tier is often the restricted one — and the cost/licence gradient runs backwards. |
| `jadechoghari/Ferret-UI-Llama8b` · `Ferret-UI-Gemma2b` | **NO LICENSE FILE, NO TAG.** Upstream `apple/ml-ferret`: weights *"licensed under the CC-BY-NC license"*, *"intended and licensed for research use only"* | **no** | **Reject — most dangerous repos in the survey.** 68 likes, 10K downloads, zero licence metadata. A Hub licence filter shows these as "unspecified", not "restricted". |
| `zai-org/cogagent-9b-20241220` | "The CogAgent License": free for academic research; *"Users wishing to use the model for commercial purposes must complete registration"*; mandates *"Built with CogAgent"* and a `CogAgent` name prefix on derivatives | restricted | **Reject on GPU cost alone.** *Correction:* registration is **free**, not a fee — the survey implied cost was a factor. Repo id note: THUDM was renamed to `zai-org`, so `THUDM/cogagent-9b` will not resolve. Same vendor as Golem's MIT production model — licence is **per-repo, never per-vendor**. |
| `microsoft/OmniParser-v2.0` | Repo tagged `mit`; **README states verbatim**: *"icon_detect model is under AGPL license, and icon_caption is under MIT license"* (`icon_detect/LICENSE` is 34.5 KB of full AGPL text) | restricted | **Reject — painful near-miss.** The only architecturally affordable candidate (0.6 s/frame A100). `icon_detect` is a finetuned YOLOv8 (Ultralytics AGPL-3.0). Only the `icon_caption` half (Florence-2-base, MIT) is safely reusable. |
| `likaixin/ScreenSpot-Pro` | Tagged `mit`; contents are screenshots of Photoshop, Premiere, Illustrator, AutoCAD, Unreal Engine, DaVinci Resolve, Blender, VS Code | restricted | **Reject.** An MIT tag cannot grant rights over Adobe's or Autodesk's copyrighted interfaces. Consult as a leaderboard; never train on it. |
| `Hcompany/WebClick` | apache-2.0 (tag + card) | **yes** | **Reject on fit.** Cleanest dataset in that survey. Measures click-target accuracy, not visual quality — it cannot test whether the Golem web app *looks* right. |
| `showlab/ShowUI-desktop-8K` | **NO LICENCE**; annotations augmented with **GPT-4o**; also derived from `Writer/omniact` | **no** | **Reject.** *Correction:* the survey wrote the id as `ShowUI-desktop` and named only the missing tag; the OpenAI-terms layer and the omniact derivation are additional. |
| `bevaya/RICO-Screen2Words` / RICO itself | `cc-by-4.0` covers Google's **captions**; `creative-graphic-design/Rico` tags RICO `license:unknown` | unverified | **Reject.** RICO underpins Screen2Words, UIBert, RICOSCA, Widget Captioning and much of OS-Atlas-data. Unresolved provenance contaminates a large fraction of the field. |

### 2.6 Asset ranking & retrieval

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| **`@cf/baai/bge-reranker-base`** | MIT — upstream `BAAI/bge-reranker-base` README front-matter `license: mit` | **yes** | **ACCEPT — see §4, rank 3.** $0.003/M input tokens (283 neurons/M), the cheapest unit on the entire Workers AI pricing page. Verified: batches 50 contexts in **one** call (`{query, contexts[], top_k}`), 2,000 RPM. Drop-in after the RRF fusion at `apps/worker/src/asset-library.ts:584-603`. |
| **`@cf/baai/bge-m3`** | `mit` (upstream front-matter) | **yes** | **ACCEPT as the A/B arm — a candidate both the survey and one verdict initially missed.** Same $0.012/M / 1,075 neurons as qwen3-embedding, but natively emits dense + sparse + ColBERT multi-vector, which matches D4's hybrid dense+FTS5+RRF design. Better second arm than qwen3. |
| `@cf/qwen/qwen3-embedding-0.6b` | Apache-2.0 upstream | yes | **REJECT — cost-inverted, both verdicts independently.** The survey recommended it as "cheaper AND higher-capacity". Vectorize bills **(queries + stored vectors) × dimensions**. At 100k queries / 5k assets: 384d = 40.3M (inside the 50M included, **$0**); 1024d = 107.5M → **$0.58/mo**. Token saving from $0.020→$0.012/M on ~15-token queries is **$0.008–0.012/mo**. Net ~70× worse. The survey checked only the stored axis (5.12M vs the 10M stored allowance — that sub-claim is right; the queried axis was missed). If run at all, run it on **quality**, never on cost. |
| `@cf/baai/bge-small-en-v1.5` | MIT | **yes** | **KEEP — incumbent.** 384d is the cheapest in Vectorize dimension terms even though it is not cheapest per token. Its 512-token window is ample for one-sentence asset descriptions. |
| `@cf/google/gemma-4-26b-a4b-it` | Gemma Terms of Use + Prohibited Use Policy (not OSI) | restricted | **Conditional accept for ingest-time captioning only.** $0.10/$0.30, 256k, vision. It is the captioner in Cloudflare's own AI Search image pipeline (paired with `detr-resnet-50`). Untested by Golem on a 288×180 software render. |
| `@cf/google/embeddinggemma-300m` | Gemma Terms; Hub repo is **GATED** | restricted | **Reject.** *Correction:* the survey called it "the third embedding option on Workers AI" — the pricing page lists at least six (bge-small/base/large, bge-m3, plamo-embedding-1b, qwen3-embedding-0.6b). Its price genuinely is unpublished. |
| `Qwen/Qwen3-Reranker-0.6B` · `BAAI/bge-reranker-v2-m3` · `mixedbread-ai/mxbai-rerank-base-v2` | apache-2.0 | yes | **Reject on serving.** Upgrade targets only if reranking ever proves to be the bottleneck **and** a serving budget appears. Exhaust `@cf/baai/bge-reranker-base` first. |
| `BAAI/Uni3D` · `OpenShape/*` | **NO README, NO LICENSE, NO TAG** on the weights. Code repos MIT / Apache-2.0 — which does not licence weights | **no** | **Reject.** Both partly trained on ShapeNet (non-commercial research). Closed on licence, compute **and** input shape: Golem holds no point clouds and could not legally redistribute them. `ULIP`/`ULIP-2` have no Hub presence. |

### 2.7 Failure classification / judges / PRMs

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| **`@cf/zai-org/glm-5.3-flash`** | **MIT** — full LICENSE read: *"MIT License, Copyright (c) 2026 Z.AI Co., Ltd"* | **yes** | **KEEP — the incumbent is the correct answer.** Vision, 1M context, native tools, $0.15/$0.03-cached/$0.50, already the critic in `apps/worker/src/vision.ts`. Its weakness is protocol, not capability. |
| `@cf/google/gemma-4-26b-a4b-it` | Gemma Terms (not OSI) | restricted | **Reject the framing, keep as one option.** *Correction:* the survey called it *"the ONLY in-budget cross-family visual critic"* — **false**. Workers AI also serves `qwen3.8-27b` ($0.45/$3.20), `moondream3.1-9B-A2B` ($0.30/$1.00), `llama-3.2-11b-vision-instruct` ($0.049/$0.68, already in `pricing.ts`) and `llava-1.5-7b-hf`, all vision-capable. "Cheapest" is arguable; "only" is wrong — and "only" was the entire basis for accepting non-OSI terms. |
| `@cf/baai/bge-reranker-base` (as a defect→taxonomy mapper) | MIT upstream; CF page states no licence | unverified | **Reject this use.** *Correction:* the survey called it *"the only text-classification model on Workers AI"* — also false (`distilbert-sst-2-int8`, `llama-guard-3-8b`). It is a query-document relevance model, not a classifier; the mapping may be too coarse. Untested. |
| `launch/ThinkPRM-1.5B` · `ThinkPRM-14B` | apache-2.0 | yes | **Reject.** The strongest thing that still does not apply. Best data efficiency in the field (1K synthetic verification CoTs beat discriminative PRMs trained on ~100× more data). PRMs do not transfer past maths — VersaPRM (ICML'25) measured Math-Shepherd and Qwen2.5-Math-PRM at *"only marginal improvements over baseline in Law, Philosophy, and Biology"*. Scene aesthetics is about as far from PRM800K as a domain gets. |
| `Qwen/Qwen2.5-Math-PRM-7B` | Qwen LICENSE AGREEMENT (6,962-byte file read in full): §2 grants commercial use; §4 requires a separate licence above 100M MAU; §5b compels a *"Built with Qwen"* notice; PRC law, Hangzhou courts | restricted | **Reject.** Legally usable, technically inapplicable. |
| `Skywork/Skywork-o1-Open-PRM-Qwen-2.5-1.5B` | Skywork Community License — **no LICENSE file in the repo**, README pointer only; grant is expressly **REVOCABLE** | restricted | **Reject.** A revocable grant is a poor foundation for a commercial product. |
| `RLHFlow/Llama3.1-8B-PRM-Deepseek-Data` | **NO LICENCE** — no tag, no file, no README statement | **no** | **Reject.** 198.3K downloads, used in HuggingFace's own test-time-compute blogpost, zero licensing information. High adoption is not licence clearance. |
| `peiyi9979/math-shepherd-mistral-7b-prm` | **NO LICENCE** | **no** | **Reject.** The original widely-cited PRM (323.6K downloads) and the one VersaPRM measured as failing to generalise. |
| `lmms-lab/llava-critic-7b` | apache-2.0 tag; `llava-critic-113k` README states **GPT-4o produced the judgments, reasons and preference justifications** | restricted | **Reject.** Closest thing to an open visual critic and the only one benchmarked as a VLM judge. The Apache tag is a claim over OpenAI-derived output, not a verified chain of title. |
| `prometheus-eval/prometheus-7b-v2.0` | apache-2.0 (Mistral-7B base) | **yes** | **Reject the model, borrow the prompt structure.** Cleanest open rubric-following judge: explicit criterion, per-level score descriptors, reference answer. Text-only, unhostable. |
| `opencompass/CompassJudger-1-7B-Instruct` | apache-2.0 (Qwen2.5-7B base) | yes | **Reject.** Same role as Prometheus: a source of judge-prompt structure. |
| `PatronusAI/TRAIL` | `mit` tag — but the repo is **GATED**, and one verdict was **denied read access**, so the terms are unread | unverified | **Reject the dataset AND the taxonomy.** *Both verdicts refuted this recommendation.* TRAIL classifies **agent-execution** failures (Reasoning / Planning & Coordination / System Execution). It has no category for "the column does not taper". Wrong taxonomy for a visual domain. Its 11%-best-model result is still the right evidence that trace-debugging features should not be built. |
| `Kevin355/Who_and_When` | **NO LICENCE** (README read) | **no** | **Reject the data, cite the finding.** Best automated attribution: 53.5% agent-level, **14.2%** decisive-step. Successor **Who&When Pro** is *not* unlicensed as the survey said — it is **CC BY-NC-SA 4.0**, expressly non-commercial, a *stronger* reason not to ingest. Its method ("inject a failure only after exactly replaying a successful prefix") **is** the fault-injection labeller the survey proposed as novel. Cite as prior art: method reimplementable, data not. |

### 2.8 3D generation

> **Both verdicts refuted this survey.** The economic core (do not buy or rent a GPU) survives.
> The fallback and the build-time action do not.

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| `TencentARC/Pixal3D` | **MIT** — real LICENSE file, *"MIT License / Copyright (c) 2026 Tencent"*; NOTICE lists only dinov2 (Apache-2.0), TRELLIS.2 (MIT), Direct3D-S2 (MIT), MoGe (MIT) | **yes** | **Reject as an action; keep as the standing best option.** The only candidate in that survey with a real LICENSE file. **Cannot run here:** the owner's machine is an Apple M2 Pro (arm64, Metal only, no `nvidia-smi`/`nvcc`), and Pixal3D requires the TRELLIS.2 CUDA 12.4 env plus `NATTEN_CUDA_ARCH=… pip install natten==0.21.0`. Also: its output **cannot reach Golem's library automatically** — `ASSET-PIPELINE.md` §1 rule 1 keys the library on *Mesh and Image/Decal ids, never Model ids*, and Open Cloud's Mesh type accepts *"Only content downloaded from Asset delivery API"*, so a GLB uploads only as a Model. Every asset becomes a manual 3D-Importer step. *Corrections:* the "24 GB VRAM floor" contradicts its own documented `--low_vram`; `Comfy-Org/Pixal3D` ships int8 at 5.58 GB and `Aero-Ex/Pixal3D-GGUF` ships Q4_K_M stages at ~758–784 MB. `extra_gated_eu_disallowed: true` is a **HF distribution control**, not a licence term — the MIT text has no territorial clause. |
| `microsoft/TRELLIS.2-4B` | `license: mit` front-matter + card body *"released under the MIT License"*; **no LICENSE file on the Hub** | yes (TAG+CARD) | **Reject.** fal verbatim: *"0.25 $ for 512p resolution, 0.3 $ for 1024p resolution and 0.35 $ for 1536p resolution."* $15/mo buys **43–60 generations total, service-wide**. Card: Linux only, *"at least 24GB"* VRAM, CUDA 12.4. Official export example decimates to **1,000,000 triangles** against Roblox's cap. |
| `microsoft/TRELLIS-image-large` | `mit` **TAG-ONLY** (no LICENSE on the Hub) | yes | **Reject.** The 2024 model at 1/15th the price (fal: *"$0.02 per generation"*). Quality visibly below TRELLIS.2. Still needs decimation and retopo. |
| `stepfun-ai/Step1X-3D` | GitHub LICENSE is plain Apache-2.0; **HF repo ships no LICENSE**, only the tag | unverified | **Reject.** Biggest unresolved licence question in that survey: the card describes *"an SD-XL-based texture synthesis module"*, and SDXL base is CreativeML Open RAIL++-M. Whether those use-restrictions propagate into the released texture weights is **unverified**. |
| `VAST-AI/TripoSG` | `mit` **TAG-ONLY** | yes | **Reject.** Card states *"CUDA-capable GPU (>8GB VRAM)"* — the only credible sub-24 GB option. **Geometry only, no texture**, so a bolted-on texturing stage reintroduces the saving. |
| `wushuang98/Direct3D-S2` | `mit` (card body) | yes | **Reject.** Its *"training at 1024³ with just 8 GPUs"* claim is about **training**, not inference VRAM — do not read it as a cheap-inference signal. Geometry only. Ships the only `remesh=True` flag in the survey. |
| `tencent/Hunyuan3D-2.1` (and -2, -2mini, -2mv, -Omni) | Line 3 VERBATIM: *"THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA…"*; §1.l defines Territory as worldwide **excluding** those three; §4 adds a >1,000,000 MAU trigger | **no** | **Reject.** Best PBR textures in the survey; unusable because Golem's users are worldwide. Only 2.1's LICENSE was read verbatim; the siblings are `license: other` and **assumed** same-family. |
| `tencent/Hunyuan3D-Part` | **LICENSE.txt EXISTS** (17,015 bytes) = TENCENT HUNYUAN 3D-PART COMMUNITY LICENSE AGREEMENT, same restricted family | **no** | **Reject — but for the right reason.** *Correction:* the survey said, twice, that this repo has *"NO LICENCE AT ALL"* and therefore *"no grant, no rights"*. That is **false**. The README simply omits a `license:` key, so no tag renders. Exclusion stands on the restrictive terms, not on absence. |
| `stabilityai/stable-fast-3d` | STABILITY AI COMMUNITY LICENSE (read from the **GitHub mirror**; the Hub repo is gated and `LICENSE.md` was unreadable): rights terminate above *"USD $1,000,000 in annual revenue… regardless of whether that revenue is generated directly or indirectly"*; commercial use *"must register with Stability AI"* | restricted | **Reject.** A revenue tripwire plus a registration duty — the worst shape of cost risk for a company intending to grow. Hub copy **unverified**. |
| `Roblox/cube3d-v0.5` | Actual LICENSE title: **"CUBE3D RESEARCH-ONLY RAIL-MS LICENSE"**; *"Permitted Purpose" means "for academic or research purposes only"*. Hub tag still says `license:openrail` | **no** | **Reject.** The tag-vs-text trap is **still unfixed a year on**. This is the precedent that governs this entire document. |
| `TencentARC/InstantMesh` | Apache-2.0 | yes | **Reject on quality.** Genuinely unrestricted, 2.8M downloads, but a generation or two behind. Powers `ThomasSimonini/Roblox-3D-Assets-Generator-v1`, the only Roblox-targeted 3D Space found. |
| `ashawkey/LGM` | MIT | yes | **Reject on format.** 415M params — smallest here — but outputs **Gaussian splats**, which Roblox cannot render. Splat→mesh conversion degrades exactly the quality you paid for. |
| `VAST-AI/TripoSplat` | `mit` **TAG-ONLY** (no LICENSE on the Hub) | yes | **Reject on format.** Same splat blocker. Sibling MIT repos `VAST-AI/AniGen` and `VAST-AI/UniRig` do auto-rigging, which Roblox NPCs need and no generator here provides. |
| `craftsman3d/craftsman` | `creativeml-openrail-m` | restricted | **Reject.** OpenRAIL-M Attachment A use-restrictions must be passed to every downstream user — unworkable for a self-serve SaaS whose users generate assets Golem cannot police. Effectively abandoned (Nov 2024). |
| `facebook/sam-3d-objects` | "SAM License" — read via summarisation only, **not verbatim end to end**; AUP unread | unverified | **Reject pending a read.** Gated; access requires disclosing full legal name and org to Meta. Probable-yes. |

### 2.9 Synthetic data / training bases

> ⚠ **This domain's two adversarial verdicts were never received** (§6.1). Everything here is
> survey-only and has **not** been independently refuted. Weight it accordingly.

| Repo id | Licence | Commercial | Accept / reject |
|---|---|---|---|
| `Qwen/Qwen3-VL-4B-Instruct` · `-8B-Instruct` | `apache-2.0` **TAG-ONLY** — no LICENSE file confirmed | yes | **Reject.** Best base *if* a judge were ever trained: no EU carve-out, no naming rule, QLoRA-fits a free T4. **No serving path** — Workers AI cannot host it and would reject a `qwen3_vl` adapter. |
| `HuggingFaceTB/SmolVLM2-2.2B-Instruct` | **Apache 2.0 — VERIFIED in README body:** *"We release the SmolVLM2 checkpoints under the Apache 2.0 license"* | **yes** | **Reject on serving.** The only base in this domain whose licence text was read directly. Cheapest credible judge base (5.2 GB inference). Vision benchmarks are modest (MMStar 46, MMMU 42) — expect a weak judge needing structural scaffolding anyway. |
| `unsloth/Llama-3.2-11B-Vision-Instruct` / `@cf/meta/llama-3.2-11b-vision-instruct` | `llama3.2` — the Llama 3.2 Community Licence **withholds the multimodal grant from individuals domiciled in, or companies headquartered in, the EU**; distributed derivatives must carry a `Llama` name prefix | restricted | **Reject — but this is the one genuine open conflict in the document.** The UI verdict called it *"the only trainable, hostable, commercially-clean VLM in the stack"* (Vision ✓, LoRA ✓, 128k, $0.049/$0.68). The synthetic-data survey read `config.json` and found `model_type: "mllama"`, which is **not** in Cloudflare's `{mistral, gemma, llama}` allowlist. See §6.3 — this is cheap to settle and nobody has. |
| `marvin-brt/LLama3.2-aesthetic_predictor_LoRA_2` | apache-2.0 tag, but a Llama-3.2 derivative so Llama terms flow through | restricted | **Reject.** Empirical proof the vision LoRA path is closed: **no `model_type` field**, r=16, 4-bit-quantized base, seven extra files, targets vision-tower modules — fails at least three CF constraints simultaneously. |

### 2.10 Compute providers evaluated (survey-only, no adversarial review)

| Provider | Terms | Verdict |
|---|---|---|
| Kaggle free GPU (30 h/week) | Terms of Use, eff. 22 Jun 2025 VERBATIM: *"You will only use the Services for your own internal, personal, **non-commercial** use, and not on behalf of or for the benefit of any third party"*; also forbids >1 active account | **Legally closed.** Training a judge for a commercial SaaS breaches this. |
| HF ZeroGPU (free tier) | 2 Spaces; **5 GPU-min/day** (unauthenticated 2 min); Gradio SDK only; 60 s default per `@spaces.GPU` call; no `torch.compile` | **Not a backend.** ≈75 four-second judgements/day across *all* users, charged to the **calling** account. |
| HF PRO ($9/mo) ZeroGPU | 40 min/day on RTX Pro 6000 Blackwell (48 GB) — clears TRELLIS.2's 24 GB floor | **Refutes "the curves never cross" — and still stops.** ~20 GPU-h/month inside a nominal budget. But $9/mo **requires a card for a new service**, which the owner's rule forbids, and it eats most of the discretionary headroom. **STOP AND ASK before any charge.** |
| HF Jobs | Available to *"any user or organization with a positive credit balance"*; t4-small $0.40/h … h200 $5.00/h, billed per minute | **Closed by the no-card rule.** A 5-hour L4 run is $4.00 — real and affordable in isolation, and still a new paid service. |
| Modal Starter ($30/mo credits) | T4 $0.59/h, L4 $0.80/h, A100-80 $2.50/h, H100 $3.95/h | **The only genuinely-free, commercially-clean GPU path found.** ≈51 T4-hours or 37 L4-hours/month at $0 marginal cost. **UNVERIFIED:** whether Starter requires a card on file, and whether the ToS restricts commercial free-tier use. Verify both before relying on it — and it still leads nowhere, because there is no serving path (§5.3). |
| RunPod / HF Inference Endpoints (always-on) | — | **10–16× over ceiling.** 730.6 h/mo × $0.34/h (Community RTX 4090) = **$248.39/mo**. Inverted: $15 buys 44 GPU-hours = **1.47 h/day**. Break-even for owning a GPU vs fal's $0.30/gen is **828 gen/mo**; the budget caps you at ~50. The curves never cross inside the budget. |

---

## 3. The one highest-value opportunity

### 3.1 First, the honest answer to "what would you train"

**Nothing.** Not one training project passes the four gates. The single closest candidate — and the
only one that could conceivably have been served — is worth naming precisely so it is never
re-litigated from vibes:

> **The candidate that comes closest.** A rank-≤32, <300 MB LoRA judge on
> `@cf/meta/llama-3.2-11b-vision-instruct` (Vision ✓, LoRA ✓, 128k context, $0.049/M in / $0.68/M
> out, already priced in `apps/worker/src/pricing.ts`), trained offline on Modal's free credits from
> self-generated `(scene, 5 renders, measured metrics, Lighting, critique)` tuples, and served on
> Workers AI at base-model token prices with **no** recurring GPU cost.
>
> **What kills it, in order:**
> 1. **`model_type: "mllama"`**, read from `config.json`, is not in Cloudflare's `{mistral, gemma,
>    llama}` allowlist. If this holds, the path is closed at upload and nothing else matters.
>    (Contested — §6.3.)
> 2. **The Llama 3.2 Community Licence withholds the multimodal grant from EU-domiciled
>    individuals and EU-headquartered companies**, and compels a `Llama` name prefix on distributed
>    derivatives. That is a materially worse legal position than the MIT Golem holds today.
> 3. **No labels exist.** A judging pass is ~109 neurons ≈ $0.0012, so the free 10,000 neurons/day
>    buys ~92 labelled samples/day — a 10,000-sample set is ~109 days of spending the *entire* daily
>    AI budget, or ~$12 up front. **Generating the scenes to label is far worse**: an agentic build
>    run is ≈$0.01/scene ≈ **$100 per 10k scenes ≈ 20 months of the whole AI budget.**
> 4. **The labels would be circular.** Every degradation Golem can programmatically inject
>    (materials→Plastic, randomise colours, delete the lighting pass, unanchor) is one the
>    plugin's *measured* metrics already detect in closed form. You would spend GPU hours training a
>    neural approximation of a rule writable in ten lines of Luau.
> 5. **The published attempt at exactly this failed to beat prompting.** arXiv:2512.05145 (Meta FAIR
>    + UW) took Llama-3.2-11B-Vision, 100k synthetic prompts, 4 self-improvement iterations, a full
>    FSDP fine-tune on 8 GPUs, 5 epochs — VL-RewardBench 0.383 → 0.538. GPT-4o scores 0.624 on the
>    same benchmark. After eight-GPU training it merely **matched** a frontier model and lost to
>    the strongest one.

Gate 1 alone is decisive. Gates 3 and 4 mean that even a free serving path would not make it
worthwhile. **Do not build this.**

### 3.2 The one opportunity that *is* available: make the pixels measurable

Every survey searched for a model that scores renders. The thing actually missing is not a model —
it is **numbers**. Two independent verdicts, in two different domains, arrived at the same
conclusion by different routes:

- *screenshot-critique, feasibility verdict:* `png.ts:102` decodes the raw RGB buffer only to
  re-encode it as PNG; a grep found **no** luminance/histogram/colorfulness/edge code anywhere in
  the repo; and all 8 hard-fails at `vision.ts:198-231` read scene properties, never pixels.
  **"The loop renders pixels then judges everything except the pixels."**
- *game-scene, feasibility verdict:* `grade-visual.mjs`'s `validateMetrics()` requires
  `metrics.ground`, `metrics.lighting`, `metrics.parts.smallPropCount` (and downstream
  `tallestStuds`, `medianHeightStuds`). `Render.capture` (`Render.luau:326-335`) returns only
  `subject`, `boundsSize`, `views[].meta` and `lighting`. The only `metrics.json` on disk is the
  empty `_template`. **The 37 KB grader has never run on a real capture.**

Both are the same deliverable: **a metrics producer.** Build it and the existing 12-task visual
eval — already written, already carrying 144 atomic constraints and 7 arithmetic hard-fails —
becomes runnable. Skip it and *every* other item in this document remains unmeasurable, including
any future decision to revisit training.

#### The deliverable, concretely

**Part A — pixel statistics (~30 lines, Worker-side, 0 neurons).**
Compute over the RGB buffer that `png.ts` already holds in memory, per view:

| Statistic | What it catches | Why NR-IQA misses it |
|---|---|---|
| Luminance decile histogram | value flatness / bimodality | it is not a distortion |
| RMS contrast | washed-out or blown tonal range | ditto |
| Hasler–Süsstrunk colorfulness | palette width; the grey-slab failure | ditto |
| Sobel edge density | bare untextured surfaces, missing trim | ditto |

This is **the exact inverse of NR-IQA**. The baseline render
(`regression/golem-plaza-baseline/views/hero.png`) is sharp, noiseless and evenly exposed — a
verdict confirmed this against the real artifact — so every NR-IQA distortion axis reads *clean*.
The failure lives in colorfulness, edge density and value structure, which is precisely what these
four numbers measure. They make `value_structure` and `palette_discipline` **measured** rather than
opined.

Cost: single-digit ms against a 5-minute CPU ceiling; ~150 KB/view already resident. No new binding,
service, model or licence.

> **Honest limit, per the survey's own gap list:** nobody has published an evaluation of *any*
> perceptual metric on low-resolution synthetic 3D renders. These four statistics are standard and
> cheap, but their thresholds must be **calibrated on Golem's own fixtures**, not imported. The
> prediction that they separate baseline from improved is well-reasoned and **untested** — testing
> it is step 1 below, and it costs nothing.

**Part B — the scene-metrics probe (~80 lines of Luau + wiring).**
Extend the Luau probe already live at `visual-bench.mjs:126-158`, which injects arbitrary Luau into
Studio and returns parts / small / unanchored / materials / colours / lights / heightSpan, to emit
the grader's exact schema.

> **Blocker to reconcile first:** the probe's `small` is *volume < 8 cubic studs*; the grader's
> `smallPropCount` is *largest dimension < 2 studs*. These are different predicates. Pick one and
> make both sides agree, or every hard-fail keyed on it is wrong.

**Part C — implement the layout metrics that are already specified.**
`docs/research/visual-eval-design.md` §7.8 already defines `neighbourSpacingCV`, `latticeScore` and
`rotationEntropy`, plus caps C4/C5 and the walkability flood-fill. A grep finds **zero**
implementations outside that document. They need no new capture and no model call — positions, sizes
and rotations already exist in `scene.parts`, so it is pure JS.

> **Correction honoured.** The world-layout survey said to *"add layout metrics FIRST"*. A verdict
> refuted the verb: they are already designed in detail. The task is **IMPLEMENT**, not ADD. Only
> coverage / dead-space is genuinely absent.

#### Data · model · training · eval

| Question | Answer |
|---|---|
| **What data?** | Golem's own. The plugin already produces `(scene, 5 × 288×180 renders, measured metrics, Lighting)` with **exact** Studio ground truth. Licence-free by construction, in-domain, unlimited. No third-party download, so none of §5.1 applies. |
| **What model?** | **None.** Parts A–C are deterministic arithmetic. `@cf/zai-org/glm-5.3-flash` stays the sole in-service critic, unchanged. |
| **What training?** | **None.** |
| **What eval?** | The existing `packages/evals/tasks-visual` suite: 12 tasks × 12 constraints, `rubric.json`'s 7 hard-fails and cap ladder, graded by `grade-visual.mjs`. Unit-test Parts A and C offline against the two stored fixtures via `packages/evals/src/render-scene.mjs`, which is the same rasteriser in Node with **no Studio attached**. |
| **What does it cost in money?** | **$0.00.** Zero neurons — no model call is added. Worker CPU is billed at $0.02/M CPU-ms with 30M CPU-ms included monthly; ~50 ms × ~1,140 builds/month ≈ 57,000 CPU-ms ≈ **0.2% of the included allowance**. Say *"inside the included allowance"*, not "free" — this project tracks its ceiling to the cent. |
| **What does it cost in wall-clock?** | **Part A** ~2 h (write + unit-test against both fixtures). **Part C** ~150 lines of JS in `grade-visual.mjs` + ~10 in `MEASURE_LUAU`, ~3 h. **Part B** ~80 lines Luau + wiring + reconciling the `small` predicate, ~half a day, and it is the only part needing a live Studio session. **Total ≈ 1–1.5 focused days.** |
| **Stopping rule** | If Part A's four statistics do **not** separate `golem-plaza-baseline` (2/10) from `golem-plaza-improved` (5/10), stop and say so. That is a real negative result and it costs one afternoon to obtain. |

#### Why this and not the alternatives

- It is the **only** item that makes the owner's test #4 passable. Everything else is unmeasurable
  until it exists.
- It measures the actual failure, on the actual artifact, at the actual resolution — the one thing
  no third-party model or dataset in nine domains can do.
- It is $0, needs no new binding, service, model or licence, and cannot be refuted on reachability,
  cost or law.
- It is testable entirely offline before it touches production.

**What it does *not* do — stated plainly.** It gives ground truth for **structure**, and **none for
taste**. Colorfulness cannot tell you a lamp post is beautiful. It also cannot see `MeshPart`s,
`Terrain`, decals, textures, particles or `SurfaceGui` text, because the renderer draws only boxes
(`VISUAL-LOOP.md`: *"This is the single biggest gap"*). A mesh-heavy or terrain-heavy scene stays
unvalidated by this loop.

---

## 4. What to do instead of training, ranked by expected value

Ranking is expected-value-per-hour at $0 marginal cost, with reachability weighted first.

### Rank 1 — Instrument the pixels and unblock the visual eval — §3.2

$0 · ~1–1.5 days · no new dependency. Everything below is unmeasurable without it.

### Rank 2 — Compile-check `edit_script` (tool change, ~20 lines)

The luau survey proposed a Selene + StyLua + `luau-analyze --mode=strict` post-generation gate as
*"$0, no hosting"*. **Both verdicts refuted it:**

- Production is a Cloudflare Worker (`apps/worker/wrangler.jsonc`) — **no subprocesses, no native
  binaries**. Selene is MPL-2.0 Rust reading `selene.toml` off disk with **no published WASM
  target**; `luau-analyze` is C++ with **no published WASM build**. Only StyLua ships WASM
  (`@johnnymorganz/stylua` 2.5.2). This is a porting project, not a config change.
- `luau-analyze --mode=strict` **would reject valid code**. `packages/evals/src/luau.mjs` says so in
  its own header: valid Roblox code exits 1 with `TypeError: Unknown global 'game'` when no
  definitions are loaded, which is why the existing checker keys on the string `SyntaxError` rather
  than the exit code.
- **Golem already has a stronger gate, deployed and free.** `apps/plugin/src/Ops.luau:262-289`
  (`run_code`) wraps generated source in a ModuleScript and `pcall(require)`s it — the **real** Luau
  compiler, real globals, real DataModel. The proposal buys a weaker version of shipped code.

**The real gap the verdict found:** `edit_script` never compile-checks. `Ops.luau:157-183` calls
`UpdateSourceAsync` and returns only a line count (verified). **Fix:** compile the new source wrapped
as `return function() <src> end` — which compiles the body and executes nothing — and return a
`compileError` the model must clear. `edit_script` is already `studio: true`
(`apps/worker/src/tools.ts:105`), so a paired Studio session is guaranteed on every call. No WASM,
no bundle growth, no new service, no licence exposure.

### Rank 3 — Add `@cf/baai/bge-reranker-base` as a cross-encoder second stage (RAG change)

$0.003/M input tokens (283 neurons/M) — the cheapest unit on the Workers AI pricing page. ~50 asset
blurbs ≈ 2,000 tokens ≈ **$0.000006/query**; 100k queries/month ≈ **$0.60**. Verified: it batches 50
contexts in a **single** call (`{query, contexts[], top_k}`) at 2,000 RPM, so it drops in directly
after the RRF fusion at `asset-library.ts:584-603`, replacing the hand-tuned deterministic
`rerankMultiplier`. A cross-encoder scores `(query, passage)` jointly — strictly better signal than
cosine over independently-embedded vectors.

**Two honest caveats.** (i) Cloudflare documents **no** max-contexts and **no** max-token limit for
this endpoint; upstream XLM-R base has a 512-token pair ceiling (fine for short blurbs), but 50
cross-encoder pairs means 50 joint encodings of in-request latency, which nobody has quantified.
(ii) There is **no Roblox retrieval eval** — build 100–300 queries with graded relevance
(nDCG@10 / Recall@20 / MRR) before claiming a ranking win.

**Explicitly do NOT do the embedding swap.** Both verdicts independently found it cost-inverted
(§2.6). If you want a second arm, use `@cf/baai/bge-m3` (same $0.012/M, MIT, native dense+sparse+
ColBERT) and judge it on **quality**, never on cost.

### Rank 4 — Wire the scene-plan schema that already exists (prompting + routing change)

`apps/worker/src/worldbuilding.ts:466` exports `SCENE_PLAN_SCHEMA` (kind, mood, palette, materials,
focalPoint, zones with extents/elevation, verticalLayers, landmarks, propBudget). A grep finds
**exactly one hit: the definition itself.** It is dead code. The remaining task is wiring, not design.

The mechanism is **proven, not speculative** — another correction. The world-layout survey called
Workers AI JSON mode *"shipped, unused"*; in fact `gateway.ts:323` sets
`response_format: {type: 'json_schema', json_schema}` and `vision.ts:272` already ships it in
production against GLM-5.3-flash for `CRITIQUE_SCHEMA` (both verified). Reuse the `{name, schema}`
wrapper `vision.ts` uses, with `additionalProperties: false`.

> **Caveat:** Cloudflare's JSON Mode page lists 9 supported models and **no GLM** among them. The
> `glm-5.3-flash` model page *does* document `response_format`, and production usage proves it works
> — but Cloudflare also warns JSON Mode *"currently doesn't support streaming"* and that it
> *"can't guarantee"* schema conformance. `glm-5.3-flash` carries the function-calling badge, so a
> tool definition is the safer constraint mechanism for a chat-driven product. Validate + retry
> either way.

**Cost correction:** $0.0009 is per **call**, not per plan. The architecture is
plan → render → critique → **iterate**, so a 4–5 turn loop is 5–10× that. Still comfortable (~1,100
plans/mo at 10× before $10). But the unbudgeted cost is the plan JSON then living in the transcript:
`session.ts` re-sends it every step under `MAX_PROMPT_CHARS = 24000` — ~10 neurons × 16 steps ≈ 155,
roughly **2× the plan call itself**. Keep the plan in DO storage and return a short receipt.

### Rank 5 — Solver in the Worker, not in Luau (architecture change)

Every strong system in the layout literature has the same shape, and it is not a model: **LLM emits
declarative constraints → deterministic solver satisfies them → render feeds back for critique.**
That is Holodeck (Apache-2.0), SceneCraft and Infinigen (BSD-3). Constraint satisfaction / packing /
WFC is classical, not ML — **the expensive-looking part of every paper is the part that costs
nothing.**

> **Correction honoured — placement.** The survey said to run it *"in Luau inside the plugin"*. A
> verdict refuted it: `init.server.luau:221` calls `Ops.execute` **synchronously inside the poll
> loop**, and `run_code` (`Ops.luau:262`) **ignores its own `timeoutMs`** — it is a bare
> `pcall(require)`. A slow solve freezes Studio's main thread, stalls the connection, and blows the
> 25 s worker timeout with nothing able to cancel it. Put it in the Worker.

Author once as plain JS + JSDoc in `packages/shared`: the worker bundles it and `evals/*.mjs` imports
it (evals is untranspiled ESM and cannot import `.ts`). This also avoids a plugin rollout —
`/plugin.rbxm` is a manual reinstall. Worker CPU is inside the included allowance (§3.2).

### Rank 6 — De-anchor the critic, at zero extra call (prompting change)

Committing the judge to its own answer before seeing the candidate collapsed false positives from
**71.9% → 1.2%** in arXiv:2607.05904.

> **Two corrections, both honoured.** (i) That result is on **text-only GSM8K**, against a
> reference-free judge **already reward-hacked by self-play**. Golem's critic is not trained against
> its own approval. The effect is real; the magnitude will be far smaller, and assuming it transfers
> is the same maths-to-domain leap the same survey correctly forbids for PRMs. (ii) The survey
> called all its changes *"all free"* — **false**. De-anchoring splits one call into two, and
> `packages/evals` logs already show repeated `3021: rate limiting: inference request per min rate
> reached`. **Request count is the binding constraint**, and this raises it.

**So do the zero-extra-call version first:** move the checklist to the **first** field of
`CRITIQUE_SCHEMA` so the model emits it before the score. Weaker (the image tokens are already in
context) but genuinely free. The two-call version is also cheap — text-only, ~26 reserved neurons —
if the first version underdelivers. **Never use reasoning effort `medium`: measured, it returns an
empty string.**

> **Watch the firewall.** Pre-committing "what must be present" reopens the fidelity-to-quality leak
> that `visual-eval-design.md` §6.1 exists to firewall. Contents is what `hardFailChecks` already
> measures; the critic's job is the part measurement cannot reach.

### Rank 7 — Cap the correction loop at 2–3 iterations, gated on a *measured* metric moving

Same-model refine loops reward-hack: arXiv:2407.04549 shows evaluator ratings rising while true
quality stagnates, heightened when generator and evaluator share a base — which is exactly Golem's
loop (GLM builds, GLM judges, GLM fixes). arXiv:2607.05904 drove acceptance 72%→94% on GSM8K while
true accuracy stayed ~20%. And Feedback Friction (arXiv:2506.11930) found that even with a feedback
generator holding near-complete ground truth, solvers *"consistently show resistance to feedback"*.
Bound the loop, and require a **measured** number to move, not the score.

### Rank 8 — Run `RobloxQA-v2.0` as a cheap regression check (better eval, low priority)

MIT, 3,000 held-out MCQs, deduped **before** splitting, independently verified answers, option-length
bias measured. Ships in ~a day; ~$0.19 per full run; subsample ~300 (~$0.02) per commit. **Ranked
last on purpose:** it measures the *saturated* code axis. It is a cheap guard against regression,
not a source of headroom.

### Explicitly NOT recommended

- **`@cf/moondream/moondream3.1-9B-A2B` for grounding.** A verdict flagged it as the Workers-AI-native
  alternative the UI survey missed (its catalogue entry advertises *"object detection, pointing, OCR,
  and structured output"* — pointing **is** the grounding primitive). It should replace ShowUI-2B as
  the "if ever revisited" entry, since it costs zero new spend. But the capability objection stands:
  **grounding is not quality judgement**, and Golem already holds its own Instance tree.
- **Playwright screenshot-diffing + axe-core for web-app QA.** Still the right call *eventually*, but
  the survey asserted it was *"already in this workspace"* and **both verdicts independently
  refuted that**: zero hits across every `package.json`, `pnpm-lock.yaml` and `node_modules`; the
  only test runner present is `node --test` in `apps/web`. It is net-new work — a dev dependency,
  ~500 MB of browser binaries, and a CI job that can only ever run in CI, never inside the Worker.

---

## 5. Traps — things that look attractive and are not

### 5.1 Licence traps that pass a naive Hub tag filter

| Trap | The tag says | The text says |
|---|---|---|
| `Roblox/cube3d-v0.5` | `openrail` | **"CUBE3D RESEARCH-ONLY RAIL-MS LICENSE"** — *"for academic or research purposes only"*. Unfixed a year later. This is the governing precedent. |
| `q-future/one-align` (+ the whole `q-align-*` family, and distillations of it) | `mit` | Upstream `Q-Future/Q-Align` LICENSE is **S-Lab License 1.0**, non-commercial. 3.4M downloads means the conflict is ignored, not resolved. |
| `microsoft/OmniParser-v2.0` | `mit` | Its **own README**: *"icon_detect model is under AGPL license"*. Half the product is network-copyleft. |
| `microsoft/GUI-Actor-3B-Qwen2.5-VL` | `mit` | Base `Qwen/Qwen2.5-VL-3B-Instruct` is **"FOR NON-COMMERCIAL PURPOSES ONLY"** — and carries **no Hub tag at all**, so the restriction is invisible to a filter. |
| `WenxuZhou/IL3D` | `apache-2.0` | README lists the contents as `3D-FRONT.zip` + `HSSD.zip` (**cc-by-nc-4.0**). |
| `B3rrYang/3D-SynthPlace` | `apache-2.0` | **Contains 7,306 3D-FRONT scenes** (~44%). |
| `houselayout3d/HouseLayout3D` | `mit` | Matterport EULA bars non-academic use of *"any models trained on the Matterport Dataset"* — **weights included**. |
| `TorpedoSoftware/roblox-info-dump` | `mit` | Gated terms: *"Roblox maintains the copyright on all content."* Propagates into Devstral, both Gemma-3-Roblox-Luau models and Pinkstack's corpus. |
| `zibuyu-02/IQA-T1`'s Q-Tool | `mit` | Contains 10,373 images **from KonIQ-10k**. The tag covers annotations, not images. |
| `nyu-visionx/VSI-Bench` | `apache-2.0` | Covers **QA text only**. The video is ScanNet++ (*"Commercial use is strictly prohibited"*) and ARKitScenes (Apple NC). |
| `RunsenXu/MMSI-Bench` | `cc-by-4.0` | Its own Acknowledgment lists nuScenes (**CC BY-NC-SA**) and Waymo (**NC**), embedded in a 704 MB parquet. NC-SA cannot be relicensed CC-BY. |
| `lmms-lab/llava-critic-113k` | `apache-2.0` | **GPT-4o produced the judgments.** A publisher assertion over another provider's output is not a chain of title. |

### 5.2 The inverse trap — declaring a licence absent when it isn't

`tencent/Hunyuan3D-Part` was excluded across two passes as *"no licence at all, therefore all rights
reserved."* It ships **`LICENSE.txt`, 17,015 bytes** — the Tencent Hunyuan 3D-Part Community
Licence. The README simply omits a `license:` key so no tag renders. **The exclusion is still
correct** (same EU/UK/S.Korea carve-out and MAU trigger as 2.1), but the stated reason was wrong.
Read the file tree, not just the card.

### 5.3 Reachability traps — things that cannot run at any price

| Trap | Why it is closed |
|---|---|
| **"Just run CLIP/SigLIP in the Worker"** | Worker bundle limit on Paid: **10 MB gzipped / 64 MB uncompressed.** Smallest int8 CLIP pair (`Xenova/clip-vit-base-patch32` vision 88.6 MB + text 64.1 MB) = 152.7 MB. Misses by ~15×. |
| **"Use ONNX Runtime Web in the Worker"** | ORT-Web's WASM binary alone is ~10 MB, **before weights**. |
| **"Serve a specialist via BYO-LoRA"** | *Correction to two surveys:* the allowlist is **not** just mistral/gemma/llama — per CF's 2025-04-11 changelog it is 9 bases including `qwen2.5-coder-32b`, `qwq-32b` and `llama-3.2-11b-vision`; and "tiny contexts" is wrong (`llama-3.2-11b-vision`, `gemma-3-12b-it` and `mistral-small-3.1-24b` are all 128k). **The real blocker is architectural:** a LoRA adapter is architecture-specific, and Workers AI hosts **no** `qwen2_vl` or `qwen2_5_vl` base at all — so ShowUI-2B and GUI-Actor-2B cannot be ported at any rank. |
| **"An always-on GPU"** | $248.39/mo minimum vs ~$15 of genuine headroom = **16.6× over**. Inverted: $15 buys **1.47 h/day** of uptime. A SaaS cannot be up 1.5 hours a day. |
| **"Scale-to-zero serverless rescues it"** | Keeping one worker warm is $803.62/mo, so **every** request pays a cold load — ~9.7 GB (TRELLIS.2) or ~18.5 GB (Pixal3D) of weights — giving ~2 minutes of user-facing latency. (Both the warm figure and the $0.037/gen estimate cite **no source**.) |
| **"Build-time generation on the owner's Mac"** | Apple **M2 Pro, arm64, Metal only** — no CUDA, no `nvidia-smi`, no `nvcc`, no torch, no mlx installed (Python 3.9 Framework build). Pixal3D needs Linux + NVIDIA + CUDA 12.4 + CUDA-compiled `natten` + `flash_attn`; Q-ReAlign needs `transformers >= 5.2.0`. There is no machine to amortise over. |
| **Kaggle's free 30 h/week** | ToU: *"only for your own internal, personal, **non-commercial** use."* Legally closed, and >1 account is also forbidden. |
| **HF ZeroGPU free tier** | 5 GPU-min/day, Gradio-only, 60 s per call, quota charged to the **calling** account. A demo platform, not a backend. |
| **HF PRO ($9) / HF Jobs / Modal beyond credits** | Every one requires a card for a new service. **Stop and ask the owner before any charge.** |

### 5.4 Measured-not-to-work traps

| Trap | The measurement |
|---|---|
| **Agent-trace failure attribution as a feature** | Who&When: best method **53.5%** agent-level, **14.2%** decisive-step; some below random. TRAIL: best model (Gemini-2.5-Pro) **11%** overall — 18.3% on GAIA, **5.0%** on SWE-Bench; Llama-4-Maverick and Scout **0%** on both. Do not ship "tell me what went wrong in this run". |
| **One-shot VLM scoring of 3D scenes** | LEGO-Eval: F1 **0.40**, κ **0.05** (chance) alone; F1 0.81, κ 0.63 with 21 inspection tools. Independently rediscovered by `zibuyu-02/IQA-T1` (ECCV 2026) and `guanq/Tool-IQA-8B`. Tools, not training. |
| **PRMs outside maths** | VersaPRM (ICML'25): Math-Shepherd and Qwen2.5-Math-PRM show *"only marginal improvements over baseline in Law, Philosophy, and Biology."* |
| **NR-IQA on Golem's renders** | Wrong signal by construction: the rejected scene is sharp, noise-free and correctly exposed. *But hold the claim loosely* — a verdict correctly noted "it would score WELL" is an **untested prediction** stated as fact, and that the Q-Align family does aesthetics (AVA SRCC 0.797) as well as distortion, so "NR-IQA scores photographic distortion" is not true of the whole family. The domain-mismatch argument survives; the directional prediction should be measured, not asserted. |
| **Trusting the 0–10 critic score as a fine-grained signal** | arXiv:2604.25235: VLM judges rank reliably and score badly. *Two corrections:* (i) the paper's abstract says intervals cover ~40% of the range for **aesthetics** and natural images, widening to ~70% for charts and maths — **aesthetics is its best case, not its worst**; (ii) Golem's own "three lamp builds all scored 5" evidence is stale — the comment at `vision.ts:157-171` diagnoses it as a **prop-vs-scene rubric mismatch already fixed** by `SubjectKind`/`inferSubject`/`SUBJECT_RULES` in that same file. |
| **"Make `hardFailChecks` authoritative"** | **Already shipped.** `vision.ts:301`: `score = hardFails.length ? Math.min(raw, 3) : raw`; `:305`: `passed: score >= threshold && hardFails.length === 0`. Verified. Nothing to change. |
| **"Replace free-text defects with a TRAIL/MAST enum"** | Wrong twice. (i) Defects are **already enum-typed** — `CRITIQUE_SCHEMA` fixes `dimension` to 8 values and `severity` to 3; only `observed`/`fix` are free text, and `fix` (*"add a 0.4-stud trim"*) is the payload the agent acts on. Enum leaves would **delete** the actionable output. (ii) TRAIL taxonomises agent-execution failures and has no category for "the column does not taper". If a stable enum is wanted, use Golem's **own 20 dimensions** in `visual-eval-design.md` §4. |
| **Lowering render resolution to save tokens** | Already calibrated **in-domain**: at 176×112 the critic reported *"no benches, no planters"* for a scene containing six benches and four planters, and hallucinated three grey box buildings. At 288×180 that stopped (`RESULTS.md`). Do not let an out-of-domain photographic benchmark override this. |
| **Fault injection as a novel idea** | It is not. **Who&When Pro** (arXiv:2607.09996) already *"injects a failure only after exactly replaying a successful prefix"* — 12,326 labelled trajectories. Its **data is CC BY-NC-SA 4.0** (do not ingest); its **method is reimplementable**. Cite as prior art. |

### 5.5 Arithmetic and provenance traps

- **Vectorize dimension billing.** Bills **(queries + stored vectors) × dimensions**. A 384d→1024d
  "upgrade" that looks cheaper per token is ~70× more expensive in total. Both verdicts caught it
  independently. Always price both axes.
- **Per-call ≠ per-plan.** $0.0009 is one call; the architecture iterates 4–5 times, and the plan
  JSON then re-enters the transcript on every subsequent step at roughly 2× the plan call.
- **Request count, not token count, is the binding constraint.** The eval logs already show
  `3021: rate limiting: inference request per min rate reached`. Any change that splits one call
  into two costs rate-limit headroom even when it costs almost no money.
- **Self-reported benchmarks.** Marqo's +17.6% MRR / +20.5% nDCG@10 is on Marqo's own eval sets.
  All comparative Luau numbers are self-reported by TorpedoSoftware on their own benchmark, with no
  independent replication.
- **Benchmark contamination.** `Luau-Devstral-24B-Instruct-v0.2` lists `LuauLeetcode` as its **GRPO
  training data**. It cannot be fairly compared to Golem on that benchmark.
- **dtype mislabelling.** `UI-TARS-1.5-7B`'s 33 GB is **fp32**; the same 8.29B params at bf16 is
  ~16.6 GB (as `Holo1-7B` is correctly listed). Two dtypes, both labelled "bf16", in one table.
- **Repo ids that do not resolve.** `trojblib/...` (correct: `trojblue/`), `THUDM/cogagent-9b`
  (renamed to `zai-org/`), `Qwen/Qwen3.5-VL` (does not exist), `THEODOROS/Architext-gptj-6B` (exists
  but **contains no weights**), `github.com/UCSB-AI/LayoutGPT/main/LICENSE` (default branch is
  `master`), and a *"5MB MLX SigLIP2-NR-IQA adapter"* that a verdict **could not locate at all**.

---

## 6. What we still do not know

### 6.1 Two adversarial verdicts are missing

The `synthetic-data-training` survey arrived **truncated mid-candidate-list**, and its two verdicts
were never delivered. Everything in §2.9 and §3.1's cost arithmetic is **survey-only and has not
been adversarially reviewed**. Given that the other eight domains produced **five outright
refutations and well over sixty material corrections** — including two surveys whose central
recommendation inverted under review — the base rate says several claims in that section are
probably wrong. Treat §2.9 as the weakest material in this document. It happens not to change the
verdict, because domain 9's own conclusion (no serving path, circular labels, distillation
inverted) agrees with the other eight; but it should not be leaned on.

### 6.2 The two reviewers disagree about `gaoyuan-ai/SA-BENCH`

One verdict reports the card's Intended Use section reads *"non-commercial research on image quality
assessment"*, contradicting its own Apache-2.0 LICENSE — the cube3d split again. The other verdict
reports reading the LICENSE and calls it *"genuine Apache-2.0"*. **Both read the repo; they
disagree.** Since the only proposed use is borrowing the four axis names (distortion / harmony /
layout / lighting) as rubric vocabulary, and ideas are not copyrightable, this does not block
anything. But **do not describe SA-BENCH as unencumbered Apache-2.0** until someone reads both
sections in one sitting and reconciles them.

### 6.3 Is `llama-3.2-11b-vision` actually LoRA-uploadable?

The single unresolved fact that would change a paragraph of this document.

- The UI-understanding feasibility verdict: `@cf/meta/llama-3.2-11b-vision-instruct` is Vision ✓,
  LoRA ✓, 128k, $0.049/$0.68, already on Workers AI under the Meta licence (needs a one-time
  `{"prompt":"agree"}` call) — *"the only trainable, hostable, commercially-clean VLM in the stack."*
- The synthetic-data survey read `config.json` and found **`model_type: "mllama"`**, which is not in
  Cloudflare's documented `{mistral, gemma, llama}` allowlist for `adapter_config.json`.

These cannot both be operative. The synthetic-data claim is the more specific (a file read), but it
is also the one with **no adversarial review**. Settling it costs one `npx wrangler ai finetune
create` attempt with a stub adapter. **Nobody has run it.** Even if it resolves in favour of
uploadability, gates 2–5 in §3.1 still close the training path — but the document should say
"unresolved" rather than pick a side.

### 6.4 Perceptual metrics on synthetic 3D renders are wholly unstudied

No published evaluation exists of **any** NR-IQA, aesthetic predictor, spatial-reasoning benchmark or
perceptual metric on game-engine output, and none at 288×180. Every reported SRCC/PLCC in §2.1 is on
photographs. That these models would misfire on Golem's renders is well-reasoned from what they were
trained to detect — it is an **inference, not a measurement**. The same caveat applies to §3.2's
four proposed statistics: standard, cheap, and **uncalibrated on this distribution**.

### 6.5 Unresolved law

Whether research-only **training data** taints commercial use of permissively-licensed **weights** is
unsettled and cannot be resolved here. It touches almost every candidate in §2.1 and §2.7: AVA,
KonIQ-10k (which has **no formal licence at all** — only *"freely available to the research
community"*), SPAQ, KADID-10k, LIVE, CSIQ, TID2013, PARA. Related and equally unresolved: whether a
publisher can Apache-license annotations **produced by a proprietary model** under terms restricting
competing-model development (`llava-critic-113k`). No court has tested either.

### 6.6 Facts nobody has measured that are cheap to measure

| Unknown | Cost to settle |
|---|---|
| Do the four pixel statistics separate the 2/10 baseline from the 5/10 improved fixture? | one afternoon, $0 (§3.2) |
| Does `visual-bench.mjs` show a real score trajectory across correction rounds? **It has never been run.** 4 ladder tasks × ~2,300 neurons ≈ 9,200 — inside one day's free 10,000. | one run, $0 |
| Image-token accounting for 288×180 renders through GLM-5.3-flash. Undocumented by Cloudflare. A verdict measured 3 flat-shaded frames at ~11 KB of data URL ≈ **134 reserved neurons** against a 1,200 ceiling (~+6% neurons/build), but this is not vendor-confirmed. | one real call |
| `bge-reranker-base`'s actual max-contexts and latency at 50 pairs. Undocumented. | one call |
| Whether the free 10,000 neurons/day applies to paid-billing-only models (GLM-5.3-flash is one). **Docs do not say.** Load-bearing for every cost figure here. | one day of billing data |
| Whether Modal Starter requires a card, and whether its ToS restricts commercial free-tier use. | reading two pages |
| What Roblox's own 2026 scene generation gives away free — pricing, quotas, output format, triangle count. The official reference states **none** of it. | one focused check |
| Whether `extra_gated_eu_disallowed: true` actually blocks EU downloads of `TencentARC/Pixal3D`, or is a HF artefact. The repo did **not** report as gated via the API. | one request from an EU IP |

### 6.7 Things this document deliberately does not claim

- That Golem's **layout** is weak. The owner's rejection was about fidelity and materials
  (untextured primitives, arbitrary colours, a trophy of three stacked blocks) — a *different axis*
  from spatial arrangement. `RESULTS.md`'s own diagnosis gives materials 0 and spacing 2. Build the
  instrument, confirm layout is weak, **then** consider a planner.
- That the two stored fixtures constitute a calibration set. `RESULTS.md` says explicitly they do
  not, and the survey's proposed "check rubric correlation" over **n=2** is not a number.
- That the 0–10 score is meaningless. It is uncalibrated against human ranking at scale
  (`VISUAL-LOOP.md`), which is a different and weaker statement.
- That the reward-function-instead-of-the-model idea is dead. It is right in principle; it is just
  not `$0, no hosting` in a Worker, and Golem already owns a stronger version of the syntax half.

---

## 7. One-paragraph summary

Nine domains, ~110 candidate models and datasets, seventeen adversarial reviews. **No specialist
model should be trained, adapted, or adopted.** The binding constraint is not budget and not
licence — it is **reachability**: Workers AI is a fixed catalogue with no image embedder, no quality
scorer, no reward model, no GUI grounder and no 3D category, and the in-Worker fallback is closed by
a 10 MB bundle limit that ORT-Web's WASM alone exceeds. Where a specialist *could* be served, the
evidence runs the wrong way: the best open Luau model bought ~1.2 points over its own base for 103
A100-hours and still lost to a generic coder by 11.3; the best published attempt at self-improving a
VLM judge merely matched a frontier model after eight-GPU training; distilling Golem's own critic
would cost more than the critic and would reproduce a κ=0.05 signal faster. The entire measured
headroom in the one paper closest to Golem's problem (LEGO-Eval, κ 0.05 → 0.63) came from
**structural inspection tools, not from training**. Golem's renderer already produces the pixels and
Studio already produces the ground truth; what is missing is the ~30 lines that turn those pixels
into numbers and the ~80 lines of Luau that feed the grader already written and waiting.
**Build the instrument. It costs $0 and about a day. Revisit training only if it shows a weakness
that measurement, prompting and tools cannot close — and re-read §6.3 before believing there is a
place to serve one.**
