# Build-model comparison on game 1 (owner decision 2026-10-04)

Same one-line idea, same deployed worker (42697f17), same plugin, clean Baseplate. Only the `plan` and `agent` model
roles change, via KV `config:models`, which is reset to `{}` afterwards. The vision role (look, blind critique, judge)
stays on GLM 5.3 Flash for all runs, so the checks are equal. A fresh blind critic judges each result from screenshots
only.

| Run | Build model | Blind critic overall | Credits | Time | Notes |
|---|---|---|---|---|---|
| r3 (baseline) | @cf/zai-org/glm-5.3-flash | 1.5/10 | 192 | 298 s | inserted 4 real crystals, then read-stalled |
| m-glm53 | @cf/zai-org/glm-5.3 | (running) | | | |
| m-dsv4pro | @cf/deepseek-ai/deepseek-v4-pro-0813 | | | | |
| m-kimi | @cf/moonshotai/kimi-k2.7-code | | | | |

## Cancelled by the owner (2026-10-04)
No comparison run completed. GLM 5.3 attempts 1–2 were refused by the product's own guards (no price row, then the
1,200-neuron per-step cap). The owner cancelled before attempt 3 finished. KV `config:models` is reset to `{}`. The
price-row and step-cap commits are reverted (e90f16f6, f598acb8), deployed as f598acb8. Build model: glm-5.3-flash.
