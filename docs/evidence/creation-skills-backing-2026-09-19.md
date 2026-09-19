# 217 creation skills, and 145 of them were silent about the thing that matters most

w32 asks for hundreds of distinct source-grounded creation skills, reachable through bounded runtime
retrieval, **with validation and real implementation/evaluation status kept separate**. The first
two were already true. The third was true of the data model and false of everything a caller
actually receives.

## The catalogue, measured

```
skills                 217
distinct ids           217
distinct titles        217
domains                  9   ui 16 · input 10 · client_server 16 · data 18 · gameplay 27 ·
                             worldbuilding 8 · performance 9 · security 33 · genre_pattern 80
with >= 1 reference    217   every reference resolves to packages/corpus/data/chunks.jsonl
                             by docSlug AND chunkId — a renamed document breaks the suite
```

Backing, which is the part w32 is really about:

```
reviewed_prefab    22   executableVerified: true   — something has been run
mechanic_pattern   50   executableVerified: false  — a pointer, not a proof
ABSENT            145   nothing at all
```

## The defect: an omission is not a status

Every retrieval surface in `creator-skills.ts` spelled it the same way:

```ts
...(skill.implementation ? { implementation: {…} } : {}),
```

So for those 145 skills the key came back **missing**. A caller holding one of them — and the caller
is the model — cannot tell *"nothing in this product implements this"* from *"that field was left
out of this payload"*. Those are different facts about the same skill, and only the first is
something anyone can act on or any test can check. The catalogue-level disclosure does say the
content is authored guidance, but a disclosure one level up is not what a caller holding one skill
is looking at.

`implementation` is now always present, at all three surfaces (`publicSkill`, the search hit, and
the minimum-budget genre profile): `{ status: 'none', note: … }` or `{ status: 'declared', kind, id,
executableVerified, note }`. `'none'` is a claim the catalogue makes and can be wrong about. An
omission is not a claim at all.

The three distinctions stay separate, which is the point of the row:

| | means |
|---|---|
| `guidanceStatus: 'authored_guidance'` | how the text was produced |
| `status: 'none'` vs `'declared'` | whether anything in the product is pointed at it |
| `executableVerified: true` vs `false` | whether that thing has actually been run |

A `mechanic_pattern` is declared and unverified. A `reviewed_prefab` is declared and verified. Both
are different from 145 skills that are neither, and all three are now said out loud.

## Falsified, both halves

Restoring the shipped conditional spread, one surface at a time:

```
publicSkill  ->  "these skills return no backing status: …"        fail 1
search hit   ->  "security-server-owned-price hit omits its backing status"   fail 1
```

Green again on revert. The guards also refuse to pass vacuously: they assert that both `none` and
`declared` exist in the catalogue, and that `executableVerified` is observed both true and false —
a guard that only ever sees one side of a distinction is not testing the distinction.

## Two budget mistakes, both mine, both caught by the repo's own guards

Making a field mandatory costs characters, and this catalogue is budgeted to the character.

1. **The per-skill note.** My first `NO_BACKING_NOTE` was three lines. The read-budget guard failed
   immediately: one skill's minimum payload no longer fitted. Shortened to one clause, and the
   floor raised from 1400 to 1500 — because a fact that must always be present legitimately raises
   the floor, and the alternative (letting the shrink drop the key under pressure) would reinstate
   the omission silently, for exactly the longest skills.
2. **The disclosure, half an hour later, one level up.** I wrote a careful 312-character
   explanation of the new field into `CREATOR_SKILL_CATALOG_DISCLOSURE` — which ships on **every**
   search payload. At the 700-character minimum the search then reported `totalMatches: 73,
   returned: 0`. Seventy-three matches and nothing to show for them, in order to explain itself at
   length. The long form moved into the type's doc comment, which costs nothing to send; what ships
   is 73 characters.

Both floors are now exported constants, and every test reads them instead of a literal. They were
`700` and `1400` in five places across two files, and when the payload grew, each of those literals
became a test asserting the old shape — which reads as the change being wrong rather than the number
being stale. The budget test also gained the check that was missing under all of this:

```js
assert.ok(tightSearch.results.length >= 1, 'the minimum search budget returns no result at all');
```

A floor that returns nothing is not a floor, and the old guard would have passed while the tool
answered "73 matches, 0 returned".

## Not verified

- **Whether the guidance is any good.** Every skill is reviewed prose with a resolved citation.
  Nothing here measures whether following one produces a better build; that is what the gauntlet is
  for, and no skill has been through it.
- **Whether the 22 `reviewed_prefab` skills point at prefabs that still work.** The test resolves
  the id against `PREFABS` and asserts `executableVerified: true`; it does not run them.
- **The 50 `mechanic_pattern` pointers** resolve to real mechanics and are explicitly unverified.
  That is the honest status, not a gap to be filled by changing the flag.
- **Retrieval quality.** Ranking is lexical. Nothing measures whether the right skill comes back
  first for a real user request.
