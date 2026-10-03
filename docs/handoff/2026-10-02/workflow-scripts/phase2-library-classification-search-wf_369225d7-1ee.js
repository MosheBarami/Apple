export const meta = {
  name: 'phase2-library-classification-search',
  description: 'Phase 2: library classification schema, labelled 50-query eval, and semantic search, built and measured on a sample',
  phases: [
    { title: 'Understand', detail: 'gateway + index data; worker/plugin consumers' },
    { title: 'Design', detail: 'schema, search approach, 50 labelled queries' },
    { title: 'Implement', detail: 'classifier + search + eval harness in a worktree' },
    { title: 'Verify', detail: 'adversarial check of the measured numbers' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running and uses the owner library gateway (a Python process on 127.0.0.1:63747, code in packages/owner-corpus/gateway.py). NEVER stop, restart or modify the running gateway process or its data files in place. You may READ its data and GET its endpoints (read-only). To test new code, run a second instance on another port (e.g. 63799) against a COPY or read-only view of the data, and stop it when done.
- Never deploy, never push, never touch Roblox Studio or Chrome. No paid API/model calls. Model-based classification of all ~97k items would cost money: build and run it only on a small sample using free/local means (or the metadata already on disk), and write a cost/time estimate for the full run for the owner to approve.
- Never upload anything to Roblox. Every library item keeps its provenance/licence.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout). Read-only there unless you were given a worktree. In a worktree: commit with \`git commit -q -F <msgfile> -- <explicit paths>\`; never git add -A, never pnpm install, never stash/reset/checkout. Symlink node_modules from the main checkout if needed.
- Large data must not be committed (check sizes; the repo is already huge). Generated indexes go in gitignored paths unless small.
- Owner directive "generalize-not-patch": no subject-specific code; search must work by meaning, style, colour, size and type, for requests nobody has tried.
- Report only what you measured. Read CLAUDE.md, AGENTS.md first.
`

const BRIEF = `
OWNER'S BRIEF (phase 2): the owner library (565 games, ~97k assets: models, maps, systems, UI packs, kits, animations, VFX/SFX) must be fully
classified — for each item a description, tags, image, size, colour and quality — and searchable by meaning, style, colour, size and type.
Done when >= 95% of items are classified and >= 90% top-3 hits on 50 labelled queries. Today the agent's library pick is NAME-ONLY
(apps/worker/src/library-object.ts objectQueries/rankCatalog): "treasure chest" returned a knife, "robot pet" a Doge head, "hot air balloon"
party balloons, "cloud you can bounce on" a trampoline. Asset order the owner wants: library first, then Creator Store, then combine/adapt,
then build from scratch.
`

phase('Understand')
const [gw, consumers] = await parallel([
  () => agent(`${RULES}\n${BRIEF}\nRead-only. Map the library side: packages/owner-corpus (gateway.py, gateway_library.py, library_*.py, audit/), where the library data lives on disk (paths, formats, sizes, counts by type), what metadata exists per item today (names, classes, sizes, colours, thumbnails?, descriptions?), what endpoints the gateway serves (GET them on 127.0.0.1:63747 read-only to confirm shapes; never POST anything mutating), and packages/asset-library (models/sfx/vfx/ui-store manifests). Give exact counts measured from the data.`, { label: 'understand:gateway', phase: 'Understand' }),
  () => agent(`${RULES}\n${BRIEF}\nRead-only. Map the consumers: how the worker searches and uses the library (apps/worker/src/library-object.ts, local-owner-corpus.ts, owner-corpus.ts, owner-corpus-routes.ts, library-*.ts, model-library.ts, the tools that expose library search to the model in tools.ts), and the plugin side (apps/apple-plugin/src/ops/LocalOwnerCorpus.luau, init.server.luau). How does a query flow from the agent to the gateway and back? What does the model see about each candidate? Which tests pin the contract (apps/worker/tests, apps/apple-plugin/tests)?`, { label: 'understand:consumers', phase: 'Understand' }),
])

phase('Design')
const design = await agent(`${RULES}\n${BRIEF}\nLibrary side:\n${gw}\n\nConsumers:\n${consumers}\n\nDesign phase 2: (1) a classification schema per item (type taxonomy covering models, maps, systems, UI packs, kits, animations, VFX, SFX; description; tags; image/thumbnail reference; bounding size in studs; dominant colours; quality score with a defined rubric; provenance); (2) how to fill it: what can be derived deterministically from the place files/metadata already on disk (class census, sizes, colours, part counts, scripts) vs. what needs a model (descriptions, style tags), with a free/local option and a paid option and their estimated cost/time for 97k items; (3) the search: hybrid of semantic embeddings (local, free — e.g. a small local embedding model if one is available on this Mac, else a lexical+facet fallback) with facet filters for type/size/colour, served by the gateway as a NEW read-only endpoint; (4) how the agent receives results (rich candidate info so the MODEL decides, including rejecting all); (5) a labelled eval set of 50 queries over REAL items you can see in the data (varied: objects, silly, style, colour, size, maps, systems, UI, VFX, SFX; none copied from packages/evals/owner-bench/requests.json), each with the ids of acceptable top-3 answers, built honestly before seeing any search output. Output the design as markdown, and the 50 queries as a JSON block.`, { label: 'design', phase: 'Design' })

phase('Implement')
const impl = await agent(`${RULES}\n${BRIEF}\nDesign (includes the 50 labelled queries):\n${design}\n\nImplement in your own worktree: (a) the classification pipeline (deterministic fields for ALL items if they can be computed locally for free; model-filled fields only on a sample of <= 300 items using free/local means), writing to a gitignored index path; (b) the search module and a new read-only gateway endpoint (run your own instance on a spare port to test; never touch the live one); (c) the eval harness that runs the 50 labelled queries and reports top-1/top-3 hit rates and coverage (% of items with each schema field filled); (d) wire the worker side so library search results reach the model as candidate information — behind the existing tool contract, without deploying, with tests. Commit (subjects start "phase 2:"). Run the relevant python and node tests. Report: worktree, branch, SHAs, measured coverage per field, measured top-3 on the 50 queries (on whatever is classified), cost/time estimate for full classification, what remains.`, { label: 'implement', phase: 'Implement', isolation: 'worktree' })

phase('Verify')
const verify = await agent(`${RULES}\nDesign:\n${design}\n\nThe implementer reported:\n${impl}\n\nAdversarially verify in the worktree it names: re-run the eval harness yourself and compare numbers; check the 50 labels were not tuned to the search output (look at commit order/timestamps and whether queries share wording with item names in a way that makes name-matching win trivially); check coverage numbers against the real item count; check nothing touched the live gateway or committed large data; run the tests. Report confirmed numbers vs claimed numbers. Default to refuting when uncertain.`, { label: 'verify', phase: 'Verify' })
return { design, impl, verify }
