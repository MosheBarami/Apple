# AICSS vendored source

This directory vendors public AICSS React component source from two public
upstream surfaces:

- `https://github.com/kvnkld/aicss` at commit
  `a78d3c308d10972e5196331162c5c2c870b1a69f` (`@aicss/react` 0.1.4).
- The unauthenticated AICSS shadcn registry at `https://www.aicss.dev/r/`,
  checked on 2026-09-22 for public components added after that Git snapshot.

The component source and CSS Modules are copied without visual or source
rewrites. The upstream MIT license is preserved verbatim in `LICENSE`.

Upstream public component directories at this commit:

- `thinking-state`
- `thinking-reasoning`
- `orbs`
- `text-response`
- `streaming-text`
- `code-block`
- `data-table`

Additional public registry source vendored exactly from HTTP 200 responses:

- `file-diff` — `/r/file-diff.json`
- `inline-citations` — `/r/inline-citations.json`
- `comparison-table` — `/r/comparison-table.json`

The local `index.ts` files only re-export the copied components. The TSX and
CSS Module files in those three directories are the registry contents without
rewrites.

The AICSS license page states that free components are MIT-licensed and that
Pro components are excluded from the public source. The root MIT license is
kept verbatim in `LICENSE`.

Requested follow-up slugs checked against the live registry and component
pages on 2026-09-22:

| Slug | Disposition | Evidence |
| --- | --- | --- |
| `file-diff` | vendored | Registry HTTP 200 with TSX + CSS; page does not show the Pro unlock gate. |
| `inline-citations` | vendored | Registry HTTP 200 with TSX + CSS; page does not show the Pro unlock gate. |
| `comparison-table` | vendored | Registry HTTP 200 with TSX + CSS; page does not show the Pro unlock gate. |
| `image-generation` | license-blocked | Registry HTTP 401 says licensed Pro source is not public; page says “Unlock the code with Pro”. |
| `task-list` | license-blocked | Registry HTTP 401 says licensed Pro source is not public; page says “Unlock the code with Pro”. |
| `ai-agent-input` | license-blocked | Registry HTTP 401 says licensed Pro source is not public; page says “Unlock the code with Pro”. |

`audio-waves` and `approval-card` were already confirmed Pro-locked and are
not vendored or reconstructed.

## Removed on 2026-09-22

The chat, thinking and workspace surfaces moved to Vercel AI Elements
(`components/ai-elements/`, Apache-2.0, see its `NOTICE`). The eight component
directories below were then imported by nothing in the app, and were removed
rather than kept as unused vendored code. What replaced each one:

| Directory | Last user | Replaced by |
| --- | --- | --- |
| `thinking-state` | `ws/thinking.tsx` header | AI Elements `Shimmer` inside `ReasoningTrigger` |
| `orbs` (with the local `Orb.runtime.js` + `.d.ts`) | `ws/thinking.tsx` header | AI Elements `ReasoningTrigger`'s Brain icon |
| `streaming-text` | `ws/thinking.tsx` activity rows | AI Elements `ChainOfThoughtStep` / `Tool` rows (plain text) |
| `text-response` | none (already unused) | AI Elements `MessageResponse` |
| `code-block` | none (already unused) | AI Elements `CodeBlock` |
| `thinking-reasoning` | none (never used) | — |
| `file-diff` (with the local `FileDiff.runtime.js` + `.d.ts`) | `lib/generative-ui/render.tsx` `code_diff` | AI Elements `CodeBlock` in the `diff` language |
| `inline-citations` | `ws/credits-panel.tsx` source credits | AI Elements `Sources` / `Source` |

Their pinned Git blob ids and registry SHA-256 values are kept in
`tests/aicss-vendor.test.mjs` as the record of exactly what was vendored, and
that test asserts every one of these directories is absent, is listed here,
and is imported by no file in `src/`.

Still vendored and still in use: `data-table` (`routes/admin.tsx`) and
`comparison-table` (`routes/usage.tsx`), with `css.d.ts` for their CSS Modules.

