# Golem — Art Direction Bible

**Cinematic marketing-site rebuild. Version 1.0 — 2026-08-30.**

Audience: the implementation team. This document is written so that no further art
decisions are required. Every value here is final unless a named owner overrides it in
writing. Where a decision is a judgment call, the rationale is stated so you can argue
with the reason rather than guess at the intent.

Verified against the live site (`https://golem.moshe-barami111.workers.dev`), the
repository (`apps/site/src/`, `apps/web/src/styles.css`), and the platform-support facts
listed in §3, all checked on 2026-08-30.

---

## 0. The controlling idea

> **The page is a build session.**

Not a features list with a 3D decoration on top. The visitor scrolls through one
complete Golem build — the ask, the plan, the work, the verification — and an animated
golem performs it beside them. Every claim on the page is demonstrated by the artifact
that would exist if the claim were true.

This resolves the owner's two constraints at once:

- **"MAXIMUM WOW"** — because a character that reacts to you, in a real-time lit 3D
  scene, on a scroll-directed timeline, is genuinely rare.
- **"still usable" / "NOT an experimental art project that hides what the product
  does"** — because the wow *is* the explanation. The spectacle and the product demo
  are the same object. There is no decorative layer to cut.

Three phrases to hold the whole team to:

1. **Carved, not glassy.** The material language is basalt with molten seams. Glass
   appears exactly three places (§7). Everything else is stone: bevelled, textured,
   opaque, lit from above.
2. **Demonstrate, never assert.** If a section contains an adjective that isn't attached
   to a working artifact, the section is not finished.
3. **One protagonist per beat.** Cinematic ≠ everything moving. It means one thing moves
   and the rest holds its breath.

---

## 1. What is wrong with the current site (and what must be preserved)

I read `apps/site/src/` in full and fetched the live page. The current site is
*competent* — sane semantics, a skip link, `prefers-reduced-motion` handling, no-JS
safety on reveals, real copy with a real voice. It is not slop. It is simply **flat**:
there is no depth, no character presence, no direction, and no proof.

### Preserve (these are assets, not debt)

| Asset | Where | Why keep it |
|---|---|---|
| The voice | `index.astro` copy | "Pick the smallest golem that can carry the job." "Ten thousand lines of existing Luau is a normal Tuesday." This writing is genuinely good. It is 40% of the brand. Do not let a redesign flatten it into SaaS-speak. |
| `Describe it. Golem builds it.` | hero H1 | Six words, a complete value proposition, a rhythm. Keep verbatim. |
| Clay / Stone / Rune | modes | A real, memorable, non-generic tier taxonomy tied to the character. Keep the names and the colour assignments. |
| Rune Amber `#FFB454` | tokens | The brand heart. Carried forward unchanged as `--ember-400`. |
| Arcane Violet `#7C5CFF` | tokens | Kept, but **demoted** from co-primary to a section accent (see §4). |
| Sora / Inter / JetBrains Mono | tokens | Kept. Upgraded from static instances to variable (§5). |
| `data-reveal` + `html.no-js` pattern | `Base.astro` | Correct no-JS safety architecture. Generalise it, don't replace it. |
| Native `<details>` FAQ | `FAQ.astro` | Free keyboard + AT behaviour. Do not rebuild this as a div. |

### Fix — defects confirmed in the repo

These are not opinions; each was verified.

1. **Contradictory credit count on the same page.**
   `apps/site/src/pages/index.astro:59` — `60 free Credits a day`.
   `apps/site/src/pages/index.astro:126` — `you get 80, free, every day`.
   `pricing.astro:47` and the FAQ both say **60**. The `80` is wrong. Beyond the typo,
   this must become a single exported constant consumed by every surface, because a
   pricing number that disagrees with itself is the single fastest way to lose a
   creator's trust.

2. **The Open Graph image is an SVG.** `Base.astro` sets
   `og:image` → `/og.svg`, and `public/og.svg` is the only image in `public/`. The major
   unfurlers (Facebook, X, LinkedIn, Slack, Discord) do not render SVG Open Graph
   images. Every share of this site currently produces a bare text card. Ship a
   **1200×630 PNG**.

3. **Canonical and OG URLs point at the wrong origin.**
   `astro.config.mjs` sets `site: 'https://golemworks.pages.dev'`; the live deployment is
   `golem.moshe-barami111.workers.dev`. `Base.astro` derives `canonical`, `og:url` and
   `og:image` from `Astro.site`, and `@astrojs/sitemap` derives the whole sitemap from it.
   All of them are currently wrong.

4. **The 3D hero is dead code.** `HeroVisual.astro` HEAD-probes
   `/assets/hero/golem.glb` before lazy-loading three.js. There is no `public/assets/`
   directory. The probe always 404s, the SVG fallback always renders, and every visitor
   pays for a wasted request. Ship the asset or delete the probe.

5. **Fonts are loaded as static instances.** `Base.astro` requests
   `Sora:wght@400;600;700;800`, `Inter:wght@400;500;600`,
   `JetBrains+Mono:wght@400;500`. Kinetic typography needs *variable ranges*. See §5 for
   the exact replacement URLs and the axes that actually exist.

6. **The grain overlay is architecturally expensive and will fight the WebGL.**
   `global.css` `.grain` is `position: fixed; inset: 0; z-index: 2147483000;
   mix-blend-mode: overlay`. That is a full-viewport blended compositing layer above
   *everything*, including the future canvas. It will desaturate the scene's highlights
   and costs a full-screen composite every frame. Replaced in §7.

7. **Reduced motion is honoured only via the OS media query.** There is no in-page
   control. Users who want calm motion but haven't set an OS preference — which is most
   of them — have no recourse. See the three-tier strategy in §8.

8. **No depth, no character presence, no direction.** The golem exists as a static SVG
   in a card; it never reacts, never looks at you, never does anything. The brand heart
   is currently a sticker. This is the actual problem the rebuild exists to solve.

---

## 2. Reference canon

Studied for *technique*, not to copy. Each entry names the specific transferable move.

| Reference | What to take | What to leave |
|---|---|---|
| **Lando Norris** (OFF+BRAND) — Awwwards **Site of the Year 2025** + Developer Award | Scroll as a directed camera: the page has *acts*, and the camera move between them is the transition. Also: restraint in the quiet sections, so the loud ones land. | Sports-hero scale and licensed footage; we have neither. |
| **Igloo Inc** (abeto) — Awwwards **Site of the Year 2024** | A single hero object that *is* the metaphor, revealed by descent, lit by HDRI rather than by lamps. Our golem is the iceberg. | Web3 void aesthetic; iridescence. We are opaque stone. |
| **Messenger** (abeto) — Site of the Year 2025 co-winner | Product-first cinema: the interface itself is the visual, shot cinematically. Directly applicable to Acts II–IV. | — |
| **Lusion v3** — SotY 2023 | Selective bloom discipline: only genuinely emissive surfaces bloom, at a high threshold. This is what separates "cinematic" from "everything is glowing." | Full-screen post stacks. |
| **Awwwards WebGL collection** generally | The 2026 house style has settled on *fewer, better-lit objects* rather than particle soup. Follow it. | Ambient page-wide dust. Banned in §11. |
| **Linear / Vercel** (product-marketing baseline) | Neutral foundation + one accent; typography does the work; motion is 200ms and invisible. This is the "still usable" half of the brief. | Their neutrals are cool-blue — the exact tone we are moving *away* from (§4). |

**The negative reference — what "generic glassmorphism AI slop" means concretely, so the
team can self-check:** a `#0B1120` navy ground; a violet→cyan gradient blob behind a
centred H1; a `backdrop-filter: blur(20px)` card with `rgba(255,255,255,0.05)` and a
white 10% border; a 12-column grid of feature cards each with a stroke icon in a rounded
square; ambient floating dots; `border-radius: 16px` everywhere. **Our current
site is two moves away from this** (the navy `#0B0E14`/`#121826` ramp and the
amber+violet pair). §4 moves us off it deliberately.

---

## 3. Platform reality — verified 2026-08-30

Load-bearing facts. Build decisions in §12 depend on them.

| Capability | Status | Consequence for us |
|---|---|---|
| **WebGL 2** | **Baseline: Widely available since 2024-03-20.** Chrome 56, Firefox 51, Safari 15, Edge 79. | **This is our render target.** Not a fallback — the target. |
| **WebGPU** | **Not Baseline.** Baseline availability *blocked by Firefox since January 2026*. Firefox stable does not support it. Safari 26 (2025-09-15) and Chromium do. | Do **not** ship `three/webgpu` as the primary path. It ships a larger bundle to buy a feature a whole browser can't use. Revisit when Firefox ships. |
| **CSS scroll-driven animations** (`animation-timeline: scroll()/view()`) | **Not Baseline.** Baseline availability *blocked by Firefox since September 2025*. Chrome/Edge 115 (2023-07), Safari 26 (2025-09-15). Firefox stable: not supported. | **Progressive enhancement only**, behind `@supports (animation-timeline: view())`. The authored baseline is IntersectionObserver + GSAP ScrollTrigger. |
| **Cross-document View Transitions** (`@view-transition`) | **Not Baseline** — MDN: "limited availability… does not work in some of the most widely-used browsers." Chromium only. | Use Astro's `<ClientRouter />` (same-document) which has a JS fallback everywhere. Put `view-transition-name: golem` on the character so it persists across routes where supported. |
| **Same-document View Transitions** | Chrome/Edge 111+, Firefox 133+, Safari 18+; `:active-view-transition` Baseline newly available 2026-01-13. | Safe to use for in-page state swaps. |
| **Core Web Vitals thresholds** | Unchanged: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**, at the 75th percentile over 28 days. INP is the most-failed vital in 2026. | Budgets in §13. We hold CLS to **0.05**, stricter than the bar. |
| **WCAG 2.5.8 Target Size (Minimum), AA** | ≥ **24×24 CSS px**, with offset/inline-text exceptions. Apple HIG suggests 44×44; Material 48×48. | Our floor is **44×44**. The 24px minimum is a legal floor, not a design target. |
| **WCAG 2.2.2 Pause, Stop, Hide (A)** | Applies to motion the *page* starts automatically. `prefers-reduced-motion` is **not** listed as a sufficient technique for 2.2.2. | Auto-starting loops (verb roller, marquee, ambient scene) need a real in-page control. §8 Tier C. |
| **WCAG 2.3.3 Animation from Interactions (AAA)** | Applies to motion the *user's interaction* starts. `prefers-reduced-motion: reduce` **is** a sufficient technique here. | Our scroll-scrubbed camera is covered by the media query; the ambient hum and idle loop are not. Hence Tier C. |

**Library versions confirmed on npm, 2026-08-30:**

| Package | Version | Note |
|---|---|---|
| `three` | **0.185.1** (r185) | Import tree-shaken from `three`, not `three/webgpu`. |
| `gsap` | **3.15.0** | License field: *"Standard 'no charge' license"*. Free for commercial use, all former Club plugins included (SplitText, MorphSVG, DrawSVG, ScrollTrigger), since Webflow's April 2025 change. No licence cost, no attribution burden. |
| `postprocessing` | **6.39.4** | Use its `EffectComposer` + `SelectiveBloomEffect`; it merges effects into one fragment pass, which is exactly the discipline §12 requires. |
| `lenis` | **1.3.26** | **Optional and gated.** Smooth-scroll hijacking is a real usability risk on trackpads and a real accessibility risk. Ship v1 without it. |

---

## 4. Colour

### 4.1 The move

The current foundation is a **cool navy** ramp (`#0B0E14` → `#121826` → `#1A2233` →
`#232D3F`) — blue-biased, and paired with amber + violet. That triad is the house style
of every AI SaaS site shipped since 2023. It is also *wrong for the brand*: the motif is
carved stone, and stone is not blue.

**The foundation becomes a warm-neutral basalt ramp.** Near-neutral, with a whisper of
warmth (R ≥ G ≥ B by 1–3 points at the dark end, neutralising toward the light end so
text never reads yellow). Two things follow:

1. It stops reading as "dark-mode SaaS" and starts reading as **material**.
2. Amber and verdant glow *harder* against a warm-neutral than against a navy, because
   the ground no longer competes for saturation. We get more heat for less pigment.

**Violet is demoted.** It stays in the palette — it is the Rune mode colour and the
`thinking` state colour, both of which are meaningful — but it stops being a co-primary
gradient partner to amber. The amber→violet gradient is retired from headlines and
buttons.

### 4.2 Basalt — the neutral foundation

The 14-step ramp. All contrast figures are against `--basalt-050`, the page ground.

| Token | Hex | Contrast vs ground | Use |
|---|---|---|---|
| `--basalt-000` | `#050505` | — | WebGL clear colour; the void behind the scene |
| `--basalt-050` | `#0A0A09` | — | **Page ground** (`body` background) |
| `--basalt-100` | `#0F0F0E` | — | Alternating section ground; nav glass tint base |
| `--basalt-150` | `#141413` | — | Sunken / inset wells (code panes, log tails) |
| `--basalt-200` | `#1A1A18` | — | **Surface** — card base |
| `--basalt-300` | `#222220` | — | Raised surface — chips, hovered cards |
| `--basalt-400` | `#2C2C29` | — | Strong hairline / active border |
| `--basalt-500` | `#3A3A36` | — | Default border on dark |
| `--basalt-600` | `#55554F` | — | Disabled foreground |
| `--basalt-700` | `#7A7A73` | **4.6 : 1** | Tertiary text — AA floor, use sparingly |
| `--basalt-800` | `#A3A39B` | **7.8 : 1** | **Muted / secondary text** — the workhorse |
| `--basalt-900` | `#CFCFC8` | 13.0 : 1 | Emphasised body |
| `--basalt-950` | `#EDEDE9` | **16.7 : 1** | **Primary text** |
| `--basalt-1000` | `#FBFBF9` | 18.4 : 1 | Headline maximum |

### 4.3 Ember — the brand accent

`--ember-400` is the existing `#FFB454`, unchanged. This is the golem's light.

| Token | Hex | Use |
|---|---|---|
| `--ember-100` | `#FFF0D6` | Text on ember-filled surfaces at small sizes |
| `--ember-200` | `#FFDFA8` | Hover-lightened links |
| `--ember-300` | `#FFC97D` | Gradient top-stop on the primary button |
| `--ember-400` | **`#FFB454`** | **Brand core.** Primary fill, seam colour, cursor dot |
| `--ember-500` | `#F59E2C` | Primary button gradient bottom-stop |
| `--ember-600` | `#D97F14` | Pressed state |
| `--ember-700` | `#A85D08` | Borders on ember-tinted surfaces |
| `--ember-950` | `#2A1B06` | **Text on ember fills** — 9.5 : 1 against `--ember-400` |

`--ember-400` on `--basalt-050` measures **9.6 : 1** — safe for body text, not only for
large display.

### 4.4 Section accents — the thermal arc

This is where "scroll-as-direction" becomes a *colour* decision and not just a camera
decision. The page runs a thermal narrative: the golem wakes cool, heats through the
work, flashes at the proof, then cools to calm authority.

Each section sets `--accent` on its root element. That single variable drives the
eyebrow, the section rule, the card top-rule, the WebGL rim-light colour, and the golem's
seam tint. **One variable, one temperature, whole-section coherence.**

| # | Section | Accent name | Hex | Contrast vs ground | Meaning |
|---|---|---|---|---|---|
| 0 | Hero — Awakening | Rune Amber | `#FFB454` | 9.6 : 1 | ignition |
| 1 | Act I — The Ask | Rune Amber (cooled) | `#FFB454` @ 70% | — | attention |
| 2 | Act II — The Plan | Arcane Violet | `#9B82FF` | **6.6 : 1** | cognition |
| 3 | Act III — The Build | Molten Orange | `#FF7A2F` | **7.6 : 1** | work |
| 4 | Act IV — The Proof | Verdant | `#3DD68C` | **10.5 : 1** | verification |
| 5 | Modes | tri-colour (below) | — | — | taxonomy |
| 6 | Trust | Cold Iron | `#7FA8C9` | **7.9 : 1** | calm authority |
| 7 | Pricing / Credits | Rune Amber | `#FFB454` | 9.6 : 1 | energy |
| 8 | FAQ | none — neutral | — | — | plainness |
| 9 | Act V — Invitation | Molten Orange | `#FF7A2F` | 7.6 : 1 | full heat |

**Critical:** `--violet-500` `#7C5CFF` (the existing brand violet) measures **4.55 : 1**
against the ground — it scrapes past AA for normal text with nothing to spare, and fails
at any reduced opacity. Therefore:

> `--violet-500` `#7C5CFF` is a **glow, stroke and fill** colour only.
> Violet **text** always uses `--violet-400` `#9B82FF` (6.6 : 1).

Full violet ramp: `--violet-300` `#B9A6FF`, `--violet-400` `#9B82FF`,
`--violet-500` `#7C5CFF`, `--violet-600` `#6244E0`, `--violet-700` `#4A31B0`.

### 4.5 Mode colours

Carried from the existing identity, with Stone lightened for contrast headroom.

| Mode | Token | Hex | Contrast | Change |
|---|---|---|---|---|
| Clay | `--mode-clay` | `#E2A16F` | 9.0 : 1 | unchanged |
| Stone | `--mode-stone` | `#A8B4C4` | 9.4 : 1 | lightened from `#9AA7B8` |
| Rune | `--mode-rune` | `#9B82FF` | 6.6 : 1 | uses `--violet-400`, not `-500`, for text |

### 4.6 Semantic

| Token | Hex | Contrast | Note |
|---|---|---|---|
| `--success` | `#3DD68C` | 10.5 : 1 | up from `#34D399` |
| `--warn` | `#FFB454` | 9.6 : 1 | reuses ember — warnings are the same energy as credits |
| `--danger` | `#FF6B6B` | 7.1 : 1 | up from `#F87171` |
| `--info` | `#7FA8C9` | 7.9 : 1 | Cold Iron |

Tint fills (backgrounds for state surfaces) are always
`color-mix(in oklab, var(--X) 12%, transparent)`, borders always
`color-mix(in oklab, var(--X) 34%, transparent)`. Use `oklab`, not `srgb` — sRGB mixing
of saturated colours toward transparent produces muddy midpoints.

### 4.7 Theme policy — dark only, committed

**The marketing site ships dark-only.** This is a deliberate art-direction decision, not
an omission:

- A light-theme WebGL scene is a *second complete lighting pass* — new HDRI, new
  material response, new bloom threshold, new shadow treatment. It is a whole second
  art direction, and half-doing it is worse than not doing it.
- A cinematic, character-led, emissive-seam identity is legible in dark and mushy in
  light. Committing is the higher-quality choice.

Ship `<meta name="color-scheme" content="dark">` and `color-scheme: dark` on `:root` so
browser-painted UI (scrollbars, form controls, the overscroll gutter) matches.
`body` must carry an explicit `background: var(--basalt-050)` — never transparent.

**The app (`apps/web`) keeps its light theme.** Do not propagate this decision there.

---

## 5. Typography

### 5.1 The three voices

| Voice | Face | Role |
|---|---|---|
| **Display** | Sora | Headlines, section titles, buttons, card titles. The carved voice. |
| **Body** | Inter | All running prose, UI labels, lists. The readable voice. |
| **System** | JetBrains Mono | Eyebrows, credit counts, tool names, timestamps, code, diffs, the rotating verb. **The rune-inscription voice** — machine-carved, not human-written. |

No fourth face. A serif counterpoint was considered and rejected: high-contrast serifs
read "editorial magazine," which fights "carved rune." The mono *is* the counterpoint,
and it is already native to the brand.

### 5.2 Variable axes — verified, and they constrain the design

Checked against the Google Fonts CSS2 API on 2026-08-30 (an unsupported axis returns
HTTP 400; each of these returned 200):

| Face | Axes that exist | Axes that do **not** |
|---|---|---|
| **Inter** (v20) | `wght` **100–900**, `opsz` **14–32**, `ital` | — |
| **Sora** (v17) | `wght` **100–800** | **`wdth` — 400 Bad Request.** No width axis. |
| **JetBrains Mono** (v24) | `wght` **100–800**, `ital` | — |

> **Load-bearing constraint:** Sora has **no width axis**. Kinetic typography on
> headlines must be driven by `wght` + `transform` + `clip-path`. Any brief or reference
> that calls for a headline stretching horizontally on scroll is not buildable with this
> typeface. Do not attempt it with `transform: scaleX()` — it destroys the stroke
> contrast and looks broken.

**Replace the font link in `Base.astro` with:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@100..800&family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@100..800&display=swap">
```

Set `font-optical-sizing: auto` globally so Inter's `opsz` tracks rendered size
automatically. Do not set `opsz` manually except where body font is used at display
scale.

**Self-hosting is preferred for production** (removes a third-party origin from the
critical path and lets you subset). Subset to `latin` + the punctuation actually used;
this typically removes 60–80% of the file. Budget: **≤ 48 KB gzip per family.**

**Zero-CLS font loading.** Declare metric-matched fallbacks so the swap doesn't shift:

```css
@font-face {
  font-family: 'Sora Fallback';
  src: local('Arial');
  size-adjust: 104%;
  ascent-override: 96%;
  descent-override: 24%;
  line-gap-override: 0%;
}
```

Then `font-family: 'Sora', 'Sora Fallback', system-ui, sans-serif`. Tune the four
override values against the real face before shipping; the numbers above are a starting
point, not a measurement.

### 5.3 The scale

Base body is **17px**, up from the current 16px. Marketing prose at 17–18px reads
materially more premium and is measurably easier at arm's length.

**Display — Sora**

| Token | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| `--t-display-1` | `clamp(3.25rem, 1.6rem + 6.4vw, 7.5rem)` → 52→120px | 700 | **0.94** | **−0.035em** | Hero H1, final CTA H2 |
| `--t-display-2` | `clamp(2.25rem, 1.4rem + 3.4vw, 4rem)` → 36→64px | 700 | **1.02** | **−0.028em** | Section H2 |
| `--t-display-3` | `clamp(1.625rem, 1.2rem + 1.8vw, 2.5rem)` → 26→40px | 600 | **1.10** | **−0.022em** | Sub-section H3, big stat |
| `--t-heading-1` | `1.375rem` / 22px | 600 | 1.25 | −0.015em | Card title |
| `--t-heading-2` | `1.125rem` / 18px | 600 | 1.35 | −0.010em | Sub-head, list heading |
| `--t-button` | `0.9375rem` / 15px | 600 | 1.0 | −0.005em | All buttons |

Negative tracking is non-negotiable at display sizes. Sora at 120px with default tracking
reads loose and amateur; at −0.035em it reads carved. The tracking scales *inversely*
with size — that is why each step has its own value rather than one global rule.

**Body — Inter**

| Token | Size | Weight | Line-height | Letter-spacing | `opsz` |
|---|---|---|---|---|---|
| `--t-lede` | `clamp(1.125rem, 1rem + 0.5vw, 1.375rem)` → 18→22px | 400 | 1.50 | −0.011em | auto |
| `--t-body` | `1.0625rem` / 17px | 400 | **1.60** | −0.006em | auto |
| `--t-body-sm` | `0.9375rem` / 15px | 400 | 1.55 | 0 | auto |
| `--t-caption` | `0.8125rem` / 13px | 500 | 1.45 | +0.005em | auto |

**System — JetBrains Mono**

| Token | Size | Weight | Line-height | Letter-spacing | Notes |
|---|---|---|---|---|---|
| `--t-eyebrow` | `0.75rem` / 12px | 600 | 1.0 | **+0.22em** | `text-transform: uppercase` |
| `--t-mono` | `0.8125rem` / 13px | 400 | 1.60 | 0 | code, logs, tool chips |
| `--t-mono-num` | inherits | 500 | 1.0 | −0.02em | **`font-variant-numeric: tabular-nums`** — mandatory on every animating number |

**Measure limits.** Prose is capped at **62ch**; display headlines at **18ch** so H1
breaks to 2–3 lines rather than one wall-spanning line. Set these with `max-width` in
`ch`, not px.

**Wrapping.** `text-wrap: balance` on all headings; `text-wrap: pretty` on paragraphs
(progressive — ignored where unsupported, no fallback needed).

### 5.4 Kinetic typography — the exhaustive list

**Rule: kinetic type appears at most six times on the page and never inside body copy.**
Restraint is the entire difference between "cinematic" and "slop." Here is the complete
sanctioned list. There is no seventh.

1. **Hero H1 — carve-in.** Per-character reveal. Each glyph in an
   `overflow: hidden` span, `transform: translateY(105%) → 0`, plus
   `font-variation-settings: 'wght' 300 → 700`. Stagger **18ms/char**, duration
   **720ms**, easing `--ease-carve`. Split at **build time** in an Astro component — not
   with SplitText at runtime — so there is zero CLS and zero JS on the critical path.
2. **Hero verb roller.** `it writes the Luau ▸ wires the instances ▸ presses Play`. Mono,
   vertical clip-roll, **2.4 s dwell**, **420ms** transition, `--ease-chisel`.
   Auto-starting → needs the §8 Tier C control (WCAG 2.2.2).
3. **Section H2s — two-line clip reveal.** Whole lines, not characters. `clip-path:
   inset(100% 0 0 0) → inset(0)`, **560ms**, `--ease-carve`, 90ms stagger between lines.
   Per-character reveals on every H2 is the classic overuse failure.
4. **Credit counter (Pricing).** Digit roll on slider change. `--t-mono-num` with
   `tabular-nums`. Each digit column translates; **240ms**, `--ease-settle`.
5. **Proof counters (Act IV).** Count-up on entry. **900ms**, `--ease-molten`,
   `tabular-nums`. Under reduced motion: snap to final value, no count.
6. **Scroll-velocity weight on the wordmark.** The nav wordmark's `wght` lerps
   600 → 750 mapped from scroll velocity, clamped, smoothed at 0.12/frame. Desktop only,
   and gated on `document.fonts.check('1em Sora')` so it never fires against the
   fallback face. Deliberately barely perceptible — it registers as *quality*, not as an
   effect.

---

## 6. Space, grid and radii

### 6.1 Spacing scale

4px base. Use only these values. A spacing value not on this list is a bug.

| Token | px | Token | px |
|---|---|---|---|
| `--sp-1` | 4 | `--sp-8` | 40 |
| `--sp-2` | 8 | `--sp-9` | 48 |
| `--sp-3` | 12 | `--sp-10` | 64 |
| `--sp-4` | 16 | `--sp-11` | 80 |
| `--sp-5` | 20 | `--sp-12` | 96 |
| `--sp-6` | 24 | `--sp-13` | 128 |
| `--sp-7` | 32 | `--sp-14` | 160 |
| | | `--sp-15` | 192 |

### 6.2 Grid

- **Columns:** 12.
- **Max content width:** `--content: 1280px` (up from the current 1120px — the extra
  width is what lets the hero go cinematic rather than centred-and-cosy).
- **Prose column inside that:** `--content-prose: 720px`.
- **Page margin:** `clamp(20px, 5vw, 80px)`.
- **Gutter:** 24px ≥1024px; 16px below.
- **Wrap utility:** `width: min(var(--content), 100% - 2 * clamp(20px, 5vw, 80px)); margin-inline: auto;`

### 6.3 Section rhythm

| Kind | Block padding |
|---|---|
| Standard section | `clamp(96px, 12vh, 176px)` |
| Act break (I–V) | `clamp(128px, 18vh, 240px)` |
| Strip (trust, privacy) | `clamp(48px, 6vh, 72px)` |
| Hero | `clamp(72px, 9vh, 128px)` top; height capped at **`min(88svh, 860px)`** |

> The hero cap is deliberate. A 100vh hero hides the fact that a page exists below it.
> Capping at 88svh guarantees the next section's top edge is always visible — the
> single cheapest usability win on a cinematic page. Use `svh`, never `vh`.

### 6.4 Radii

| Token | px | Use |
|---|---|---|
| `--r-xs` | 4 | inline tags, code spans |
| `--r-sm` | 8 | buttons, inputs |
| `--r-md` | 12 | chips, small cards, tool pills |
| `--r-lg` | 18 | cards, panels |
| `--r-xl` | 28 | hero panels, media frames, the demo player |
| `--r-full` | 999 | pills, cursor ring, avatars |

**Nesting law:** an inner radius = outer radius − padding. An 18px card with 12px padding
holds 6px children. Concentric radii are one of the few details that separate
professional work from competent work.

---

## 7. Materials — elevation, stone, glass, grain

### 7.1 The stone bevel — the signature surface

This, not glass, is the site's default panel. It is what makes a card read as *carved*.

```css
.stone {
  background:
    linear-gradient(180deg, var(--basalt-300) 0%, var(--basalt-200) 42%, var(--basalt-150) 100%);
  border: 1px solid var(--basalt-500);
  border-radius: var(--r-lg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),   /* top light catch */
    inset 0 -1px 0 rgba(0, 0, 0, 0.55),          /* bottom shade   */
    var(--e2);
  background-image: var(--grain-tile);           /* §7.4 */
  background-blend-mode: overlay;
}
```

The molten seam variant (`.stone--seam`) adds a 1px top rule in the section accent:

```css
.stone--seam::before {
  content: '';
  position: absolute; inset-inline: 18%; top: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: .85;
}
```

### 7.2 Elevation

Dark-mode shadows must be **near-black plus a rim light**, never diffuse grey — grey
shadows on a dark ground read as fog.

| Token | Value |
|---|---|
| `--e0` | `none` (border only) |
| `--e1` | `0 1px 2px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04)` |
| `--e2` | `0 4px 12px -2px rgba(0,0,0,.6), 0 12px 32px -8px rgba(0,0,0,.5)` |
| `--e3` | `0 8px 24px -4px rgba(0,0,0,.65), 0 28px 64px -16px rgba(0,0,0,.55)` |
| `--e4` | `0 16px 40px -8px rgba(0,0,0,.7), 0 48px 120px -24px rgba(0,0,0,.6)` |

**Glow tokens — at most one glow per element, ever:**

| Token | Value |
|---|---|
| `--glow-ember` | `0 0 0 1px rgba(255,180,84,.22), 0 0 24px -4px rgba(255,180,84,.45), 0 0 72px -12px rgba(255,180,84,.20)` |
| `--glow-violet` | `0 0 0 1px rgba(155,130,255,.22), 0 0 24px -4px rgba(124,92,255,.42), 0 0 72px -12px rgba(124,92,255,.18)` |
| `--glow-verdant` | `0 0 0 1px rgba(61,214,140,.22), 0 0 24px -4px rgba(61,214,140,.42), 0 0 72px -12px rgba(61,214,140,.18)` |
| `--glow-accent` | same shape, using `var(--accent)` via `color-mix` |

### 7.3 Glass — exactly three places

> **Glass is for things genuinely floating above moving content. Nothing else.**
> A static card behind glass is the definitive tell of generic glassmorphism. If the
> thing behind it isn't moving, it's stone.

The three sanctioned uses: **(1)** the sticky nav, **(2)** HUD chips overlaid on the
WebGL canvas, **(3)** the mobile nav sheet.

```css
/* 1. Nav — frosted metal, not frosted plastic */
--glass-nav-backdrop: blur(14px) saturate(140%) brightness(0.72);
--glass-nav-bg:       color-mix(in oklab, var(--basalt-100) 62%, transparent);
--glass-nav-border:   1px solid rgba(255, 255, 255, 0.06);
--glass-nav-shadow:   inset 0 1px 0 rgba(255,255,255,.07), 0 1px 0 rgba(0,0,0,.5);

/* 2. HUD chip over the canvas */
--glass-hud-backdrop: blur(24px) saturate(120%) contrast(1.06);
--glass-hud-bg:       rgba(14, 14, 13, 0.55);
--glass-hud-border:   1px solid rgba(255, 255, 255, 0.07);

/* 3. Mobile sheet */
--glass-sheet-backdrop: blur(32px) saturate(130%) brightness(0.6);
--glass-sheet-bg:       rgba(10, 10, 9, 0.72);
```

The `brightness()` term is what makes it metal instead of plastic — it darkens rather
than milkily lightening what's behind. `saturate(140%)` recovers the chroma that blur
destroys. The `inset 0 1px 0` top highlight is the machined edge.

**Mandatory fallbacks:**

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--basalt-100); backdrop-filter: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--basalt-100); backdrop-filter: none; }
}
```

**Performance rules, non-negotiable:**
- **Maximum two `backdrop-filter` layers composited simultaneously.**
- Never on an element that animates its own width, height or `border-radius` — that
  forces a re-blur every frame.
- Never over the WebGL canvas below 1024px. Mobile gets the opaque variant.

### 7.4 Grain

Replaces the current fullscreen `mix-blend-mode: overlay` layer (defect #6 in §1). Three
scoped applications instead of one global one:

1. **In the shader.** The hero grain lives in the WebGL composite pass as animated
   fragment noise at `0.035` amplitude. Free, correctly lit, and it moves with the scene
   instead of over it.
2. **On stone surfaces.** A 128×128 tiling PNG at 4% baked-in opacity, applied as
   `background-image` with `background-blend-mode: overlay` on `.stone` only. Scoped to
   elements, no fullscreen layer, no stacking-context poisoning.
3. **Nowhere else.** No grain over text, over the nav, or over the whole viewport.

---

## 8. Motion

### 8.1 Easings

| Token | `cubic-bezier` | Character | Use |
|---|---|---|---|
| `--ease-carve` | `cubic-bezier(0.16, 1, 0.3, 1)` | fast out, long settle | **The signature.** Reveals, entrances, panel opens |
| `--ease-chisel` | `cubic-bezier(0.65, 0, 0.35, 1)` | symmetric | State morphs, layout changes, colour changes |
| `--ease-strike` | `cubic-bezier(0.22, 1.2, 0.36, 1)` | slight overshoot | Golem reactions, button release, success pops |
| `--ease-settle` | `cubic-bezier(0.33, 1, 0.68, 1)` | cubic out | Default for hovers and small transitions |
| `--ease-molten` | `cubic-bezier(0.4, 0, 0.2, 1)` | standard | Long ambient loops, scrubbed timelines |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | accelerate away | Dismissals, exits |
| `--ease-linear` | `linear` | — | **Only** continuous loops: rotation, marquee, shader time |

Overshoot on `--ease-strike` is capped at **1.2**. Higher values read cartoonish and
break the "premium" half of the brief.

### 8.2 Durations

| Token | ms | Use |
|---|---|---|
| `--dur-1` | 90 | Micro: colour/opacity on small targets |
| `--dur-2` | 140 | Control feedback: button background, icon swap |
| `--dur-3` | 220 | **Standard UI**: card hover, tooltip, chip |
| `--dur-4` | 320 | Panel/menu open, tab switch, golem pose cross-fade |
| `--dur-5` | 480 | Section element reveal |
| `--dur-6` | 720 | Hero reveal, headline carve-in, canvas fade-in |
| `--dur-7` | 1100 | Act transition, camera move, `waking` |
| `--dur-8` | 1800 | Full scene beat (WebGL timeline only) |

### 8.3 Choreography law

These nine rules are what make the page feel *directed* rather than *animated*. They are
reviewable in code review.

1. **One protagonist per beat.** In any 400 ms window, exactly one element may travel
   more than 24px or change more than 15% in scale or opacity. Everything else supports.
2. **Stagger law.** Child stagger = `clamp(28ms, 340ms / n, 90ms)` where *n* is the child
   count. A fixed 100ms on a 12-item list takes 1.2 s and feels broken; this formula
   keeps every group's total reveal near 340 ms regardless of length.
3. **Distance law.** Travel distance ≈ `duration(ms) / 9`, capped at 64px. A 480 ms
   reveal travels ~53px; a 220 ms hover travels ~24px. Distance and duration must agree
   or the motion reads as the wrong weight.
4. **Direction law.** Entrances arrive *from* the direction of narrative flow. Content
   below the fold rises (+Y). Horizontally-revealed content comes from the scroll
   direction. **The golem always enters from the reader's left** — it moves with the
   reading direction, never against it.
5. **Exit is 0.6 × entry**, always with `--ease-exit`. Things leave faster than they
   arrive; the reverse feels sticky.
6. **Never two easings on one element.** If opacity and transform animate together, they
   share an easing and a duration.
7. **Scrubbed vs. triggered.** Scroll-bound motion is *scrubbed* — position-mapped, no
   duration, and **must be exactly reversible**. Scrolling up must un-play it frame for
   frame. Event-bound motion is *triggered* — has a duration, plays once. Never scrub a
   triggered animation or trigger a scrubbed one.
8. **Hover budget.** Hover completes within `--dur-3` (220 ms) and moves the target by no
   more than **4px**. Larger hover displacement makes the pointer fall off the target —
   a real WCAG 2.5.8 stability problem, not just a feel problem.
9. **Motion never blocks reading.** Layout space is reserved before any reveal; only
   `opacity` and `transform` animate. Nothing reflows. This is also how CLS stays ≤ 0.05.

### 8.4 Reduced motion — three tiers

Binary `prefers-reduced-motion` handling is insufficient here (see §3: it is not a
sufficient technique for WCAG 2.2.2, which our auto-starting loops trigger).

**Architecture:** all motion CSS is gated on `:root[data-motion="…"]`, **not** directly
on the media query. The media query only *seeds* the initial value. This means the
in-page control can win in both directions — a user who wants full motion despite an OS
setting gets it, and vice versa.

```js
const stored = localStorage.getItem('golem.motion');
const seed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'calm' : 'full';
document.documentElement.dataset.motion = stored ?? seed;
```

Run this **inline in `<head>`, before first paint**, alongside the existing `no-js` class
removal, to avoid a flash of the wrong motion mode.

**Tier A — `data-motion="calm"`** (seeded by `prefers-reduced-motion: reduce`)

| Subsystem | Behaviour |
|---|---|
| Scroll-scrubbed camera | Cuts to each section's end state. No interpolation. |
| Entrance transforms | Opacity-only cross-fade at `--dur-3`. No translation. |
| Golem state machine | **Still runs.** Poses snap at 0 ms with a 120 ms opacity cross-fade. It still communicates state; it just doesn't travel. |
| WebGL | Keeps rendering, but `setAnimationLoop` → **render-on-demand**: one frame per scroll settle, one per state change. `uTime` frozen. No parallax, no idle breath. |
| Custom cursor | Disabled. Native cursor restored. |
| Particles | Count → 0. |
| Auto-looping content (verb roller, marquee) | **Stops.** Shows the first item plus a "next" control. This is what satisfies WCAG 2.2.2. |
| Kinetic type | Counters snap to final; carve-ins become fades. |
| Sound | Unchanged (already off by default); the `hum` ambient loop is disabled even when sound is on. |

**Tier B — `prefers-reduced-transparency: reduce`** — independent of motion tier. Glass →
opaque `--basalt-100`. Grain → off.

**Tier C — the in-page control.** A three-state segmented control,
`Motion: Full · Calm · Off`, placed in the footer and in the nav overflow menu. 44×44
targets, `role="radiogroup"`, persisted to `localStorage`. `Off` additionally: unmounts
the WebGL canvas entirely (rung 4, §12.4), disables the cursor, freezes every loop.

---

## 9. The Golem

The brand heart. Currently a static sticker. This section makes it a character.

### 9.1 Build decision — hybrid, one source of truth

| Surface | Implementation | Why |
|---|---|---|
| **Hero + Acts I–V (desktop)** | **Real-time 3D**, three.js r185, WebGL2 | The product builds 3D worlds. A 3D golem *is* the proof. Lighting, parallax and material response are not reproducible in SVG. |
| **Mode cards, empty states, error states, favicon, the app** | **SVG rig** | 8–14 KB, crisp at any size, server-rendered by Astro, works with zero JS, themeable, and free under reduced motion. |
| **Mobile hero** | Pre-rendered video loop (§12.3) | Same cinema at 1/20th the cost. |

**Non-negotiable:** these are **the same character**, not two characters that resemble
each other. The pipeline is one-directional:

```
Blender: one low-poly golem  →  glTF (hero, real-time)
                             →  orthographic ¾ render  →  hand-traced 9-slab SVG rig
                             →  pose JSON (shared by BOTH renderers)
```

The pose data is a single JSON file of 15 transforms per state. The 3D renderer applies
them as `Object3D` transforms; the SVG rig applies the *same numbers* as 2D projections.
When a pose is retuned, both update. This is the mechanism that keeps them one character.

### 9.2 Anatomy and rig

**Geometry: ≤ 9,000 triangles total.** Nine body slabs — head, jaw slab, chest, abdomen,
2 shoulder pauldrons, 2 forearms, pelvis block — plus **six free-floating shards** that
orbit. Plus a plinth of scattered rubble (`InstancedMesh`, 24 chunks × ~200 tris).

**There are no legs and no skeleton.** The golem is a levitating torso-and-head colossus
above a rubble plinth. This is a deliberate design decision that pays three times:

1. It removes the single hardest animation problem on the web (a convincing biped walk
   cycle) from the project entirely.
2. It reads as *more* magical, not less — a levitating stone colossus is a stronger image
   than a walking one.
3. **No skeleton means no skinning**, which means every slab is posed by a direct
   transform, which means poses are trivially LERP-able, exportable as plain JSON, and
   reusable by the SVG rig.

**Materials.** One `MeshStandardMaterial` shared across all slabs:

| Channel | Spec |
|---|---|
| Base colour | `#17171B` with `#2A2724` vertex-colour variation for carving depth |
| ORM (AO / Roughness / Metalness packed RGB) | 1024², one texture |
| Normal | 1024² |
| Emissive mask | 512², greyscale — defines where seams and runes live |
| Roughness | 0.72 base, 0.35–0.90 via map. Weathered stone. **No plastic sheen.** |
| Metalness | **0.0.** Stone is not metal. The seams glow via emissive, not via specular. |

Target **≤ 12 draw calls for the golem**; use `InstancedMesh` wherever slabs share
geometry.

**The one uniform that carries the whole performance:**

```glsl
uniform float uSeamHeat;   // 0.0 → 6.0
```

`uSeamHeat` drives emissive intensity and a colour ramp `basalt → ember → white-hot`. It
is the character's entire emotional range in a single float — which means it can be
driven by scroll position, by state, and by hover simultaneously, cheaply, and it always
composites correctly. Supporting uniforms: `uRunePhase` (scrolls flow along seam UVs),
`uEyeOpen` (0–1, blinks), `uEyeAim` (vec2), `uSeamTint` (vec3, set from `--accent`).

**The eyes are the highest-value interaction on the page.** Two emissive quads. `uEyeAim`
tracks the pointer, damped by a spring (stiffness 90, damping 18), **clamped to ±16°** so
it never looks unhinged. A character that watches you is worth more than any particle
system.

**Lighting — three lights and a baked environment. No shadow maps.**

| Light | Spec |
|---|---|
| Key | Directional, ember-tinted `#FFD9A8`, intensity 3.2, from upper-left (−0.6, 0.9, 0.5) |
| Rim | Directional, violet `#7C5CFF`, intensity 1.4, from behind-right (0.8, 0.2, −0.7). **Retinted to `--accent` per section.** |
| Fill | Hemisphere, sky `#1A1A18` / ground `#050505`, intensity 0.35 |
| Environment | **Pre-baked 256×128 RGBE HDR, ≤ 24 KB**, authored for this scene. Not a downloaded studio HDRI. |
| Contact shadow | **Baked alpha texture on a single plane.** Real-time shadow maps are the #1 avoidable GPU cost here and would buy almost nothing on a levitating character. |

### 9.3 State machine

Eleven states. Each is a pose array + uniform targets. Transitions cross-fade the pose
arrays over **320 ms `--ease-chisel`**, except `success` / `error`, which use
`--ease-strike` at their own durations.

| State | Trigger | Pose | `uSeamHeat` | `uEyeOpen` | Eye colour | Timing |
|---|---|---|---|---|---|---|
| `dormant` | page load, before hero in view | slabs settled, head bowed 12°, shards docked | 0.05 | 0.15 | — | static |
| `waking` | hero enters viewport (once) | head rises to 0°, shards unlock and drift to orbit r=1.4 | 0.05 → **1.0** | 0.15 → 1.0 | ember | one-shot **1100 ms**, `--ease-carve` |
| `idle` | default rest | breath: chest scale 1.0↔1.012; head bob ±0.8°; shard orbit 0.06 rad/s | 0.85 ± 0.08 @ 0.22 Hz | 1.0, blink every **5.5–9 s** randomised | ember | loop |
| `greeting` | pointer enters hero; tab regains focus | head tilts 6° toward pointer; near shoulder shard flicks +0.15u and returns | pulse → 1.25 over 260 ms | 1.15 for 200 ms | ember | one-shot **620 ms**, 4 s cooldown |
| `listening` | prompt field focused / user typing | head forward 4°; shards pull in to r=1.1; orbit slows to 0.02 rad/s | **0.7** — dims. It is paying attention, not working. | 1.0, blink suppressed | ember | loop while focused |
| `thinking` | Act II (plan) beat | shards orbit fast (0.9 rad/s) and rise into a ring above the head; body still | 0.6, colour lerps ember → violet over 400 ms | 0.6 (narrowed) | **violet** | loop, min 1200 ms |
| `building` | Act III (build) beat | torso rotates 8° to a working angle; forearm slabs strike downward on a **640 ms** cycle | 1.6, spiking to **2.4** on each strike | 1.0 | **molten orange** | loop |
| `verifying` | Act IV (proof) beat | body holds perfectly still; a single scan-line sweeps the seams bottom → top | 1.2, seam colour lerps to verdant along the sweep | 1.0 | verdant | **900 ms**, repeatable |
| `success` | proof lands; CTA hover; form success | all slabs expand 0.06u then snap back; every seam flashes | 0.9 → **4.5** in 180 ms → 1.0 over 700 ms | 1.2 → 1.0 | verdant | one-shot **880 ms**, `--ease-strike` |
| `error` | form error; demo failure beat; WebGL init failure | head tilts 9°; one shoulder shard **drops out of orbit and hangs** | 0.9 → **0.35** over 300 ms, colour → danger | 0.45 (squint) | danger `#FF6B6B` | 500 ms, hold 2 s, → `idle` |
| `sleeping` | tab hidden > 3 s; `data-motion="off"` | settles to dormant; orbit stops | 0.05 | 0.0 | — | static, **renderer paused** |

**Transition rules:**

- `uSeamHeat` and eye colour transition **independently** of pose, over 400 ms
  `--ease-molten`. Heat lags pose slightly. This lag is what sells *material with thermal
  mass* rather than a colour swap.
- **Illegal transitions** (assert in dev): `dormant → building` (must pass through
  `waking` then `idle`); `error → success` without ≥ 600 ms of intervening `idle`.
- The machine exposes `golem.setState(name, { force })` and dispatches
  `golemstatechange` on `window`, so the WebGL instance and every SVG instance stay in
  sync from one source. The Rune mode card's SVG, for example, enters `thinking` on
  hover by listening to the same event bus.

### 9.4 Per-section reaction map

| Section | Golem state | Camera |
|---|---|---|
| Hero | `waking` → `idle`; `greeting` on pointer; eye-aim live | dolly z 7.2 → 5.4 across hero scroll |
| Act I — The Ask | `listening` | yaw −14°; golem shifts to the right third |
| Act II — The Plan | `thinking` | push in on the head, z 4.1, shallow DOF |
| Act III — The Build | `building` | pull back to z 6.8, pitch +9° (looking down at the work) |
| Act IV — The Proof | `verifying` → `success` | slow rise, z 6.0, level |
| Modes | SVG rigs only; WebGL golem parked `idle` off-canvas | — |
| Trust | `idle`, `uSeamHeat` floored to **0.5** (calm), particles off | static |
| Pricing | `idle`; `uSeamHeat` maps to the credits slider value | static |
| Final CTA | `greeting` on approach; `success` on CTA hover | z 4.8, centred, full frame |
| Footer | `sleeping`; scene unmounted below the footer boundary | — |

---

## 10. Cursor

### 10.1 Rules before pixels

These three rules are the difference between a great custom cursor and an accessibility
incident.

1. **The native cursor is never globally hidden.** `cursor: none` applies **only** inside
   `[data-cursor-zone]` — the hero canvas and the demo player. Never on the document,
   never on text, never on form fields.
2. **Disabled entirely** when any of: `pointer: coarse`; `prefers-reduced-motion: reduce`;
   `data-motion` ≠ `full`; or the user is keyboard-navigating (the first `Tab` press
   restores the native cursor and hides the custom one until the next `mousemove`).
3. **The cursor never replaces a hit target.** Every layer is `pointer-events: none`, so
   hit-testing is untouched. Real targets stay **≥ 44×44 CSS px** (WCAG 2.5.8 requires
   ≥ 24×24; 44 is the comfortable floor).

### 10.2 Composition — three layers

| Layer | Size | Style | Follow |
|---|---|---|---|
| **Dot** | 6px | `--ember-400`, `--r-full` | **lerp 1.0 — zero lag.** Zero lag on the dot is what stops the whole system feeling laggy. |
| **Ring** | 34px | 1px border `rgba(255,255,255,.28)`, `backdrop-filter: blur(2px)` | **lerp 0.16/frame** (~160 ms settle). This is the weight. |
| **Trail** | 2-segment ember streak | `opacity = clamp((v − 0.35) / 2.2, 0, 0.5)` where *v* = px/ms | Invisible below 0.35 px/ms. Off at rung 3+. |

Implementation: one `position: fixed; top:0; left:0; pointer-events:none; z-index:9000;
will-change: transform` element per layer, driven by `transform: translate3d()` from
**one shared rAF loop** — the same loop as the scene. Never `left`/`top`. Never a
separate rAF per layer.

### 10.3 States

| Context | Dot | Ring | Extra |
|---|---|---|---|
| Default | 6px ember | 34px, 1px white 28% | — |
| Over link / button | 4px, opacity .6 | **Magnetises**: snaps to the target's bounding box, morphs to its `border-radius`, scales to bbox + 8px, lerp 0.22 | The target translates toward the pointer by `(pointer − centre) × 0.14`, capped **6px** (rule 8, §8.3) |
| Over the hero canvas | hidden | 56px, border ember 40% | HUD chip appears: "drag to orbit" |
| Over the demo player | 6px | 48px with a play/pause glyph | — |
| Over a slider / draggable | — | stretches to 64×28 with a ↔ glyph | — |
| **Over selectable text** | 2px | → 0 | **Native I-beam restored.** Reading must never fight the cursor. |
| Pressed | 10px | scale 0.88 | 90 ms `--ease-settle` |
| Golem in `building` | emits 1 credit per 120px travelled, max 8 live | — | desktop only |

Do **not** use `mix-blend-mode: difference` on the ring over the 3D scene. It is the
default choice and it looks cheap over lit geometry — it inverts the golem's ember
highlights into sickly blue. Use an ember tint instead.

---

## 11. Particles

> **Particles exist to explain a state change. Never to fill space.**

Four sanctioned emitters. There is no fifth.

| # | Emitter | When | Spec |
|---|---|---|---|
| 1 | **Forge credits** | `building` state, at each strike | GPU points, additive, ember. Emitted from the forearm slab. Max **400** live (rung 1), **0** at rung 3+. Lifetime 900–1600 ms, gravity +0.6, 38° velocity cone. |
| 2 | **Rune motes** | `thinking` state only | 60 slow-drifting violet motes bound to a 2.2u sphere around the head. Dissolve within 400 ms of leaving the state. |
| 3 | **Success burst** | `success` state only | One-shot, 120 particles, radial, verdant → white, 700 ms. Rate-limited to once per **8 s**. |
| 4 | **Cursor credits** | pointer motion while `building` | Max 8 live. Desktop, rung 1 only. |

**Banned outright:** ambient dust across the page; any particle behind text; particles in
the nav, the modes grid, the trust strip, pricing, or the FAQ; any emitter that runs while
its section is out of viewport.

**Implementation:** a **single** `THREE.Points` with a pre-allocated 600-particle buffer,
ping-ponged; emitters write into free slots. Never allocate a particle at runtime. Never
build a DOM-node particle system. Every emitter is gated by `IntersectionObserver` on its
owning section.

---

## 12. WebGL

### 12.1 Renderer decision

**Target WebGL 2 via `THREE.WebGLRenderer`.** Not `three/webgpu`.

Rationale, from §3: WebGL 2 has been **Baseline widely available since 2024-03-20**.
WebGPU is **not Baseline — blocked by Firefox since January 2026**, and Firefox stable
does not support it. `three/webgpu` would ship a materially larger bundle (against a
180 KB budget) to buy a feature an entire browser cannot use, and its WebGL2 fallback
path is the code we'd be running for Firefox users anyway. Revisit when Firefox ships
WebGPU in stable.

### 12.2 Real-time vs. pre-rendered

| Real-time | Pre-rendered |
|---|---|
| The golem: 9 slabs + 6 shards | Environment map (256×128 RGBE, ≤ 24 KB) |
| Rubble plinth (`InstancedMesh`, 24 × ~200 tris) | Contact shadow (baked alpha plane) |
| Seam / rune emissive shader | Ambient occlusion (baked into the ORM map — **no SSAO pass**) |
| Ground "molten crack" plane (1 quad, SDF crack shader, 2 texture samples) | Mobile hero video loop (§12.3) |
| Selective bloom (emissive channel only) | OG image — 1200×630 **PNG** render |
| Final composite: vignette + grain + edge chromatic aberration, **one pass** | Mode-card golem poses (SVG, build-time) |

**Bloom discipline.** Selective bloom on the emissive channel only, via
`postprocessing`'s `SelectiveBloomEffect`: quarter-res mip chain, **5 mips**, threshold
**1.0**, intensity **0.65**. Do **not** use full-resolution UnrealBloom — it is the
single most common reason a WebGL hero drops frames, and at full res it blooms the
*background* too, which is exactly the "everything is glowing" failure §2 warns about.

**Composite discipline.** Vignette, grain and chromatic aberration are **one** fragment
pass in the `EffectComposer`, not three. `postprocessing` merges them automatically if
they're added to a single `EffectPass`.

### 12.3 The mobile hero

A 1080×1350 (4:5) **3-second seamless loop** of the `waking → idle` beat, rendered
offline at full quality.

| Format | Target size |
|---|---|
| AV1 in `.webm` | ~180 KB |
| H.265 `.mp4` fallback | ~300 KB |
| WebP poster | ~40 KB |

`<video muted playsinline autoplay loop preload="metadata" poster="...">`. This is how
mobile gets the same cinema at roughly 1/20th of the compute — and it is why the mobile
LCP budget is achievable.

### 12.4 The capability ladder — five rungs

The probe runs in **< 8 ms, before the hero's first paint**:

```
prefers-reduced-motion: reduce ................ → rung 4
Save-Data: on, or effectiveType 2g/slow-2g .... → rung 4
no WebGL2 context ............................. → rung 5
deviceMemory < 4 or hardwareConcurrency < 4 ... → rung 3
pointer: coarse ............................... → rung 3
otherwise ..................................... → rung 1 (with a frame-time watchdog)
```

| Rung | Name | Contents |
|---|---|---|
| **1** | **Full** | WebGL2, `DPR = min(devicePixelRatio, 2)`, full golem, 24 rubble instances, 5-mip selective bloom, 400 particles, eye-aim, scroll-scrubbed camera |
| **2** | **Reduced** (auto-demote) | DPR → 1.5; bloom mips 5 → 3; particles 400 → 120; rubble 24 → 8; shadow plane off. **Trigger:** rolling median frame time over 90 frames > 20 ms. Demotion is one-way per session — never oscillate. |
| **3** | **Lite** | The pre-rendered video loop replaces WebGL entirely. **No canvas is created.** The state machine still runs, driving the overlaid **SVG rig** for eye and seam colour only. |
| **4** | **Still** | WebP poster + the SVG rig in `idle`, poses snapping, no loops. |
| **5** | **No-GL** | The SVG rig alone, statically rendered by Astro at build time. Page fully readable, every CTA works, `<noscript>` covered because the SVG is already in the HTML. |

> **Rung 5 is the authored default in the HTML.** WebGL is layered *on top* and swapped
> in. That is what guarantees no flash-of-nothing and CLS = 0 — the LCP element is the
> H1 text and the SVG that are already in the document, not a canvas that arrives later.

### 12.5 Performance budget — CI gates

| Metric | Budget |
|---|---|
| LCP (75th pct, mobile) | **≤ 2.5 s** |
| INP (75th pct) | **≤ 200 ms** |
| CLS | **≤ 0.05** (stricter than the 0.10 threshold — a WebGL hero has no excuse to shift) |
| First-load JS, excluding the WebGL chunk | **≤ 90 KB gzip** |
| WebGL chunk (three + scene + shaders) | **≤ 180 KB gzip**, lazy, `import()` after LCP |
| Total hero weight before interaction | **≤ 420 KB** (2 × ~48 KB subset fonts, 40 KB poster, ≤ 24 KB CSS, ≤ 18 KB HTML) |
| Draw calls, rung 1 | **≤ 42** (mobile GPUs degrade above ~100; desktop above ~500) |
| Triangles, rung 1 | **≤ 65,000** |
| Texture memory | **≤ 24 MB** |
| Frame time, rung 1, MacBook Air M2 @ 1440×900 | **≤ 9 ms** |
| Frame time, rung 3 device (iPhone 12 / Pixel 6a) | **≤ 16 ms**; video path ≤ 4 ms |
| Long tasks during hero scroll | **0 tasks > 50 ms** |

Instrument with `renderer.info` (draw calls, triangles, texture memory) surfaced behind
`?debug=perf`, and assert the budgets in CI with Lighthouse CI plus a headless
frame-time harness.

### 12.6 Load order

1. HTML + inlined critical CSS (≤ 14 KB) + **the SVG golem inline in the markup**.
   → LCP element is the H1 text. Not the canvas.
2. `preload` the two subset woff2 (Sora, Inter latin) with `font-display: swap` and the
   metric-matched fallbacks from §5.2. CLS contribution: 0.
3. After `load` **and** `requestIdleCallback`: run the capability probe, then dynamic
   `import('./golem-scene')`.
4. The canvas fades in over the SVG at `--dur-6`. The SVG becomes
   `visibility: hidden` — **kept in the layout** so nothing shifts — and is removed after
   the transition completes.

---

## 13. Sound

**Off by default. Always.** Nothing plays without an explicit gesture on the sound
control. Autoplay-with-sound is blocked by browsers regardless, and would be hostile.

- **Control:** a single persistent toggle in the nav. 44×44, `aria-pressed`, accessible
  label "Enable sound". Persisted at `localStorage['golem.sound']`, default `off`.
- **Palette: 8 samples, ≤ 140 KB total, one sprite file** (Opus `.webm` + `.m4a`
  fallback), decoded once into a single `AudioBuffer`.

| # | Sample | Length | Level | Trigger |
|---|---|---|---|---|
| 1 | `wake` | 1.4 s | −12 dBFS | `waking`, once |
| 2 | `strike` | 180 ms | −16 dBFS | each `building` strike, pitch-randomised **±3 semitones** so repetition doesn't fatigue |
| 3 | `hum` | 6 s seamless loop | **−28 dBFS**, ducked to −40 when anything else plays | `idle`, hero only |
| 4 | `rune` | 600 ms | −18 dBFS | `thinking` entry |
| 5 | `verify` | 700 ms | −16 dBFS | `verifying` entry |
| 6 | `success` | 900 ms | −12 dBFS | `success` |
| 7 | `error` | 400 ms | −18 dBFS | `error`. A dull unpitched thud — **never a harsh buzzer** |
| 8 | `hover` | 40 ms | −34 dBFS | primary CTA hover only, rate-limited to 1 per 250 ms |

- Master gain **−6 dBFS**. Everything routes through one `GainNode`, so the toggle is a
  single 200 ms ramp to zero — no clicks, no per-sample teardown.
- Auto-mute on `document.hidden`.
- Under `data-motion="calm"` or `"off"`, sound remains *available* but the `hum` loop is
  disabled — looping ambience is an attention and vestibular concern independent of
  visual motion.
- **Never** speech. **Never** a music bed.

---

## 14. Section-by-section plan

Breakpoints are content-driven: **480 / 768 / 1024 / 1280 / 1600**.

### 0 · Nav

64px tall; collapses to 52px and tightens on scroll past 120px. Glass (recipe 1, §7.3).
Contents: golem glyph + wordmark, `How / Modes / Docs / Pricing`, sound toggle, motion
control (in the overflow), `Open Golem` primary CTA.

**Proof element:** a live `●` status dot fed from `/status`. If the service is up, the
site says so, in real time, at 200 bytes. That is a proof, not a claim.

### 1 · Hero — "Awakening"
**Accent** Rune Amber · **Golem** `waking` → `idle`, eye-aim live

- **Proves:** this thing is alive, and it makes 3D worlds.
- **Layout:** asymmetric **7 / 5** split at ≥1280. The golem **overlaps the H1's right
  edge by 40px** — the character breaks the text plane. This is the cheapest single move
  that makes a page read as *composed* rather than *templated*.
- **H1:** `Describe it. Golem builds it.` — verbatim. `--t-display-1`, per-char carve-in
  (kinetic #1).
- **Sub-line:** mono verb roller — `it writes the Luau ▸ wires the instances ▸ presses Play`
  (kinetic #2).
- **CTAs:** primary `Start building — free`; ghost `Watch a 40-second build`, which
  **scrolls to the demo rather than opening a modal**. Modals kill scroll momentum and
  a modal is the wrong container for a page whose whole argument is continuity.
- **Fine print:** the free-credits number, from a **single exported constant** (see §1
  defect #1 — the page currently states two different numbers).
- **Scroll affordance:** a molten seam that drips one pixel of ember toward the next
  section. Diegetic, not a bouncing chevron.
- **Height cap:** `min(88svh, 860px)`.

### 2 · Act I — "The Ask"
**Accent** Rune Amber (cooled) · **Golem** `listening`

- **Proves:** you talk to it in plain language, about a project you already have.
- **Demonstration:** a **real, typeable prompt field**. Not a screenshot. The visitor
  types, or picks a chip (`a lava obby with checkpoints` / `a shop that sells trails` /
  `fix the door that won't open`), and the page shows the actual project-tree context
  Golem would read — script names, instance counts — from a small canned fixture keyed
  to the chip.
- **The move:** on submit it deep-links to `/app?prompt=…`, so the visitor's first real
  session opens with **what they just typed**. The marketing page and the product share
  the same first step. This is the strongest available proof and it is roughly ten lines
  of code.
- **Motion:** on focus the golem enters `listening`, the camera yaws −14°, and the
  surrounding UI dims to 40% — one `filter: brightness()` on a wrapper, not thirty
  opacity animations.

### 3 · Act II — "The Plan"
**Accent** Arcane Violet · **Golem** `thinking`

- **Proves:** it decomposes the problem; it does not guess.
- **Demonstration:** the plan writes itself out as a numbered list, one step at a time,
  **scroll-scrubbed** — scroll back and the steps un-write (choreography rule 7). Each
  step carries the tool it will use (`create_instance`, `edit_script`, `set_property`) as
  a mono chip. **Use the product's real tool names.**
- **Motion:** rune motes; list stagger per the §8.3 formula.
- **Avoid:** "AI thinking" dots. Show content, never a spinner.

### 4 · Act III — "The Build"
**Accent** Molten Orange · **Golem** `building`

- **Proves:** it edits real Luau and real instances, inside Studio, undoably.
- **Demonstration:** a split **diff + Explorer tree** that plays as you scroll. Left: a
  Luau diff with real syntax highlighting and real added lines. Right: the tree, with
  instances appearing and properties being set.
- **The move:** a `Ctrl+Z` chip sits above it, and **pressing it actually reverses the
  animation.** The reader can undo the demo. That single interaction proves "native undo"
  better than any paragraph.
- **Motion:** forge credits at each strike; added diff lines carve in behind a left-edge
  ember rule that sweeps downward.
- **Perf:** the code pane is a **pre-tokenised static HTML string** revealed by a
  `clip-path`. No runtime syntax highlighter ships. Ever.

### 5 · Act IV — "The Proof"
**Accent** Verdant · **Golem** `verifying` → `success`

- **Proves:** it verifies by actually running the game.
- **Demonstration:** a replay of a real Studio Output pane — timestamps, the run
  starting, **an error appearing**, the golem reading it, a second edit, then a clean run.
- **Include the failure.** A demo where the first attempt fails and is repaired is more
  credible than one that succeeds instantly, and it is what actually happens. This is the
  most persuasive twenty seconds on the page.
- Then three counters roll up (kinetic #5, `tabular-nums`): scripts touched, instances
  created, seconds to green. **These numbers come from a real recorded session. If they
  cannot be sourced honestly, cut the counters.** Never fabricate a metric.
- **Motion:** the golem's scan-line sweep is synchronised to the output pane's scroll.

### 6 · Modes — Clay / Stone / Rune
**Accents** Clay `#E2A16F` · Stone `#A8B4C4` · Rune `#9B82FF` · **Golem** SVG rigs

- **Proves:** the cost model is honest and legible.
- **Demonstration:** three cards, each with the SVG golem in a distinct pose, each with an
  interactive **credit meter** — drag a "how big is your ask" slider and each card shows
  what that costs in its mode. Cost becomes something you *experience*, not something you
  read.
- **Treatment:** this is where carved stone beats glass. `.stone` + `.stone--seam` with a
  2px top rule in the mode accent, plus the tiled grain. **No `backdrop-filter`.**
- **Hover:** the card's SVG golem plays one state beat — Clay → `greeting`, Stone → one
  `building` strike, Rune → `thinking`.

### 7 · Trust — "Real Studio. Your project. Never trained on."
**Accent** Cold Iron · **Golem** `idle`, `uSeamHeat` floored to 0.5

- **This is deliberately the quietest section on the page.** No glow, no particles, no
  parallax; hairline borders; higher-contrast text; generous whitespace.
- Four claims, each linked to the doc that substantiates it (`/docs/privacy-and-data`,
  `/docs/plugin`, and so on).
- **The rationale:** a design that goes quiet exactly where a competitor would go loud is
  itself a trust signal. Restraint at the trust section is the argument.

### 8 · Pricing / Credits
**Accent** Rune Amber

- **Demonstration:** a daily-credits bar that fills as you drag a "requests per day"
  slider, showing what the free tier actually covers — **including where it runs out.**
  The free tier is the product's strongest asset; showing its edge honestly is more
  persuasive than hiding it.
- The golem's `uSeamHeat` maps to the slider value: drag it high and the golem visibly
  burns brighter. Credits become energy you can see.

### 9 · FAQ
**Accent** none — neutral

Native `<details>` / `<summary>` with a custom marker. Open animation via
`interpolate-size: allow-keywords` + `transition: height` where supported; falls back to
instant elsewhere. **Do not rebuild this with divs** — the keyboard and screen-reader
behaviour is free and you will get it wrong by hand.

### 10 · Act V — Final CTA — "The golem is waiting for its words."
**Accent** Molten Orange · **Golem** full-frame, `greeting`, `success` on CTA hover

The one moment the page is permitted to be loud. Golem at maximum seam heat, centred,
H2 at `--t-display-1`. **One primary CTA, one secondary, nothing else.** No footer links
bleeding in, no newsletter box, no logo wall.

### 11 · Footer
Motion control, sound toggle, live status dot, docs, legal. Golem `sleeping`; the scene
unmounts at the footer boundary.

---

## 15. Mobile degradation

| Subsystem | ≥1280 | 1024–1279 | 768–1023 | <768 |
|---|---|---|---|---|
| Hero visual | rung 1 WebGL, 52vw | rung 1, 46vw | rung 2 or video, full-width **above** copy | rung 3 video loop, 4:5, above copy |
| Custom cursor | on | on | off (coarse pointer) | off |
| Scrubbed camera | full | full | 2 keyframes only | off — sections simply reveal |
| Particles | full | full | success burst only | none |
| Glass layers | nav + HUD | nav + HUD | nav only | nav becomes **opaque** |
| Grain | shader + card texture | same | card texture only | off |
| Kinetic type | all 6 | all 6 | hero H1 + counters | counters only (H1 fades) |
| Section padding | `clamp(96–176px)` | `96–140px` | `80–112px` | `64–88px` |
| `--t-display-1` | up to 120px | 88px | 64px | 52px |
| Demo player | interactive, scrubbed | interactive | tap-to-play video | tap-to-play, 16:9 |
| Nav | horizontal glass | horizontal | condensed | bottom **sheet** |
| Sound | available | available | available | available |

**Universal mobile rules:**

- **`100dvh` / `svh` only.** Never `100vh`. The hero uses `svh`; full-height panels use
  `dvh`.
- Every tap target **≥ 44×44** with **≥ 8px** separation.
- **No hover-only affordance anywhere.** Every hover reveal has a tap equivalent or is
  always visible.
- `touch-action: pan-y` on any horizontal carousel, so vertical scroll is never captured.
- The mobile nav sheet respects `env(safe-area-inset-bottom)`.
- **375×667 (iPhone SE) is the tested floor**, not 390.
- **The hardest gate:** the hero must reach a readable, complete state within **2.5 s** on
  a throttled Slow-4G / 4× CPU profile **with the WebGL chunk never downloaded**. If it
  can't, the rung-5 HTML isn't doing its job.

---

## 16. Implementation stack

| Layer | Choice | Note |
|---|---|---|
| Framework | **Astro 5** (already in `apps/site`) | Zero JS by default with islands is exactly right for one heavy interactive island on an otherwise static page. Keep it. |
| 3D | **three.js 0.185.1**, tree-shaken from `three` | Not `three/webgpu` — see §12.1. |
| Post | **postprocessing 6.39.4** | `SelectiveBloomEffect` + a single merged `EffectPass`. |
| Scroll timelines | **GSAP 3.15.0 + ScrollTrigger** | Free for commercial use since April 2025 (Webflow). All former Club plugins included. |
| Text splitting | **Build-time Astro component** | Not GSAP SplitText at runtime — zero CLS, zero critical-path JS. Use SplitText only if the copy becomes dynamic. |
| Scroll-driven CSS | **Progressive enhancement only** | Behind `@supports (animation-timeline: view())`. Authored baseline is IntersectionObserver + ScrollTrigger. Not Baseline; blocked by Firefox since Sept 2025 (§3). |
| Route transitions | **Astro `<ClientRouter />`** | Same-document view transitions with a JS fallback everywhere. `view-transition-name: golem` on the character. Cross-document `@view-transition` is not Baseline (§3). |
| Smooth scroll | **Lenis 1.3.26 — optional, gated, not in v1** | Scroll hijacking is a genuine usability and accessibility risk. If added later: disable under coarse pointer, under `data-motion` ≠ `full`, and under `prefers-reduced-motion`. |
| Fonts | **Self-hosted variable subsets** | Google Fonts CDN acceptable for v1; self-host before launch. |

**Suggested file layout** (extending the existing `apps/site/src/`):

```
src/
  styles/
    tokens.css          ← §4 §5 §6 §7 §8 — every custom property, nothing else
    base.css            ← reset, typography defaults, focus, motion gating
    stone.css           ← the .stone material system
  lib/
    motion.ts           ← data-motion resolution, the shared rAF loop
    golem-state.ts      ← the §9.3 state machine + event bus (no three.js import)
    capability.ts       ← the §12.4 rung probe
  golem/
    poses.json          ← 11 states × 15 transforms — SHARED by 3D and SVG
    scene.ts            ← three.js island; dynamically imported
    shaders/seam.glsl
    GolemSVG.astro      ← the 9-slab rig, build-time rendered
  components/
    Cursor.astro        ← §10
    Sound.astro         ← §13
    MotionControl.astro ← §8.4 Tier C
```

`golem-state.ts` deliberately does **not** import three.js — that is what lets the SVG
rig, the mode cards and the app all consume the same state machine without pulling in the
3D bundle.

---

## 17. Acceptance gates

The rebuild is not done until every one of these passes.

**Correctness**
- [ ] The free-credit number appears identically on every surface, sourced from one
      exported constant. (Currently 60 vs 80 — §1 defect #1.)
- [ ] `og:image` is a 1200×630 **PNG** and unfurls correctly on X, Slack, Discord and
      LinkedIn.
- [ ] `astro.config.mjs` `site` matches the production origin; canonical, `og:url` and
      the sitemap all resolve to it.
- [ ] No 404-ing asset probes remain.

**Performance**
- [ ] LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.05 at the 75th percentile on mobile.
- [ ] First-load JS ≤ 90 KB gzip excluding the WebGL chunk; WebGL chunk ≤ 180 KB gzip.
- [ ] Rung 1: ≤ 42 draw calls, ≤ 65k triangles, ≤ 9 ms/frame on an M2 Air @1440×900.
- [ ] Zero long tasks > 50 ms during hero scroll.
- [ ] The page is complete and readable at rung 5 with JS disabled.

**Accessibility**
- [ ] Every interactive target ≥ 44×44 CSS px.
- [ ] All three motion tiers work, and the in-page control overrides the OS preference in
      both directions.
- [ ] Every auto-starting loop can be stopped from the page (WCAG 2.2.2).
- [ ] `prefers-reduced-transparency: reduce` produces opaque surfaces.
- [ ] The custom cursor never hides the native cursor outside `[data-cursor-zone]`, and
      disappears on the first `Tab`.
- [ ] Keyboard path through every act reaches every CTA; focus is always visible against
      the section accent.
- [ ] Every colour pair in §4 verified in-browser at its shipped opacity.

**Art direction**
- [ ] Zero `backdrop-filter` outside the three sanctioned uses.
- [ ] Zero ambient particles; all four emitters gated by `IntersectionObserver`.
- [ ] Kinetic type appears exactly six times, never in body copy.
- [ ] No navy in the neutral ramp; no amber→violet gradient on any headline or button.
- [ ] Every section's claims are attached to a working artifact.
- [ ] The golem's eyes track the pointer in the hero, and the state changes are legible
      to someone who never reads a word of copy.

---

## Sources

Platform support and standards:
- [Scroll-driven animations — Web platform features explorer](https://web-platform-dx.github.io/web-features-explorer/features/scroll-driven-animations/) — Baseline blocked by Firefox since Sept 2025
- [WebGPU — Web platform features explorer](https://web-platform-dx.github.io/web-features-explorer/features/webgpu/) — Baseline blocked by Firefox since Jan 2026
- [WebGL2 — Web platform features explorer](https://web-platform-dx.github.io/web-features-explorer/features/webgl2/) — Baseline widely available 2024-03-20
- [`@view-transition` — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition) — limited availability, not Baseline
- [CSS scroll-driven animations — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations)
- [View Transition API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Understanding SC 2.3.3: Animation from Interactions — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [WCAG issue #3766 — 2.2.2 and `prefers-reduced-motion`](https://github.com/w3c/wcag/issues/3766)
- [WCAG 2.5.8 Target Size (Minimum) — TestParty](https://testparty.ai/blog/wcag-target-size-guide)
- [Core Web Vitals thresholds 2026](https://roastweb.com/blog/core-web-vitals-explained-2026)

Libraries and technique:
- [Webflow makes GSAP 100% free](https://webflow.com/blog/gsap-becomes-free)
- [GSAP is now completely free, even for commercial use — CSS-Tricks](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/)
- [Three.js — WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer.html)
- [Draw Calls: The Silent Killer — Three.js Roadmap](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [100 Three.js tips that actually improve performance (2026) — Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Variable fonts: optimizing web typography and performance in 2026](https://blog.lueurexterne.com/en/blog/variable-fonts-optimizing-web-typography-and-performance-in-2026/)

Reference work:
- [Awwwards — Sites of the Year](https://www.awwwards.com/websites/sites_of_the_year/) — Lando Norris (OFF+BRAND) 2025; Igloo Inc (abeto) 2024; Lusion v3 2023
- [Awwwards — WebGL collection](https://www.awwwards.com/awwwards/collections/webgl/)
- [Immersive website examples 2026 — Metabole Studio](https://metabole.studio/en/blog/immersive-website-examples)

Verified locally on 2026-08-30 (`npm view`, Google Fonts CSS2 API probes, repo reads):
three `0.185.1`; gsap `3.15.0` (standard no-charge licence); postprocessing `6.39.4`;
lenis `1.3.26`; Inter v20 axes `opsz 14–32` + `wght 100–900`; Sora v17 `wght 100–800`
(**no `wdth` axis** — HTTP 400); JetBrains Mono v24 `wght 100–800`.
