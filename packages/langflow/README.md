# packages/langflow — Apple's offline/admin flows in the local Langflow

These flows run in the Langflow Desktop app on the owner's Mac. The app serves `http://127.0.0.1:7860`
and the flows live in its **Apple** project. Langflow is localhost only, so nothing in the worker calls
these flows. They are admin tools for the gauntlet, training and RAG pipelines, and each writes files
the existing repo scripts already read.

| Flow (slug) | Steps | Model | What it gives you |
|---|---|---|---|
| `apple-visual-critique` | critique request -> Workers AI -> verdict | `@cf/meta/llama-4-scout-17b-16e-instruct` | A blind A/B critique of our Studio shot against a reference, mapped back to ours/reference, plus the ready `scripts/gauntlet-verdict.mjs --record … --blind` command |
| `apple-training-data` | gap -> training request -> Workers AI -> records | `@cf/meta/llama-4-scout-17b-16e-instruct` | A skill card draft, a `chunks.jsonl` line and chat-format Luau examples for one visual gap. Anything that names a game, uses a fake `Enum.Material` or has no Luau is rejected. Every example is marked `review: "draft"` |
| `apple-rag-ingest` | RAG chunker | none | Chunks in `packages/corpus/data/chunks.jsonl` format, packed the same way as `packages/corpus/src/chunk.mjs` |
| `apple-asset-curation` | asset curator | none | Dedupe plus a licence verdict (`import-ok` / `review` / `reference-only`) for the asset-hunt JSONL records, and conflicts where the record's own `use` disagrees |

Each step is a Python custom component in `components/`. `sync.mjs build` has the live Langflow compile
them into `flows/*.json`, and the tests check that those files have not drifted from the `.py` sources.

## Commands (node only, no npm install)

```sh
node packages/langflow/sync.mjs status                   # JSON: running, version, each flow inLangflow/current
node packages/langflow/sync.mjs build                    # regenerate flows/*.json from components/*.py
node packages/langflow/sync.mjs sync                     # upsert the Apple project, credentials, the 4 flows
node packages/langflow/sync.mjs run apple-rag-ingest --example
node packages/langflow/sync.mjs run apple-visual-critique --input-file spec.json
node --test packages/langflow/                           # offline, against a fake Langflow
```

`sync` is idempotent. Each flow has a fixed UUID and is written with `PUT /api/v1/flows/{id}`, so edits
made in the GUI are overwritten by the files in this folder.

## Auth and secrets

- The GUI and the CLI both use the app's auto-login session (`GET /api/v1/auto_login`). `LANGFLOW_API_KEY`
  in the environment is the fallback.
- `/api/v1/run` needs an API key even under auto-login. `run` creates a short-lived key and deletes it
  when the run ends, even if the run fails.
- Workers AI credentials are the Langflow Credential variables `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN`. `sync` fills them in from the repo `.env` in-process.
- Nothing prints token values. `sync` reports only created/updated/kept/MISSING, and the flow JSON holds
  only the variable names.

## Caps

The Workers AI step accepts only three free models: `llama-4-scout` (the default, and the only one that takes images), `@cf/qwen/qwen3-30b-a3b-fp8` and `@cf/openai/gpt-oss-20b`. It also
enforces these limits:

- `max_tokens` is at most 1024.
- A request carries at most 4 images and at most 4 MB of body.
- Each call times out after 120 s.
- Critique images are shrunk to 768 px JPEG.
- Training asks for at most 3 examples per gap.
- The chunker takes at most 200 docs.

## Playground inputs (GUI)

Open **Apple** -> a flow -> **Playground**, then type one of these:

- **visual-critique:** `{"ours": "/abs/ours.png", "reference": "/abs/ref.png", "test": "map", "piece": "hub"}`, or three plain lines (ours path, reference path, test).
- **training-data:** the gap as plain text, or a verdict pasted from visual-critique.
- **rag-ingest:** file paths, one per line, or raw markdown.
- **asset-curation:** JSONL paths or directories, one per line.

## Dashboard

A panel should read `node packages/langflow/sync.mjs status`:

```json
{"url": "http://localhost:7860", "running": true, "version": "1.12.2",
 "flows": [{"slug": "apple-rag-ingest", "id": "<uuid>", "name": "Apple: RAG chunker",
            "inLangflow": true, "current": true, "models": false}]}
```

`models` means the flow calls Workers AI. `current` means the flow in Langflow matches this folder. To read it without node, use `GET /health` and `GET /api/v1/version`.
