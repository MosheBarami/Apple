# Hugging Face boundary, 2026-10-08

The development env has an HF_TOKEN. The real `/v1/models` endpoint returned 137 base models;
expanding its explicit live provider records produced 311 provider-specific model routes.
The complete public-model snapshot is `huggingface-catalog.json`. It carries no credentials.

The provider metadata reports host-specific capabilities, context and prices, sometimes unknown.
We use the documented `model:provider` suffix rather than allowing `:fastest` to silently select
a different host after routing. The manufacturer comes from the API's `owned_by` field, not a
guess from a model string. Unknown metadata stays null.

Actual inference to `meta-llama/Llama-3.1-8B-Instruct:deepinfra` returned HTTP 402. The account
requires inference credits. No credit purchase or plan change was made. This is not a successful
inference, connection runtime proof, website proof, Studio proof or deployment.

Sources checked:
- https://huggingface.co/docs/inference-providers/index
- https://huggingface.co/docs/inference-providers/tasks/chat-completion
- https://huggingface.co/docs/inference-providers/pricing
