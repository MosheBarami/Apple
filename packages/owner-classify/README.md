# owner-classify: the owner library, classified and searchable (phase 2)

Every item of the owner library (models, maps, systems, UI screens and kits, tools, animations, effects, sounds, scripts, art
packs) gets one record: type, subtype, description, tags, size, colour, look, quality, provenance. The records are searched by
meaning, style, colour, size and type, and served to the agent as compact candidates.

Nothing here reads a model service or the network; nothing writes inside `owner-library/` (the live gateway reloads files there).
Output goes to a sidecar: `~/Library/Application Support/Apple/owner-classify/` (override with `--out` / `APPLE_OWNER_CLASSIFY`).
That is outside the repo; the generated files are 100s of MB and are never committed.

```
python3 classify.py                # ~25 s: items.jsonl + coverage.json, deterministic fields for every row (read-only on owner-library/)
python3 index.py                   # ~5 s: find.sqlite (FTS5 BM25 + facets); --lsi adds the LSI term neighbours (off: measured to hurt)
python3 embed.py build             # ~45 s on Apple GPU: dense.f16.npy (+ dense.words.*): optional meaning-based tier, see below
python3 eval50.py [--dense]        # the 50 labelled queries: top-1/3/10, MRR, reject-probe false accepts, per-field coverage
python3 -m unittest discover -s tests
```

## Files

| file | job |
|---|---|
| `lexicon.py` | generic vocabularies only: colour words, size words, number words, type words, stop words, subtype word lists. No subject-specific code. |
| `classify.py` | one record per content hash (`hash12`), plus `system:<gameId12>`, `kit:<id>`, `media:<id>`; join of assets, verify entries, pieces, bounds, style, families, ui, systems, media, knowledge cards |
| `index.py` | SQLite: `items` (facet columns + the record), `fts` (name 3, tags 2, text 1.5, context 1, game 0.5), `words`, `nbr` (LSI neighbours) |
| `search.py` | query parser (colours, numeric size with min/max/approx and axis, size classes, type words) and ranking |
| `embed.py`, `onnx_weights.py` | optional dense tier (all-MiniLM-L6-v2 read in place from an int8 ONNX export; no download) in a resident helper process |
| `find_route.py` | `GET /v1/library/find`, called by `gateway_library.py` (patch: `gateway_library.find.patch`) |
| `eval50.py`, `eval50.json`, `eval50_lookup.json` | the labelled set and its scorer |
| `colour_pass.luau`, `colour_pass.py` | Lune pass over the source files (no Studio, no script execution): colour by count and by volume, visible size, and the 80 largest parts as boxes, for every model/tool/fx/map row (the old pieces pass skipped anything with scripts or over 400 parts). About 2 minutes for all 565 games. |
| `thumbs.py` | Pillow isometric proxy renders (96 px, 1-3 KB) from those boxes: `image.kind = proxy-render`. A silhouette-and-colour picture, not a Studio screenshot (meshes/unions are drawn as their boxes). |
| `describe_sample.py` | the model-filled fields on a 300-item stratified sample (local Ollama only); `--dry` builds the prompts and measures tokens. Not run for real: no local model is installed. |

## Record (per hash)

`id, refs[], copies, type, subtype, name, name_clean, kind, className, context, contains[], description (<=160), tags[5-12],
game_tags[], look, colour{top[{hex,name,hue,share}], hues[], saturation}, size{studs, cls, conf}, composition{parts, instances,
scripts, unions, humanoid, animated, emitters, lines, buttons, texts}, quality{score, band, reasons}, image{kind, path, status},
provenance{game, gameId, path, licence, games[], source_hash}, near, confidence{}`.

* **Quality** is deterministic, 0-100, every point traceable (see `classify.quality_block`). Criteria whose evidence does not exist
  yet (a thumbnail) are left out of the denominator instead of scored zero. Band D is left out of default search results.
* **Size** `conf`: `measured` (pieces.json, visible parts), `bounds` (bounds profile, untrimmed), `none` (any side over 5000 studs:
  junk bounds such as a 1,000,000-stud sky plane; the numbers are kept, the class is not set).
* **Colour** is the top 3 hex values by part count (what `library_pieces.luau` records); `share` is the rank weight 0.5/0.3/0.2,
  not a measured area share.
* `confidence` says which fields are derived and which are templates. The description is a template unless a model sample has
  replaced it; templates are not indexed as text (they repeat "parts", "from", "scripts" in every record).

## Search tiers

* **T0** BM25 over fielded text with porter stemming, plus facets (colour in Lab space against the palette, numeric size on a log
  scale, size class, type, quality prior). Needs nothing.
* **T1** LSI term neighbours learned from the library's own documents (scipy, offline; `index.py --lsi`). Measured on the 50 queries it
  lowers top-3 (31 -> 29 alone, 38 -> 37 with dense), so it is built and used only on request.
* **T2** dense vectors (384-d, float16, ~65 MB) with reciprocal-rank fusion, and a dense neighbour lookup for words the library
  never uses ("hippopotamus" -> "hippo"). Runs in `embed.py serve`, a resident helper that the gateway starts on first use, because the
  gateway's own Python (3.9, no numpy) cannot run torch. Missing helper, torch or vectors: the finder silently runs T0+T1.
  The weights are read in place from the int8 ONNX MiniLM that ships inside the Continue VS Code extension
  (`APPLE_EMBED_MODEL` overrides); nothing is downloaded or copied. A purpose-built embedding model would be better; the owner decides.

Ranking: per-term BM25 (own word 1.0, spelling/prefix relative 0.75, dense neighbour <=0.8, LSI neighbour 0.25) -> coverage of the
request's total IDF weight -> reciprocal-rank fusion with the dense rank -> facet factors (colour, size, type) -> type prior
(a request is mostly for a model; sound/animation/effect words in the request move weight there) -> quality prior -> collapse of
near-duplicates (same name+parts+size, or same type+name), counting `copies` and keeping `same_as` ids.
A numeric size and an explicit type noun ("map", "sound") act as filters when enough items satisfy them.

`no_strong_match` is an advisory: true when the best candidate covers under 60% of the request's content weight. The agent may
(and the harness prompt tells it it may) reject every candidate.

## Gateway route

`GET /v1/library/find?q=&type=&subtype=&colour=&size=&min_quality=&game=&limit=&explain=1` (read-only, loopback, same rules as the
other `/v1/library` routes). Install into `gateway_library.py` with `gateway_library.find.patch` (the gateway directory
`packages/owner-corpus/` is untracked in git). Test it on a second instance, never the running one:

```
APPLE_OWNER_CLASSIFY=<sidecar> python3 gateway.py --root <empty dir> --cache <empty dir> --port 63799
python3 eval50.py --url http://127.0.0.1:63799
```

## Measured (this machine, 2026-10-02; library 97,428 rows -> 87,173 items = 80,955 hashes + 54 systems + 367 kits + 5,797 art-pack items)

* classify.py 25 s (7 s with warm cache), index.py 5 s, embed.py build 35-48 s (Apple GPU), colour_pass 2 min (564 games, 2 workers,
  nice 10; 1 game fails to parse), thumbs 196 s for 36,223 pictures (5 ms each, 141 MB).
* Fully classified (every APPLICABLE field set: type, description, tags, quality, provenance, and for physical items with parts also
  colour and size class): 95.9% of items / 96.1% of rows; 94.2% / 94.5% when the picture is required too. Physical items with parts:
  colour 92.0%, size class 99.3%, picture 88.1%. Non-applicable fields (colour/size of a sound or script) are not counted.
* 50 labelled queries, top-3: T0 31/50, T0+T1 29/50, T0+T2 38/50 (76%), top-1 29, top-10 45, MRR 0.68, 0/3 reject-probe false accepts.
  Query latency 18 ms (T0) / 130 ms (with dense, first query loads the model). Weights were tuned on these same queries.

## Honest limits

* The 50 queries were written from the data's names, before any search ran, but ranking weights were tuned afterwards on the same
  set: reported hit rates are optimistic for unseen requests. Several categories have large answer sets and are easy.
* Requests that need world knowledge the library text lacks ("tropical bird with a giant beak" for a Toucan; "dinosaur with plates"
  for a Stegosaurus) are not solved by lexical search or by MiniLM. A language model writing a description per item would fix most
  of them: that is the paid / local-LLM option the owner has not yet approved.
* Colour covers physical items that `pieces.json` measured (models/tools with 1-400 parts and no scripts); the rest are `none`.
* No per-asset images exist: see `thumbs.py`.
