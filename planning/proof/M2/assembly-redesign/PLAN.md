# Assembly studio redesign

Objective: the full owner brief in the attached goal-objective.md, 2026-10-08.
Continue existing release checkout at caab2468 (equal to origin/main), no new branch or clone.
The primary checkout is older and contains unrelated changes; leave it untouched.

Baseline: live app and homepage screenshots saved before edits. Real Connect Studio created
a project, showed a six-character code and live expiry countdown. Closed the dialog to cancel.
This proves code creation, not plugin pairing. Public API health reports backend 23c0e1b3;
the Next frontend is a separate studpilot-www Worker.

Design: an assembly studio, with a miniature isometric game world, construction guides,
light paths and tangible interface pieces. The centerpiece is an original interactive SVG
scene with selectable world/interface/mechanic layers. It is explicitly a concept preview.
The app places the composer beside the concept, then offers compact starting points.
Project connection, history and evidence stay separate from this illustration.

Tokens: midnight #090e18, slate #121d2d, frost #eaf4fb, blue #86baff,
mint #73ebcf, amber #ffc88a. Space Grotesk display / Manrope body, both SIL OFL,
self-hosted from google/fonts. Warm material accents make the scene feel built, not abstract.

Motion: 180ms controls, 260ms panels, 600ms assembly entrances; ambient beams and
scene breathing on 6–16s loops. Pause + reduced motion must stop decorative movement.
No decorative element moves a control or reading area. Existing attributed Uiverse
controls retained and unified with the new tokens; licenses and exact sources retained.

References studied: Uiverse elements and existing 18-element attributed manifest; AI
Elements activity/composer hierarchy; assistant-ui chat primitives; Animate UI disclosure
motion; React Bits atmosphere; 21st chat composition; HeroUI accessibility. Untitled UI
reference for hierarchy. ElevenLabs, Qronos and Parlo were subsequently inspected in
the browser: compact controls, atmospheric depth and stateful demonstrations informed
the composition after their web text retrieval failed. No reference imagery is copied into the product.

Verification pending: desktop/mobile actual pixels; key paths, failure/draft/scroll
behavior, pairing lifecycle; motion playback; production frontend bytes; final tokens.

Weakest-screen refinement: settings initially left most desktop space empty beside
a long panel. Reworked into controls plus a live appearance sample, stacked on smaller
screens. Fixed illustration entrance fill so selecting a layer can brighten it after arrival.
