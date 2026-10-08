# StudPilot web rebuild: tear down and build new (W-plan v1, 2026-10-06)

The planner wrote this from the owner's decisions. **This is a real rebuild, not a restyle.** Earlier "rebuilds" kept the shared design package, old components and old copy, so the site always came back looking the same. This plan forbids that, and checks it.

## 0. Owner decisions (2026-10-06)

| # | Decision | Rules out |
|---|---|---|
| W-1 | **Base:** Vercel's **Chatbot** template (github.com/vercel/chatbot) + **AI Elements** (elements.ai-sdk.dev) for every chat part. Landing and pricing pages are adapted from the **Next.js SaaS Starter** (github.com/nextjs/saas-starter, MIT). One app serves both the website and the product, hosted on Cloudflare. | Keeping the Astro site, `apps/web` or the Kumo `/studio` UI |
| W-2 | **Look:** a **playful website** (the Roblox candy + studs style from `STYLE-BIBLE.md`) and a **clean app** (calm and neutral like ChatGPT or v0, light and dark, a small accent colour). | The current dark violet look everywhere |
| W-3 | **No dashboard.** Sign in → you land in the chat. | The Projects page, the dashboard home and the separate settings pages |
| W-4 | **When:** right after the UI-kit re-run of U01–U15 has been reported. | Rebuilding the site before the kit is proven |
| — | The owner's links to Hugging Face LLM course chapter 11 and Unsloth "chat templates" are about **model training formats, not websites**. They are not used. (Training on Roblox data is forbidden anyway.) | — |

## 1. Hard rules (each one is checked by CI; break one and the build fails)
1. **New folder, new start.** `apps/www` is created from the template itself:
   - `git clone` vercel/chatbot at a pinned commit;
   - record the commit hash and license in `apps/www/TEMPLATE.md` and `THIRD_PARTY_NOTICES.md`;
   - check the license before using it.

   AI Elements parts come **only** from `npx ai-elements@latest add <name>`.
2. **Nothing old comes in.** `apps/www` must not import:
   - `@studpilot/design`;
   - anything from `apps/web`, `apps/site` or `apps/studio`;
   - the old CSS, fonts or tokens.

   A CI script fails the build on any such import.
3. **No old words.** CI fails if `apps/www` contains any of these: "Untitled piece", "piece", "Public Studio installation", "Engine", "Showcase", "verify the result".
4. **Allowed from the old code (only these):**
   - `@studpilot/shared` (types and the API client);
   - the Worker API;
   - the Studio agent backend (Flue / Agents SDK);
   - Supabase;
   - the R2, D1 and Durable Object stores;
   - the **text** of `/privacy` and `/terms`, which was already reviewed. The words stay; the design is new.
5. **Swap out the template's parts:**

   | Template part | Replaced by |
   |---|---|
   | Auth.js | Supabase sign-in (Google, Discord, email, Roblox) |
   | Neon chat history | our existing store |
   | Vercel Blob | R2 |
   | Model selector | removed (one model) |
   | Vercel AI Gateway | our Worker |

6. **Hosting.** Cloudflare Workers via **OpenNext** (`@opennextjs/cloudflare`).
   - **Step 1:** deploy the *untouched* template to a preview URL, to prove the hosting works.
   - If OpenNext cannot run it, fall back to Cloudflare's `react-router-hono-fullstack-template` + AI Elements. Record the reason in `DEADENDS.md`. This needs no owner question.

## 2. The app (clean)

### Layout after sign-in
- **The page is the chat.** No dashboard, no projects page.
- **Left sidebar:**
  - New chat;
  - chat history (searchable);
  - at the bottom: the credits meter ("4.20 credits left today") and the account menu (Usage, Settings, Sign out).
- **Top bar:** the chat title, and a **Studio light** (green "Studio connected" / grey "Connect Studio"). Clicking it opens the 6-character pairing flow in a dialog.

### The chat itself
- **Empty chat:** a big prompt box in the middle with 4–6 example requests taken from real passing builds.
- **During a build**, from AI Elements:
  - `Plan` (what it will build);
  - `Task` / `Tool` (each step live);
  - `Reasoning` (collapsed);
  - `Confirmation` (the one question it may ask);
  - `Checkpoint` (undo to before this build);
  - `Shimmer` while working.
- **The final reply:** short and friendly. Lists what was built and any gaps. No visual claims.

### Settings
- **One dialog, not pages.** Tabs:
  - Profile;
  - Connections (Roblox, Google, Discord);
  - Data (export, delete account).

### Look
- Neutral greys, light by default, dark available.
- One accent colour, used only for the send button and the Studio light.
- Font: Geist or Inter (the template's default).

## 3. The website (playful)
- **Pages:**
  - Home;
  - Pricing (adapted from the SaaS Starter, using the plan table from section 7 of the plan; checkout **off**, beta label);
  - Docs (one simple page: how to pair Studio, what it can build, credits);
  - Privacy;
  - Terms;
  - Sign in.
- **Style:**
  - per `STYLE-BIBLE.md` §3: the candy palette, a heavy rounded headline font (Fredoka) with thick outlines on the hero, a faint stud pattern, chunky buttons with a bottom shadow;
  - body text stays readable (Inter or Geist).
- **Honest message:** StudPilot is a **co-pilot that builds pieces of your game inside your Studio**: screens, systems, props and areas.
  - Not "describe a game and get a game". The current hero ("Describe a colorful cartoon Roblox game") breaks decision D1 and must go.
- **Real images only:**
  - The hero and examples show **real screenshots of builds that passed the critic**.
  - Until those exist, use a clearly labelled beta section with no fake output.

## 4. Order of work (start only after W-4: the U01–U15 re-run report)
1. Clone the template into `apps/www`, deploy it untouched on OpenNext, and post the preview URL.
2. Swap the sign-in to Supabase and connect the chat to the Studio agent backend: streaming, tool steps, credits, the Studio light.
3. Build the clean app per §2.
4. Build the website per §3.
5. **Owner preview (one look before switching):**
   - post a preview URL and 4 screenshots: Home, Pricing, empty chat, a chat mid-build;
   - one line to the owner: "Yes / change X". Wait for it.
   - *This is the only mid-way check-in. The owner asked for control over the design.*
6. **Gates before switching:**
   - Lighthouse ≥ 90 on Home and Pricing;
   - axe: 0 serious;
   - every flow works: sign-in, pairing, a build, credits going down, delete account.
   - **Fresh-critic "is it new" test:** a fresh critic sees the old and new screenshots side by side and answers "Is this clearly a different product design?" It must answer **yes**.
   - **The landing critic must score ≥ 8.**
7. **Switch:**
   - point `studpilot.app` to `apps/www`;
   - keep the old Worker routes for API and OAuth working.
8. **Demolition** (after 3 days live with no rollback):
   - delete `apps/site`, `apps/web`, the `apps/studio` UI and `packages/design` (git history keeps them);
   - remove their CI jobs;
   - update the docs.

## 5. Acceptance (W-done)
- Only `apps/www` serves pages.
- The CI checks from §1 are green.
- The owner said yes at step 5.
- The step 6 gates passed.
- The old front-ends are deleted.

## Owner revision — 2026-10-08

Website-only takeover and revised visual direction: the owner rejected the flat, square iteration and selected a **dark futuristic interface with lighting and rich motion**. See [the current review and validation limits](proof/W-2026-10-08/SUMMARY.md). Earlier website-only radius constraints are superseded by this decision. Public deployment still requires the visual review.

## Superseding owner brief — 2026-10-08

The owner rejected the preceding implementation and ordered a complete rebuild under the supplied SaaS brief: **Luminous Futurism, abundant animation/shimmer, an asymmetric hero with a live interactive/mock product preview, working theme/pricing controls, cohesive original assets, and an actual-token style tile.** Earlier hero-only and restrained-motion restrictions are superseded. The rebuilt public and signed-in experience is documented in [the current summary](proof/W-2026-10-08/SUMMARY.md), with [asset provenance](proof/W-2026-10-08/ASSET-PROMPT.md). There is no approval to replace the public website yet.


## Current visual directive — Cursor adaptation (2026-10-08)

The owner rejected the luminous redesign and any invented aesthetic. The new mandate is to reconstruct the supplied Cursor website and product-interface reference for StudPilot, researching the live site and many Google screenshots, including the real agent/editor/account surfaces. This supersedes the luminous-motion brief and older hero/layout restrictions. Use the measured warm neutral palette, typography scale, spacing, small radii, product previews and agent-workspace layout. Preserve StudPilot's actual backend and Studio integration; do not advertise Cursor capabilities that StudPilot does not provide. Evidence and the reference map: `planning/proof/W-Cursor-2026-10-08/`. Public deployment still awaits the existing owner visual acceptance.
