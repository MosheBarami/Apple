# Why the cliff wall's rock palette is three meshes, and what it would take to make it more

**Date:** 2026-09-01 · **Place:** Golem Visual Benchmark (`116648235878426`)

## The question

F-19 rejected raising the cliff wall's mesh ratio and named the remaining work:

> the wall does not need a higher mesh RATIO. It needs either more distinct rock silhouettes
> in the palette, or authored courses that are not flat slabs.

`Build.luau` already places modules on **62 %** of cliff segments — the 0.85 experiment was the
one F-19 rejected, because 15 more primitives bought with five more copies of the same three
rocks is a bad trade against §AK's "extreme repetition is a hard failure".

So: can the palette get more distinct rock silhouettes from the free Creator Store?

## What the search actually returns

`search_asset`, `creator_store`, free, `Model`, "low poly rock cliff boulder" — 20 results.
Four were inserted into a staging folder and scanned before anything else, because a Creator
Store model is untrusted content that can carry scripts.

| asset | mesh id | scripts | parts | verdict |
|---|---|---|---|---|
| `6233908256` "Rock" (Polylab) | `6233862478` | 0 | 1 mesh, untextured | clean — evaluated on render |
| `13422584132` "Boulder" | — | 0 | **419 parts, 0 meshes** | rejected: a voxel build, the "more bricks" answer |
| `122827948899426` | `6402094480` | **2** | 1 mesh | rejected |
| `70718456464480` | **`6402094480`** | **3** | 1 mesh | rejected |

**The last two are the same mesh.** Two different asset ids, two different "creator" accounts —
`Christoph3rOrbitStor` and `Machinerayz` — one identical `MeshId`. Both ship scripts inside
what is sold as a rock.

That is the shape of the free tier: the listings whose names are keyword strings
("🪨 Low Poly Rock Stone Boulder Cliff Terrain", "🏜️ Low Poly Rock Boulder Stone Cliff Desert
S") and whose descriptions are tag farms — several carrying blocks of unrelated keywords, and
one instructing readers to ignore them — are re-uploads of a small number of underlying meshes,
wrapped around scripts.

It is worth being precise about the risk, because the insert tool reported it: two of the four
came back with `sandboxed: true` and the note that scripts had been found and had their
capabilities restricted. Nothing executed. But a palette assembled by name-matching search
results would have pulled scripts into the shipped world, and would have pulled the *same mesh*
twice while believing it had two.

## The one clean candidate, and why it was still rejected

Polylab's "Rock" is genuinely clean: one `MeshPart`, no scripts, **no texture** — so it takes a
tint, which is the hard requirement for this world's flat-shaded palette and the reason six of
nine Cube generations failed.

It was rendered at the cliff tier (26 studs), in the biome's own rust, in a line beside all
four rocks currently in `ServerStorage`. **Rejected:** at 26 × 26 × 26 it reads as another
rounded dome, and the palette already has rounded domes. It is a clean asset that adds a
silhouette the wall already owns.

This is the same standard that rejected `cliff_module` twice and the three de-textured mesas:
an asset earns a slot by being *distinct in the world*, not by being technically acceptable.

## What this establishes about gate 2

The constraint is now measured rather than assumed. "Add more distinct rock silhouettes" is not
a matter of searching harder:

- the free Creator Store's rock supply is dominated by re-uploads of a small number of meshes,
  distributed with scripts attached;
- the one clean, tintable, script-free candidate found duplicates a silhouette already in the
  palette;
- and the palette's four stored rocks are already curated down to three by `curatedFor`, so the
  shelf is not being under-used.

The remaining routes are therefore **generation** (the project's own Cube path, which produced
the accepted geode and six rejections) or **authored geometry** — courses that are not slabs,
built rather than acquired. Both are larger pieces of work than a search, and neither is
blocked; this document exists so the next attempt starts from the measurement instead of
repeating the search.

## Cleanup

Every inserted candidate was removed from the place. `Workspace.Canyon` is back to the 867
parts the builder produces, with no staging folders and nothing left in `ServerStorage`.
