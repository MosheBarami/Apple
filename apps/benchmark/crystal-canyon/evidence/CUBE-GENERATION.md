# Cube / GenerationService — working, with the API mapped

Twice reported in this phase as blocked. Both reports were wrong about the cause,
and the second one was wrong about the outcome. Recorded properly here.

Place: `PlaceId = 116648235878426`, `GameId = 10764643912`, published.

## What actually works

**`generate_mesh` via the Studio MCP tool works and produces good output.**

The earlier "blocked" conclusion came from the MCP call returning
`Request timed out`. It had not failed — generation takes longer than the tool's
timeout and delivers **asynchronously**. A model requested hours earlier was
found sitting in `Workspace`, complete:

```
"a small faceted low-poly crystal cluster, bright cyan, flat shaded"
  -> Model, 1 MeshPart, textured, 5.3 x 4.0 x 5.3
```

Rendered, it is a genuinely good stylised asset: faceted shards radiating from a
base with a light-cyan to deep-blue gradient. **The correct usage is
`run_as_job` and collect later — never a synchronous call.**

## The raw API, mapped by probing

The two methods take **different key names**, which is what made this look like a
capability problem rather than a signature one:

| call | key | result |
|---|---|---|
| `GenerateMeshAsync(inputs, player, options)` | `Prompt` | `Unable to trigger mesh generation` — service-side refusal, correctly formed |
| `GenerateMeshAsync` with `TextPrompt` | wrong key | `Expected field Prompt with type string` |
| `GenerateModelAsync(inputs, options)` | `TextPrompt` | works |
| `GenerateModelAsync` with `Prompt` | wrong key | `Unsupported key 'Prompt' in inputs` |

`GenerateModelAsync` additionally requires a schema **at the top level of
options**, not nested under `schema`:

```lua
gs:GenerateModelAsync({ TextPrompt = "…" }, { PredefinedSchema = "Car5" })
```

An invalid value names the whole valid set, which is how the limit was found:

```
Schema name must be one of: 'Car5', 'Body1'
```

**Cube 4D on this account supports exactly two predefined schemas.** Neither is a
chest, kiosk, gate or landmark, so 4D functional generation cannot serve this
game's props today. `SchemaDefinition` exists but rejected every key tried
(`Parts`, `Nodes`, `Components`, `Objects`, `Items`, `Schema`, `Definition`), so
its shape is still unknown.

Verified working end to end: `Car5` generated in **46.0 s**, returning a
generation id and `{ UUID }`.

## Accept / reject — generation succeeding is not acceptance

| candidate | verdict | why |
|---|---|---|
| cyan crystal cluster | **accept** | clean faceted silhouette, good gradient, reads as a collectible |
| wooden shop kiosk | **accept** | striped awning, counter, posts — genuinely authored cartoon art |
| crystal spire monument | **reject** | three parts that do not cohere: a grey block, a floating diamond and a separate purple cluster. Not one sculpture. |

The spire was rejected *after* rendering it, which is the point: it generated
successfully and still failed. Landmark candidates were re-requested with prompts
that demand a single unified silhouette.

## Still blocked, with the exact fix

**DataStore writes.** Publishing was necessary but not sufficient:

```
403: Cannot write to DataStore from studio if API access is not enabled.
```

`GetDataStore` succeeds; `SetAsync` and `GetAsync` fail. This is one checkbox —
**Game Settings → Security → Enable Studio Access to API Services.** Until it is
ticked, persistence still runs on the in-memory fallback and the save/load path,
session lock and stale-lock takeover remain unproven.
