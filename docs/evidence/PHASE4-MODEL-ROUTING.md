# Phase IV — Cloudflare unified routing: what is actually true

Measured 2026-08-31 against account `e9b8acf2…` with the deployed worker's own
credentials. Every line below is a response this account received, not a reading
of the documentation.

## The architectural claim holds

The manifest's §2 is correct. Third-party models **can** be called through
Cloudflare with **no OpenAI / Google / DeepSeek API key in the application**.
Two surfaces do it:

- `env.AI.run("openai/gpt-4.1-mini", {…}, { gateway: { id: "golem" } })`
- `POST /accounts/{id}/ai/v1/chat/completions`, authorised with a *Cloudflare*
  API token, `{"model": "openai/gpt-4.1-mini", …}`

Credential precedence is: provider key on the request → BYOK key stored under
the `default` alias → Unified Billing. With no key anywhere, requests fall
through to Unified Billing, which bills Cloudflare credits.

So: **do not ask the owner for provider keys.** That instruction was right.

## The blocker is money, not credentials

Every third-party model returns the same thing:

```
2021: Insufficient balance; add money to your gateway or use BYOK
```

That error is diagnostic, not a failure of the approach — the request was
recognised, routed, and priced. It stopped at the balance check. The account has
two gateways (`golem`, `default`) and **zero prepaid AI Gateway credits**.

**Owner action required** to unblock third-party routing: add credit to the AI
Gateway balance, or store a provider key as BYOK under the `default` alias.
Until then the router cannot use any non-Cloudflare model, and any claim that it
does would be false.

## What works today, unchanged

Workers AI native models run on the existing `AI` binding with no extra spend
beyond Workers AI's own pricing. Verified live:

```
POST /accounts/{id}/ai/run/@cf/zai-org/glm-5.3-flash   -> 200, real completion
```

This is what production already uses, and it stays the default.

## The manifest's candidate list is wrong in two places

Probed by name. `2021` proves a name is valid (it reached billing);
`7003 Model not found` / `Invalid input` proves it is not.

| candidate from the manifest | verdict | evidence |
|---|---|---|
| `openai/gpt-5.6-luna` | **does not exist** | `7003 … Invalid value at input` |
| `google/gemini-3.7-flash` | exists, unfunded | `2021 Insufficient balance` |
| `@cf/deepseek-ai/deepseek-v4-flash-0731` | exists, runs today | in Workers AI catalogue |
| `@cf/zai-org/glm-5.3-flash` | exists, runs today | verified 200 |

Additional probes, for the router's candidate table:

| name | verdict |
|---|---|
| `openai/gpt-4.1-mini` | exists, unfunded |
| `openai/gpt-5.5` | exists, unfunded |
| `openai/gpt-5.6` | not offered |
| `google/gemini-2.5-flash` | exists, unfunded |
| `google/gemini-3-flash` | exists, unfunded |
| `anthropic/claude-haiku-4-5` | not offered |
| `deepseek/deepseek-v4` | not offered (the `@cf/` form is the one that exists) |

The Workers AI catalogue endpoint `/ai/models/search` returns **65 models, all
`@cf/`-prefixed**. It does not enumerate partner models at all, so it cannot be
used as the router's candidate list for third-party routing — that list has to
come from the AI Gateway catalogue instead. Worth knowing before someone builds
a model picker on the wrong endpoint.

## One operational detail the router must encode

`@cf/zai-org/glm-5.3-flash` answered a `max_tokens: 8` probe with
`finish_reason: "length"`, empty `content`, and a populated `reasoning_content`.
Reasoning models spend the budget on reasoning before emitting a single visible
token. A router that caps `max_tokens` low to save money will get **empty
strings back and pay for them**. Any per-step token cap has to have a floor that
clears the reasoning budget, or reasoning has to be switched off for that step.
