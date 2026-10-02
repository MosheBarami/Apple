export const meta = {
  name: 'phase6-website-design-rebuild',
  description: 'Phase 6: rebuild the website design from zero: new design language, logo, shell and landing page, in a worktree',
  phases: [
    { title: 'Understand', detail: 'inventory pages, components, tokens and the V3 UI contract' },
    { title: 'Directions', detail: '3 independent design directions' },
    { title: 'Judge', detail: 'score and synthesize one direction' },
    { title: 'Implement', detail: 'design system, logo, shell, landing page, in a worktree' },
    { title: 'Verify', detail: 'build, tests, design checklist' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running against the DEPLOYED site/worker and the owner's Roblox Studio. NEVER deploy (no infra/deploy-*.mjs, no wrangler), never push, never touch Roblox Studio or Chrome. No paid API calls. Do not download fonts/images from the internet into the repo unless their licence is clear and noted; prefer system/self-authored SVG.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout). Read-only there unless you were given a worktree. In a worktree: commit with \`git commit -q -F <msgfile> -- <explicit paths>\` (git add -- <path> for new files). Never git add -A, never pnpm install, never stash/reset/checkout.
- If node_modules are missing in your worktree, symlink from the main checkout (root + apps/site + apps/web + packages/design as needed): \`ln -s /Users/moshe/Developer/RbxAI/apps/site/node_modules apps/site/node_modules\` etc.
- Run \`node scripts/clean-test-tmp.mjs\` after test suites.
- Infrastructure names stay "golem" (wire literals, bindings) — never rename. The product name is Apple.
- Report only what you measured. Read CLAUDE.md and AGENTS.md first.
`

const BRIEF = `
OWNER'S BRIEF (2026-10-02, phase 6): rebuild the website design FROM ZERO. A new design language and a new logo. Every page at
landing-page quality. Motion, speed, responsive, dark mode, accessibility (WCAG 2.1 AA), and a memorable gimmick. Done when every page
passes the design checklist and Lighthouse >= 90. The product: Apple, an AI agent that builds Roblox games inside Roblox Studio (a Studio
plugin paired to a web workspace). Audience: Roblox creators, many young. The owner reads Hebrew; the site is English (keep RTL-safe CSS).
Surfaces: apps/site (Astro marketing + docs, served at /) and apps/web (React+Vite SPA at /app: dashboard, project workspace with chat,
usage/credits, settings). Design tokens package: packages/design. Read docs/autonomy/v3/Apple_RbxAI_UI_CONTRACT_V3.md and
Apple_RbxAI_UI_SOURCES_V3.json — they may constrain the UI; obey them unless they contradict the brief, and say where they do.
`

phase('Understand')
const [inv, contract] = await parallel([
  () => agent(`${RULES}\n${BRIEF}\nRead-only. Inventory the current web surfaces: every page/route in apps/site/src/pages (incl. docs) and apps/web/src (routes, the workspace in src/components/ws), the shared layout/nav/footer, how styling is done (CSS files, tokens in packages/design, Tailwind or not), fonts, icons, the current logo assets, existing motion, dark mode, and the site/web test suites that pin markup or copy (apps/site/tests, apps/web/tests, scripts/check-*.mjs that police copy/contrast/dead-ends). Output: a compact map an implementer can work from (paths, how to build each app, which tests will break if markup/classes change).`, { label: 'understand:inventory', phase: 'Understand' }),
  () => agent(`${RULES}\n${BRIEF}\nRead-only. Read docs/autonomy/v3/Apple_RbxAI_UI_CONTRACT_V3.md, Apple_RbxAI_UI_SOURCES_V3.json, Apple_RbxAI_ACCEPTANCE_V3.json (UI-related gates) and any design notes in docs/ (grep for "design language", "brand", "logo"). Summarise every binding UI constraint, required page/section, accessibility and performance requirement, and any acceptance gate the website must pass. Note conflicts with the owner's brief.`, { label: 'understand:contract', phase: 'Understand' }),
])

phase('Directions')
const ANGLES = [
  'Playful-craft angle: tactile, toy-like, Roblox-native studs/bricks reinterpreted with restraint; the gimmick grows out of building blocks.',
  'Premium-tool angle: a serious creative tool in the Linear/Figma/Arc class; dark-first, precise type, motion that explains the product (agent building in Studio).',
  'Bold-editorial angle: high-contrast, big type, colour as identity, a signature interactive hero; distinct from every AI-SaaS template.',
]
const DIRECTION = { type: 'object', properties: {
  name: { type: 'string' }, concept: { type: 'string' }, palette: { type: 'string', description: 'light + dark tokens with hex values and contrast ratios for text pairs' },
  typography: { type: 'string' }, spacing_radius_elevation: { type: 'string' }, motion: { type: 'string' }, gimmick: { type: 'string' },
  logo_svg: { type: 'string', description: 'a complete, self-authored SVG logo mark + wordmark' }, landing_outline: { type: 'string' }, app_shell: { type: 'string' }, risks: { type: 'string' } },
  required: ['name', 'concept', 'palette', 'typography', 'motion', 'gimmick', 'logo_svg', 'landing_outline', 'app_shell'] }
const directions = await parallel(ANGLES.map((a, i) => () => agent(`${RULES}\n${BRIEF}\nCurrent surfaces:\n${inv}\n\nBinding constraints:\n${contract}\n\nYou are designer #${i + 1}. ${a}\nProduce a complete, original design direction (do not copy any existing brand). Palette must meet WCAG AA for all text pairs in both themes (give the ratios). The logo must be a self-authored SVG that works at 16px and large. Read-only: do not edit files.`, { label: `direction:${i + 1}`, phase: 'Directions', schema: DIRECTION })))
const dirs = directions.filter(Boolean)

phase('Judge')
const decision = await agent(`${RULES}\n${BRIEF}\nBinding constraints:\n${contract}\n\nThree design directions (JSON):\n${JSON.stringify(dirs)}\n\nScore each 0-10 on: originality/memorability, fit for young Roblox creators AND credibility as a paid tool, accessibility, performance cost of the motion/gimmick, implementability across both apps. Pick a winner and graft the best ideas of the runners-up. Output the FINAL design spec as markdown: tokens (light+dark, exact values), type scale, spacing/radius/elevation, motion rules (incl. prefers-reduced-motion), the gimmick, the final logo SVG (complete), landing page section-by-section, app shell (nav, sidebar, workspace chrome), component rules (buttons, inputs, cards, chat bubbles), and a design checklist every page must pass. Also include the scorecard.`, { label: 'judge', phase: 'Judge' })

phase('Implement')
const impl = await agent(`${RULES}\n${BRIEF}\nSurfaces map:\n${inv}\n\nFINAL design spec:\n${decision}\n\nYou implement the FIRST slice of the rebuild in your own git worktree: (1) the design tokens (packages/design and/or the apps' CSS) with light + dark themes; (2) the logo as SVG assets + favicon; (3) the shared site layout (header, nav, footer) in apps/site; (4) the landing page (apps/site/src/pages/index.astro) rebuilt to the spec, with motion, the gimmick, responsive, reduced-motion support and AA contrast; (5) apply the tokens + logo to the apps/web shell (sidebar, header, theme) without breaking workspace behaviour. Keep copy truthful (no claims the product can't back — scripts/check-copy etc. police this). Update tests that pin old markup to pin the new contract; never delete a test to go green. Build apps/site (astro build) and apps/web (vite build), run apps/site tests and apps/web tests, report real counts. Commit in logical commits (subjects start "phase 6:"). Report: worktree path, branch, SHAs, what changed, what remains (the list of pages not yet rebuilt), test counts.`, { label: 'implement', phase: 'Implement', isolation: 'worktree' })

phase('Verify')
const verify = await agent(`${RULES}\nFINAL design spec (includes the design checklist):\n${decision}\n\nThe implementer reported:\n${impl}\n\nAdversarially verify the slice in the worktree it names (read-only except for builds): build apps/site and apps/web there, run their tests, check the built landing page HTML/CSS against the design checklist (contrast of real token pairs, reduced-motion handling, semantic landmarks, alt text, focus styles, no layout shift from the gimmick, JS weight). If a local Lighthouse is available without installing anything (npx --no-install lighthouse, or a chrome binary), run it against a local preview; otherwise say Lighthouse was NOT measured. Report pass/fail per checklist item with evidence. Default to fail when uncertain.`, { label: 'verify', phase: 'Verify' })
return { decision, impl, verify }
