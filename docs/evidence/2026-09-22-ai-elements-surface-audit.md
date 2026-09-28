# Is AI Elements the real chat/thinking surface? — audited 2026-09-22

**Verdict: the vendoring is genuine and nothing is mislabeled, but AI Elements is the Reasoning
SHELL, not the surface. One of the eight components the brief names is present. The rest of the
chat is AICSS (an independent MIT library) or app-local code.**

This is a measurement, not an opinion. Every claim below names the file it was read from.

---

## 1. What is actually vendored, and whether it is authentic

`apps/web/src/components/ai-elements/` contains `reasoning.tsx`, `reasoning-compat.tsx`,
`reasoning.css`, `shimmer.tsx`, `LICENSE`, `NOTICE`.

`NOTICE` records the provenance, and it is specific enough to check:

| Field | Value |
|---|---|
| Upstream | `https://github.com/vercel/ai-elements` |
| Commit | `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` |
| Upstream file | `packages/elements/src/reasoning.tsx` |
| Upstream SHA-256 | `f138cddde35854f73632ff51d48230f8d6e16e0a49a74b44a93b51993a65550e` |
| Licence | Apache-2.0, full text in `LICENSE` |

Five compatibility substitutions are disclosed rather than hidden: the Radix controllable-state hook
and the shadcn Collapsible wrapper become React 18 primitives in `reasoning-compat.tsx`; the lucide
`Brain`/`ChevronDown` icons become inline SVGs; Streamdown becomes this app's existing
marked + DOMPurify renderer; Tailwind class strings are retained for traceability while
`reasoning.css` supplies the styles; `Shimmer` reimplements the text sweep in CSS instead of
`motion/react`.

**So the specific failure the brief warns about — a home-grown visual clone that calls itself AI
Elements — has NOT happened.** There is a real vendored AI Elements `Reasoning` with a checkable
commit and hash, and the deviations are written down.

## 2. What actually renders the chat and the thinking card

Every import of either library, from `apps/web/src`:

| Rendered thing | Component | Comes from | AI Elements? |
|---|---|---|---|
| Reasoning container (open/close, `isStreaming`, `duration` context) | `Reasoning` | `ai-elements/reasoning` | **yes** |
| Reasoning header button | `ReasoningTrigger` | `ai-elements/reasoning` | **yes** |
| Reasoning context hook | `useReasoning` | `ai-elements/reasoning` | **yes** |
| Animated header orb | `Orb` | `aicss/orbs` | no |
| "Thinking…" streaming label | `ThinkingState` | `aicss/thinking-state` | no |
| Progressive label text | `StreamingText` | `aicss/streaming-text` | no |
| Assistant message body | `TextResponse` | `aicss/text-response` | no |
| Source citations | `InlineCitations` | `aicss/inline-citations` | no |
| Code blocks | `CodeBlock` | `aicss/code-block` | no |
| File diffs | `FileDiff` | `aicss/file-diff` | no |
| Admin table | `DataTable` | `aicss/data-table` | no |
| Usage comparison table | `ComparisonTable` | `aicss/comparison-table` | no |

The three `ai-elements` imports are all in one file, `components/ws/thinking.tsx` (lines 9, 135,
199, 203). The assistant's own words are rendered by AICSS in `components/ws/turn.tsx:26`.

Against the eight components the brief names — `Conversation`, `Message`, `PromptInput`, `Sources`,
`Reasoning`, `ChainOfThought`, `Tool`, `Task` — **one is present**.

## 3. AICSS is a different library, not a clone

This matters, because "AICSS is doing the work" and "something is pretending to be AI Elements" are
different findings and only the second is a misrepresentation.

`components/aicss/UPSTREAM.md` records: `https://github.com/kvnkld/aicss` at commit
`a78d3c308d10972e5196331162c5c2c870b1a69f` (`@aicss/react` 0.1.4), plus unauthenticated registry
pulls from `https://www.aicss.dev/r/` for `file-diff`, `inline-citations` and `comparison-table`.
MIT, licence kept verbatim, source copied without rewrites. Components that are Pro-licensed are
recorded as **not vendored** rather than reconstructed: `image-generation`, `task-list`,
`ai-agent-input`, `audio-waves`, `approval-card` — each with the HTTP 401 or the "Unlock the code
with Pro" page as its evidence.

That is a clean provenance record for a genuinely separate project. Nothing is labeled AI Elements
that is not AI Elements.

## 4. The semantic rule the brief sets is actually satisfied

The brief requires: `Reasoning` = allowed continuous model reasoning; `ChainOfThought` = OBSERVABLE
execution progress; and **never show private hidden model chain-of-thought**.

The product satisfies the important half of this by construction, and it is worth stating plainly:
**there is no model reasoning text on the wire at all.** `packages/shared/src/index.ts:1165` says
`effortReason` is "a classification of the request, **not the model's hidden reasoning**, and never
contains prompt or transcript content". `AgentStatus` carries `phase`, `step`, `totalSteps`,
`creditsSpent` and `context` — real stages the worker entered, never predicted.

So `ReasoningContent` — the component that exists to render reasoning text — is correctly exported
and correctly never used. A check for it finds it only in its own definition
(`ai-elements/reasoning.tsx:206`) and in the NOTICE.

What the app does instead is put **observable activity** inside the `Reasoning` shell: the
`ReasoningDetails` component in `thinking.tsx:114` renders "Observed run activity" from
`activity-model.ts`, plus the playtest card, the plan preview, verified gates and any denied tools.
That is the `ChainOfThought` job, wearing the `Reasoning` component's clothes.

## 5. Dead vendored code, recorded rather than deleted

- `aicss/thinking-reasoning` is vendored and **imported by nothing** except the barrel
  `aicss/index.ts:2`. Its only other mention in the tree is its own `UPSTREAM.md` entry.
- `ai-elements/reasoning.tsx` exports `ReasoningContent`, which nothing renders (see §4 — correctly).

Neither is a defect. Both are recorded here so the next reader does not mistake a vendored-but-unused
file for a wired-up one.

## 6. What closing the gap would cost, and why it is the owner's call

Closing it fully means vendoring and rewiring roughly seven more AI Elements components
(`Conversation`, `Message`, `PromptInput`, `Sources`, `ChainOfThought`, `Tool`, `Task`) over the
existing chat surface. That is not a verification task; it is a redesign of the product's most
visible screen, and AI Elements ships shadcn/Tailwind styling that would need the same class of
compatibility substitutions already documented for `Reasoning` — against a design system the brief
describes in detail (minimal, near-black, calm, restrained blue, violet only for Autonomous).

Three honest options, none of them free:

1. **Vendor the missing components and rewire.** Largest change, largest visual risk, fully satisfies
   the letter of the requirement.
2. **Keep AICSS where it is and amend the requirement** to "the Reasoning surface is official AI
   Elements; the rest is AICSS (MIT, provenance recorded)". Cheapest, and the product's current
   visual identity is preserved.
3. **Middle path:** vendor `Message` + `Response` from AI Elements for the assistant body
   (`turn.tsx`) and `ChainOfThought` for the observable-activity rows, leaving AICSS for the orb,
   citations, code blocks and diffs.

This audit does not choose. It records what is true so the choice is made with the real shape of the
gap in view rather than an assumed one.

---

## Reproduce

```
grep -rn "from '.*\(ai-elements\|aicss\)/[^']*'" apps/web/src
grep -rn "thinking-reasoning" apps/web/src
sed -n '1160,1172p' packages/shared/src/index.ts
cat apps/web/src/components/ai-elements/NOTICE
cat apps/web/src/components/aicss/UPSTREAM.md
```
