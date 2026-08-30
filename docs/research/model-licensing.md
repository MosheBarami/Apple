# Model Licensing & Commercial-Use Rights — Golem Research

**Date:** 2026-08-30
**Scope:** Licenses of candidate open-weight models for Golem (AI SaaS that builds Roblox games; Cloudflare Workers + Workers AI + Supabase, ~$5/month budget). Every license below was verified against the Hugging Face model card (YAML `license:` frontmatter) and/or the official LICENSE file on 2026-08-30. Anything not directly verified is marked **UNVERIFIED**.

---

## TL;DR

- **Safe core (permissive, zero obligations beyond notice retention):** Qwen2.5-Coder (7B/14B/32B Instruct), Qwen3 (30B-A3B, 32B), Qwen3-Coder (30B-A3B, 480B-A35B, Coder-Next), Qwen3.8-27B, openai/gpt-oss-120b & 20b, QwQ-32B, DeepSeek-R1-Distill-Qwen-32B, BAAI/bge-m3 — all **Apache-2.0 or MIT**.
- **Usable but with branded obligations:** Meta Llama 3.3 / 3.2 Vision / 4 Scout — commercial use OK at Golem's scale, but require "Built with Llama" attribution, "Llama"-prefixed derivative names, and license-copy redistribution; Llama 3.2 multimodal is **not licensed to EU-domiciled companies**.
- **Trap to avoid:** Qwen3.8-Flash-Next ships under the new **Qwen Community License 1.0**, which requires a separate commercial license for "AI Work Assistant" products "primarily designed for AI-assisted coding" — that is exactly Golem's product category. Do not build on it.

---

## 1. Per-model license findings

### 1.1 Qwen2.5-Coder family (Alibaba/Qwen)

| Model | License (HF frontmatter) | Verified |
|---|---|---|
| Qwen/Qwen2.5-Coder-32B-Instruct | `apache-2.0` | Yes (raw README) |
| Qwen/Qwen2.5-Coder-14B-Instruct | `apache-2.0` | Yes (raw README) |
| Qwen/Qwen2.5-Coder-7B-Instruct | `apache-2.0` | Yes (raw README) |

- **Commercial use:** Allowed, unconditionally (Apache-2.0).
- **Redistribution / derivatives (LoRA, fine-tunes):** Allowed; must retain the Apache-2.0 LICENSE and NOTICE text when redistributing weights; state changes. LoRAs you train are yours; no naming rules.
- **Attribution:** Standard Apache-2.0 notice retention only — no UI attribution, no product branding requirements.
- **User-count clauses:** None.
- Note: only the *Instruct* variants at these sizes are Apache-2.0. (Historically some Qwen2.5 base sizes — 3B, 72B — used the Qwen research/Qwen license; irrelevant for these three, which link their own Apache LICENSE files.)

### 1.2 Qwen3 family

| Model | License | Verified |
|---|---|---|
| Qwen/Qwen3-30B-A3B (MoE, 3B active) | `apache-2.0` | Yes |
| Qwen/Qwen3-32B | `apache-2.0` | Yes |
| Qwen/Qwen3-Coder-30B-A3B-Instruct | `apache-2.0` | Yes |
| Qwen/Qwen3-Coder-480B-A35B-Instruct | `apache-2.0` | Yes |
| Qwen/Qwen3-Coder-Next (~80B total, `qwen3_next` arch, Feb 2026) | `apache-2.0` | Yes (HF metadata) |
| Qwen/Qwen3.8-27B (multimodal, Aug 2026) | `apache-2.0` | Yes (HF metadata) |

Same Apache-2.0 terms as above: full commercial use, free redistribution and LoRA/derivative rights, notice retention only, no user-count clauses.

**WARNING — Qwen/Qwen3.8-Flash-Next (180B preview, `qwen4_exp`, Aug 2026) is NOT Apache.**
HF frontmatter: `license: other`, `license_name: qwen-community-1.0`. The LICENSE file:
- Attribution threshold: products exceeding **100,000,000 MAU or US$20,000,000 monthly revenue** must prominently display the model name in the UI.
- **Separate commercial license required** to operate: (a) *Model as a Service* (third-party access to inference/fine-tuning via API or hosted endpoint), or (b) an *"AI Work Assistant"* — products "primarily designed for AI-assisted coding or office productivity."
- Golem is an AI-assisted coding/game-building product, and depending on architecture may also look like MaaS. **This license is unsafe for Golem.** Avoid Qwen models tagged `qwen-community-1.0`; stick to the Apache-2.0-tagged Qwen releases (Qwen3.8-27B is Apache-2.0 and fine).

### 1.3 openai/gpt-oss-120b and gpt-oss-20b

- **License:** `apache-2.0` (both, HF frontmatter verified). Model card language: "Build freely without copyleft restrictions or patent risk—ideal for experimentation, customization, and commercial deployment."
- **Commercial use:** Allowed. **Redistribution/LoRA:** Allowed (Apache-2.0). **Attribution:** notice retention only. **User-count clauses:** None.
- Accompanied by a short gpt-oss usage policy (comply with applicable law) — not a copyleft or commercial restriction.
- Technical (not legal) constraint: both models require OpenAI's **harmony response format** or output will be incorrect.
- gpt-oss-120b: 117B total / 5.1B active MoE; gpt-oss-20b: 21B total / 3.6B active. Both are on Cloudflare Workers AI (`@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b`).

### 1.4 Meta Llama models

#### meta-llama/Llama-3.3-70B-Instruct — **Llama 3.3 Community License Agreement** (HF tag `license:llama3.3`)
- **Commercial use:** Allowed — "non-exclusive, worldwide, non-transferable and royalty-free limited license."
- **700M MAU clause (Section 2):** if your products/services exceeded **700 million monthly active users** in the calendar month preceding the Llama 3.3 release date, you must request a separate license from Meta. Irrelevant at Golem's scale, but it is why Llama is "open-weight," not OSI open-source.
- **Attribution:** must "prominently display 'Built with Llama' on a related website, user interface, blogpost, about page, or product documentation."
- **Derivative naming:** any distributed AI model created from Llama materials (fine-tunes, LoRA-merged models, distills) must include **"Llama" at the beginning of the model name**.
- **Redistribution:** must ship a copy of the license agreement and the notice "Llama 3.3 is licensed under the Llama 3.3 Community License, Copyright © Meta Platforms, Inc." plus comply with Meta's Acceptable Use Policy. HF repo is gated (accept terms to download).

#### meta-llama/Llama-4-Scout-17B-16E-Instruct — **Llama 4 Community License Agreement** (HF tag `license:other`)
- 109B total params (17B active, 16 experts), multimodal.
- Same structure as 3.3: **700M MAU** clause keyed to the Llama 4 release date, "Built with Llama" display, "Llama"-prefixed derivative names, redistribution notice "Llama 4 is licensed under the Llama 4 Community License, Copyright © Meta Platforms, Inc."
- License terminates if you initiate IP litigation against Meta over the model.
- **EU multimodal restriction:** widely reported at Llama 4 launch, but **not found in the license text fetched from developer.meta.com on 2026-08-30** (only a jurisdictional Meta-entity definition mentioning the EEA). Treat "Llama 4 EU restriction" as **UNVERIFIED** — check llama.com download terms before relying on Llama 4 if EU-domiciled.

#### meta-llama/Llama-3.2-11B-Vision-Instruct — **Llama 3.2 Community License** (HF tag `license:llama3.2`)
- Same 700M MAU clause, "Built with Llama," and naming rules as above.
- **Confirmed EU restriction (from the model card):** "the rights granted under Section 1(a) of the Llama 3.2 Community License Agreement are not being granted to you if you are an individual domiciled in, or a company with a principal place of business in, the European Union" **with respect to the multimodal models**. End users of products that incorporate the model are exempt, but a EU-domiciled *developer/company* cannot license the vision weights.

### 1.5 deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
- **License:** `mit` (HF frontmatter). Model card: "This code repository and the model weights are licensed under the MIT License" and "DeepSeek-R1 series support commercial use, allow for any modifications and derivative works, including, but not limited to, distillation for training other LLMs."
- Base model (Qwen2.5-32B) is Apache-2.0, so the stack is clean.
- **Commercial use:** yes; **redistribution/LoRA:** yes; **attribution:** MIT notice retention only; **user-count clauses:** none.
- (deepseek-ai/DeepSeek-V3.1 also verified `license: mit`.)

### 1.6 Qwen/QwQ-32B
- **License:** `apache-2.0` (HF frontmatter, LICENSE file in repo). Full commercial/derivative rights, no thresholds. Available on Workers AI as `@cf/qwen/qwq-32b`.

### 1.7 BAAI/bge-m3 (embeddings)
- **License:** `mit` (HF frontmatter). Unrestricted commercial use — safe for Golem's RAG/embedding layer (it is Workers AI's `@cf/baai/bge-m3`).

---

## 2. Newer notable open coder/agent models (2025–2026) worth considering

| Model | Release | License | Commercial | Key condition |
|---|---|---|---|---|
| **Qwen/Qwen3-Coder-Next** (~80B MoE, A3B-class active) | Feb 2026 | Apache-2.0 (verified) | Yes | None — currently the strongest permissive open coder in a small-active-params package; 6.3M downloads |
| **Kwaipilot/KAT-Coder-V2.5-Dev** (34.7B MoE, agentic coding, multimodal) | Jul 2026 | Apache-2.0 (verified) | Yes | None |
| **Qwen/Qwen3.8-27B** (multimodal generalist) | Aug 2026 | Apache-2.0 (verified) | Yes | None |
| **zai-org/GLM-4.6** (357B MoE) | Sep 2025 | MIT (verified) | Yes | None |
| **zai-org/GLM-5.3-Flash** (321B MoE, multimodal) | Aug 2026 | MIT (verified) | Yes | None |
| **zai-org/GLM-5.3** (753B MoE) | Aug 2026 | Custom "glm-5.3" license (verified) | Yes | MaaS businesses whose 12-month aggregate revenue exceeds **US$10B** need a Z.AI security review; irrelevant to Golem but it is not plain MIT |
| **moonshotai/Kimi-K2-Instruct** (1T MoE) | 2025 | Modified MIT (LICENSE verified) | Yes | If product exceeds **100M MAU or US$20M monthly revenue**, must prominently display "Kimi K2" in the UI |
| **moonshotai/Kimi-K2.5** (1T MoE, multimodal) | Apr 2026 | Modified MIT (LICENSE verified) | Yes | Same 100M MAU / $20M monthly revenue display clause ("Kimi K2.5"); Kimi-K2-Thinking tagged `license:other`, presumed same Modified MIT — **UNVERIFIED** |
| **MiniMaxAI/MiniMax-M2** (230B MoE, agentic) | 2025 | Modified MIT (LICENSE verified) | Yes | If product exceeds **100M MAU or US$30M annual recurring revenue**, must display "MiniMax M2" in the UI |
| **mistralai/Devstral-Small-2507** (24B, agentic coding) | Jul 2025 | Apache-2.0 (verified) | Yes | None |
| **Qwen/Qwen3.8-Flash-Next** (180B preview) | Aug 2026 | **Qwen Community License 1.0** (verified) | Restricted | Separate license needed for MaaS or AI-coding-assistant products — **do not use for Golem** |

The Modified-MIT display clauses (Kimi, MiniMax) only trigger at 100M MAU / $20–30M revenue — practically irrelevant for Golem, but they make those models "MIT-with-an-asterisk" rather than clean MIT.

---

## 3. What the license terms mean for Golem specifically

1. **Serving via Cloudflare Workers AI:** Cloudflare hosts the weights; Golem never redistributes them, so redistribution clauses are dormant. What still applies to Golem as a *user/deployer*: Llama's "Built with Llama" attribution and AUP, and any UI-display thresholds (none reachable at Golem scale).
2. **LoRA / fine-tuning (Workers AI supports BYO LoRA):**
   - Apache-2.0/MIT models: your LoRA is unencumbered; you may keep it private, sell it, or publish under any license (retain upstream notices if you republish merged weights).
   - Llama models: a LoRA/fine-tune is a "derivative work" of Llama Materials — if you ever *distribute* it, the name must start with "Llama," you must ship the community license, and downstream users inherit it. Private in-house LoRAs used only for serving are fine (attribution still applies to the product).
3. **EU exposure:** If Golem (the company) is or becomes EU-domiciled, Llama 3.2 Vision is off the table entirely, and Llama 4's status should be re-verified. Qwen3.8-27B (Apache-2.0, multimodal) is the clean vision alternative.
4. **Attribution burden comparison:** Apache/MIT = a line in your OSS notices file. Llama = visible "Built with Llama" on the site/UI/docs. For a polished SaaS brand, the permissive models keep the product surface clean.

---

## 4. Conclusion — the "independent commercially usable open-weight core"

**Recommended core (all Apache-2.0 or MIT; no attribution UI requirements, no user thresholds, no field-of-use limits):**

- **Primary coder:** Qwen2.5-Coder-32B-Instruct (Apache-2.0; on Workers AI today as `@cf/qwen/qwen2.5-coder-32b-instruct`) — with **Qwen3-Coder-30B-A3B-Instruct / Qwen3-Coder-Next** (Apache-2.0) as the upgrade path.
- **General/agentic reasoning:** openai/gpt-oss-120b or gpt-oss-20b (Apache-2.0, on Workers AI), QwQ-32B (Apache-2.0), or DeepSeek-R1-Distill-Qwen-32B (MIT).
- **Small/cheap coder:** Qwen2.5-Coder-7B-Instruct (Apache-2.0).
- **Embeddings:** BAAI/bge-m3 (MIT).
- **Off-Workers-AI options with clean licenses** (if routed via another provider later): GLM-4.6 (MIT), Devstral (Apache-2.0), KAT-Coder-V2.5 (Apache-2.0), Qwen3.8-27B (Apache-2.0).

**Usable but not "core" (conditional licenses):** Llama 3.3-70B, Llama 4 Scout, Llama 3.2-11B-Vision — fine at Golem's scale but carry Meta branding/attribution/naming obligations and (for 3.2 Vision, confirmed) an EU developer restriction. Kimi K2/K2.5 and MiniMax-M2 are Modified MIT with far-off display thresholds.

**Avoid:** Qwen3.8-Flash-Next (and anything tagged `qwen-community-1.0`) — its AI-coding-assistant / MaaS carve-out directly targets Golem's product category.

---

## Sources

- https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct/raw/main/README.md
- https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct/raw/main/README.md
- https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/README.md
- https://huggingface.co/Qwen/Qwen3-30B-A3B/raw/main/README.md
- https://huggingface.co/Qwen/Qwen3-32B/raw/main/README.md
- https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/raw/main/README.md
- https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct/raw/main/README.md
- https://huggingface.co/Qwen/Qwen3-Coder-Next (HF metadata: license apache-2.0)
- https://huggingface.co/Qwen/Qwen3.8-27B (HF metadata: license apache-2.0)
- https://huggingface.co/Qwen/Qwen3.8-Flash-Next/raw/main/README.md and .../raw/main/LICENSE (qwen-community-1.0)
- https://huggingface.co/openai/gpt-oss-120b/raw/main/README.md
- https://huggingface.co/openai/gpt-oss-20b/raw/main/README.md
- https://huggingface.co/Qwen/QwQ-32B/raw/main/README.md
- https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B/raw/main/README.md
- https://huggingface.co/deepseek-ai/DeepSeek-V3.1 (HF metadata: license mit)
- https://huggingface.co/BAAI/bge-m3/raw/main/README.md
- https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct (model card, Llama 3.3 Community License terms)
- https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct (model card)
- https://developer.meta.com/ai/llama4/license/ (Llama 4 Community License Agreement)
- https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct (model card incl. EU multimodal restriction)
- https://huggingface.co/moonshotai/Kimi-K2-Instruct/raw/main/LICENSE
- https://huggingface.co/moonshotai/Kimi-K2.5/raw/main/LICENSE
- https://raw.githubusercontent.com/MiniMax-AI/MiniMax-M2/main/LICENSE
- https://huggingface.co/zai-org/GLM-4.6 (HF metadata: license mit)
- https://huggingface.co/zai-org/GLM-5.3/raw/main/LICENSE (glm-5.3 custom license)
- https://huggingface.co/zai-org/GLM-5.3-Flash (HF metadata: license mit)
- https://huggingface.co/mistralai/Devstral-Small-2507/raw/main/README.md
- https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev (HF metadata: license apache-2.0)
