# App screenshots, M2 step 2.3 (1440x900, dark)

Taken 2026-10-05 from the web app on a local Vite dev server, in a headless Chromium with every request that is not to the machine itself
aborted (nothing reached Supabase, Cloudflare or any provider). The signed-in screens are the app's **mock mode** (`?mock=1`, dev server only):
their projects, conversation, checkpoints and balances are fixtures for layout review, **not results**, and nothing here is a build of a game.

| File | What it shows | How it was reached |
|---|---|---|
| `01-signup-birth-date.png` | The email sign-up form with the neutral date of birth (day, month, year) | `/app/signup`, the real app (not mock); the project's settings request was aborted, so no Google or Discord button: today's state |
| `01b-signup-filled.png` | The same, filled in (a date under the line) | typed |
| `01c-signup-refused.png` | The kind refusal that replaces the form; nothing was sent (0 non-local requests) | submitted |
| `01d-signup-providers-preview-stubbed.png`, `01e-login-providers-preview-stubbed.png` | The Roblox, Google and Discord buttons under one "or" | **STUBBED**: the provider settings answer and the Roblox status answer were faked in the browser to see the buttons. Not today's state: both providers are off at the project |
| `02a-dashboard-before-create.png`, `02b-new-project-opened.png`, `02c-dashboard-after-create.png` | One click on "New project": the new "Untitled piece 1" conversation opens at once, and the card on the shelf | mock |
| `03-turn-empty-screenshot-strip.png` | The latest turn with the screenshots strip in its empty state: "Studio screenshots appear here while StudPilot builds" | mock (no frames) |
| `04-piece-history-by-request.png` | The Checkpoints drawer: grouped under the request that made each, "Earlier work", and "Saved by you" | mock |
| `05-pieces-settings-specimen.png` | The Pieces drawer with sample pieces, every one marked SPECIMEN (development only; production shows "Pieces appear here after a build") | mock / dev |
| `06a-connections-today.png` | Settings > Connections as it is today: no Google or Discord card | mock; the Roblox card's request is answered with a payload of the real shape (the mock app has no worker) |
| `06b-connections-providers-preview.png` | The Google (connected) and Discord (not connected) cards | mock with `?providers=google,discord&linked=google` (dev-only flags): a preview, not today's state |
| `06c-settings-share.png` | Settings > Share: the invite link and the "Made with StudPilot" line | mock |
| `07-usage-plans-beta.png` | The in-app plan ladder, labelled "Free while in beta. Paid plans start later." | mock |

Not saved: the screenshots strip with fixture frames (`?frames=1`): they are gradient renders made for layout review and could be mistaken for
Studio output.
