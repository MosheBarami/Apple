# StudPilot website — Cursor adaptation

The owner rejected the prior luminous design and asked for a faithful Cursor website and actual product-interface adaptation for StudPilot. The work reconstructs the home/product/pricing/docs/login/legal surfaces, project history, composer/chat, project activity/source panel, project list, example requests and settings.

The live Cursor site and 25 source-linked captures were researched, including Google screenshot searches and Agents Window/editor/account surfaces. Chrome was opened to the supplied site, Google Images and the resulting review gallery. The signed-in browser connector was unavailable; headless Chrome rendered the reference and the implemented product.

## Evidence

- Browser: **27/27 passed**, including widths **390, 768, 1024, 1440** across nine routes/views, failures/recovery, project search, prompt transfer, theme persistence, real pairing route fixture, tool activity, mobile panel/navigation, demo purchases and source/Inspect interactions, automatic visible demo progress, stable controls and reduced motion. No uncaught page or hydration errors. `browser-results.json` contains each result.
- Production build: compiled successfully, TypeScript completed, 16 static pages generated. Separate local output avoids disrupting development review.
- Website guard clean; old-name guard clean; plan/offer guard coherent using a local resolution loader for the workspace shared package. Backend/provider/plugin source was not changed.
- Reference measurements reproduced: 52px navigation, 1300px stage at 1440px, 70px left gutter, 26px hero, stage position within 8px of the capture, light #F7F7F4 / dark #14120B.
- Source map, typography/asset differences and source attribution: `REFERENCE-MAP.md`.

Review: /Users/moshe/.codex/visualizations/2026/10/08/01a11b6f-e67a-76f1-b55d-115602924746/cursor-rebuild/index.html

Local website: http://127.0.0.1:3100/
Local app UI fixture: http://127.0.0.1:3100/dev/app
Production preview: http://127.0.0.1:3103/
Code: https://github.com/MosheBarami/StudPilot/pull/137

## Remaining boundaries

Public StudPilot domain has not been replaced. Actual signed-in agent sending / live Studio edits were not verified through the disconnected owner browser. Marketing demos and dev app fixtures are explicitly examples, not evidence of a successful real AI build. All Cursor service/enterprise/model/billing claims were adapted to StudPilot's actual capabilities, limits and beta availability; Cursor fonts, logos, people and testimonials were not presented as StudPilot evidence. The landscape asset source is recorded; its independent artist/licence verification remains open before public reuse.
