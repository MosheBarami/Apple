# Apple design language v4 ("Geist line"): owner's references, 2026-10-04

The owner rejected Ember Rail (orange) and the old blue look because neither was a *new design language*: the pages,
the dashboard and the chat all looked like the old product with new paint. The owner's references are:

1. **https://ai-sdk.dev/**: the structure, rhythm and component vocabulary.
2. **https://github.com/uhub/awesome-llm**: the information architecture of a curated, categorised catalogue.

Apply these as the language. Do not copy Vercel's brand, logo, copy or the triangle mark. Apple keeps its own name
and mark (`AppleMark.astro` / branding components).

## What ai-sdk.dev actually looks like (observed in a browser, 2026-10-04)

- **Canvas:** pure black `#000` in dark mode and pure white in light mode. No gradients, no glow blobs, no
  "atmosphere". Colour comes from content (code syntax, screenshots), never from chrome.
- **Type:** Geist Sans for UI and Geist Mono for code and labels (both via Google Fonts or self-hosted woff2).
  Huge, tight headlines: about 56–72px desktop, weight 500–600, letter-spacing about -0.04em, line-height 1.05.
  Body text is 15–16px in a muted grey (`#a1a1a1` on dark).
- **Header:** slim, sticky, 56px. Left: the mark, a `/` separator and the product name with a tiny outlined version
  pill. Right: a small outlined "Ask AI"-style button, the GitHub icon and a menu. Bottom border is 1px hairline.
- **Hero:** centred headline, a one-line grey subhead, then a segmented toggle ("For humans | For agents") above
  an install-command chip (`$ npm install ai` with a copy button, monospace, outlined, rounded 8px).
- **Interactive demo band:** tabs (Text Generation / Image / Speech / …) as small pills with the active one
  outlined. Below them, a code window (traffic-light dots, filename in mono, a "Run it with [select]" control)
  sits beside a live chat-preview card (a user bubble that is a white pill, then the answer in grey text).
- **Stats row:** four big numbers (≈56px, weight 400) with small grey captions, separated only by whitespace.
- **Split section:** a big left-aligned headline on the left and a row of monochrome logo badges on the right.
- **Feature row:** four columns. Each has a tiny icon and a 13px label on top, a white one-line claim and a grey
  continuation sentence. A hairline divider sits above the row.
- **Bento / ecosystem cards:** 1px hairline borders (`rgba(255,255,255,.1)`), radius 12px, near-black fill
  (`#0a0a0a`), a "NEW" outlined micro-badge, and no shadows.
- **Buttons:** primary is a white pill with black text; secondary is transparent with a hairline border. Both are
  about 32–36px tall with 13–14px text.
- **Motion:** restrained. Tabs crossfade, code types in, cards lift 1px on hover, sections fade up on scroll
  (`prefers-reduced-motion` turns it all off).
- **Light mode:** the exact inverse: white canvas, `#171717` text, `#eaeaea` hairlines, `#fafafa` cards.

## What awesome-llm contributes

A curated catalogue: a short intro, a table of contents of about 12 categories, then each category as a heading
with an emoji or icon and a list of entries (name, one-line description, link). For Apple this becomes:

- **`/catalog` (new page, the "gimmick"):** "Awesome Apple". This is a curated, searchable index of everything Apple
  can build in Roblox Studio, grouped into categories: Worlds & terrain, Buildings & props, Characters & NPCs,
  UI & HUD, Game systems, Animation, Sound, VFX & lighting, Monetisation, Multiplayer, Tools & weapons, and
  Vehicles. Each entry has a name, a one-line description and a "Try this prompt" copy button that copies the
  prompt and deep-links to `/app?prompt=…` if the app supports it (otherwise it only copies). It includes a
  client-side filter box and category chips, with the ToC on the left at desktop width (sticky) and on top on
  mobile. Every entry must be something the product really does, sourced from the tools in
  `apps/worker/src/tools.ts` and `packages/components/`. Make no false claims: repo tests check
  claims (`promises-match-the-product`, `model-claims-are-measured`, `check-copy`).
- The **docs index** may adopt the same categorised-list structure.

## Tokens (both apps/site and apps/web must use the same values)

```
--bg: #000;            light: #fff
--bg-subtle: #0a0a0a;  light: #fafafa
--bg-muted: #111;      light: #f2f2f2
--fg: #ededed;         light: #171717
--fg-muted: #a1a1a1;   light: #666
--fg-subtle: #737373;  light: #8f8f8f
--line: rgba(255,255,255,.10);  light: rgba(0,0,0,.08)
--line-strong: rgba(255,255,255,.18); light: rgba(0,0,0,.15)
--accent: #ededed (primary = inverse pill); a single functional blue #0070f3 is used ONLY for focus rings and links-in-prose
--ok: #22c55e  --warn: #f5a524  --err: #ef4444  (status dots only)
--radius-sm: 6px  --radius: 8px  --radius-lg: 12px  --radius-pill: 999px
--font-sans: "Geist", ui-sans-serif, system-ui, sans-serif
--font-mono: "Geist Mono", ui-monospace, SFMono-Regular, monospace
```

Dark mode follows `prefers-color-scheme`, with a manual toggle stored in localStorage under the key the app already
uses (search before inventing one), so there is no flash on load.

## The app (apps/web) in this language

- **Dashboard / projects:** a slim header like the site's, then a grid of hairline project cards (thumbnail on top,
  name, a mono "updated 2h ago" line). The empty state is a single centred install-chip-style "Pair Studio" box.
- **Chat workspace:** a left rail (a project list with hairline separators), the thread in the middle, and the
  Studio/preview panel on the right. User messages are white pills aligned right (inverse); assistant text is
  plain, with no bubble. Tool calls are collapsible hairline rows in mono ("● insert_model  Workspace.Shop  1.2s").
  Code blocks look like the site's code window. The composer is a hairline-bordered 12px-radius box with an
  inverse round send button.
- AI Elements components already live in `apps/web/src/components/ai-elements`: restyle them; do not rewrite them.
