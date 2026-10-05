# App screenshots, M2 step 2.3 (1440x900, dark)

**Fix cycle 1 (2026-10-05) retook the screens it changed, from the same kind of local dev server: `01c`, `01d`, `01e`, `02b`, `04`, `05`, and added `01f`, `03a`,
`03b`, `08`, `09`; the old `03-turn-empty-screenshot-strip.png` is gone (its sentence was the stale one).** The rest (`01`, `01b`, `02a`, `02c`, `06a` to `06c`, `07`)
render nothing that cycle changed (no menu, no strip, no date row below 400px, no search count) and were not retaken.

Taken 2026-10-05 from the web app on a local Vite dev server, in a headless Chromium with every request that is not to the machine itself
aborted (nothing reached Supabase, Cloudflare or any provider). The signed-in screens are the app's **mock mode** (`?mock=1`, dev server only):
their projects, conversation, checkpoints and balances are fixtures for layout review, **not results**, and nothing here is a build of a game.

| File | What it shows | How it was reached |
|---|---|---|
| `01-signup-birth-date.png` | The email sign-up form with the neutral date of birth (day, month, year) | `/app/signup`, the real app (not mock); the project's settings request was aborted, so no Google or Discord button: today's state |
| `01b-signup-filled.png` | The same, filled in (a date under the line) | typed |
| `01c-signup-refused.png` | The kind refusal that replaces the form; **the heading has taken focus** (the ring shows because the form was submitted with the keyboard). The submit made 0 non-local requests (the one request before it was the project's settings read on page load, aborted) | submitted with Enter |
| `01d-signup-providers-preview-stubbed.png`, `01e-login-providers-preview-stubbed.png` | The Roblox, Google and Discord buttons under one "or"; **all three now have the same 1px hairline and 46px height** (measured: `1px solid rgb(55, 59, 68)`, 46, 46, 46) | **STUBBED**: the provider settings answer and the Roblox status answer were faked in the browser to see the buttons. Not today's state: both providers are off at the project |
| `01f-signup-date-row-320px.png` | The date row on a 320px-wide phone: "September" is whole, and the year was typed in **Arabic-Indic digits (٢٠١٠) and arrived as 2010** | typed |
| `02a-dashboard-before-create.png`, `02b-new-project-opened.png`, `02c-dashboard-after-create.png` | One click on "New project": the new "Untitled piece 1" conversation opens at once, and the card on the shelf (`02b` retaken: the workspace's invite icon is gone) | mock |
| `03a-turn-finished-no-screenshots-studio-connected.png` | A finished request that took no screenshot, Studio connected: **nothing under the steps** (the strip draws no box; there is nothing to do) | mock |
| `03b-turn-finished-no-screenshots-studio-off.png` | The same with Studio not connected (`?studio=off`, development only): "No screenshots were taken for this request. Connect Studio to see them next time." | mock |
| `04-piece-history-by-request.png` | The Checkpoints drawer: grouped under the request that made each (the time alone for today; an earlier day shows its date, covered by a test, since the mock's times are all today), "Earlier work", and "Saved by you" | mock |
| `05-pieces-settings-specimen.png` | The Pieces drawer with sample pieces, every one marked SPECIMEN. **Development only: a production build offers no button, command or drawer for it before M5** | mock / dev |
| `08-enlarge-dialog-buttons.png` | The enlarged screenshot's Earlier (disabled, quiet) and Later (focused, with the ring), cropped to the buttons: 72x36 each. The picture itself is a fixture gradient and is not saved | mock with `?frames=1` |
| `09-dashboard-project-menu.png` | A project's menu on the shelf: "Invite a friend to StudPilot" (was "Copy invite link") | mock |
| `06a-connections-today.png` | Settings > Connections as it is today: no Google or Discord card | mock; the Roblox card's request is answered with a payload of the real shape (the mock app has no worker) |
| `06b-connections-providers-preview.png` | The Google (connected) and Discord (not connected) cards | mock with `?providers=google,discord&linked=google` (dev-only flags): a preview, not today's state |
| `06c-settings-share.png` | Settings > Share: the invite link and the "Made with StudPilot" line | mock |
| `07-usage-plans-beta.png` | The in-app plan ladder, labelled "Free while in beta. Paid plans start later." | mock |

Not saved: the screenshots strip with fixture frames (`?frames=1`): they are gradient renders made for layout review and could be mistaken for
Studio output.
