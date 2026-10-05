# App screenshots, M2 step 2.3 (1440x900, dark)

**Fix cycle 3 (2026-10-05) retook `10` (the full-width anchor buttons now take a `<button>`'s 20px line, so the primary anchor is 46px and not 47.7px, and the card
under it moved up by 1.7px).** Nothing else here changed on screen: `01d`, `01e` and `03b` were re-shot on the final tree and compared pixel by pixel with the committed
files: `01d` and `01e` differ in 81 and 83 pixels, all inside one 10 by 10 square above the logo (the animated dot), nowhere near the three buttons, and `03b` in 519
pixels, in three 26-pixel-wide icons far from the strip (an animation), with the strip's sentence unchanged, so the committed files stay. The state cycle 3 added to the
strip (no line at all until the page has heard whether Studio is connected) draws nothing, so it has no picture, and the mock app is always "heard".

**Fix cycle 2 (2026-10-05) retook `03b` (the strip's line under a finished turn changed) and added `10` (a primary anchor button on the sign-in family's screens, which the
cycle 1 hairline rule had changed and cycle 2 restored).** `01d` and `01e` were re-shot on the final tree and compared pixel by pixel with the committed ones: the three buttons
(Roblox, Google, Discord) are unchanged (the only differing pixels, 82 and 97, are a ten-pixel animated dot above the logo and, on the sign-in screen, the card's rounded top
corners: nowhere near the buttons), so the committed files stay. The same measurement, taken in the browser on the final tree: all three still `1px solid rgb(55, 59, 68)`, 20px line, 46px high.

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
| `03b-turn-finished-no-screenshots-studio-off.png` | The same with Studio not connected (`?studio=off`, development only): "No screenshots to show for this request: they are kept only while this tab stays open, so a reload clears them. To see them next time, connect Studio and keep this tab open during the request." (retaken in fix cycle 2: the page cannot know that none were taken, since a reload clears its frames) | mock |
| `04-piece-history-by-request.png` | The Checkpoints drawer: grouped under the request that made each (the time alone for today; an earlier day shows its date, covered by a test, since the mock's times are all today), "Earlier work", and "Saved by you" | mock |
| `05-pieces-settings-specimen.png` | The Pieces drawer with sample pieces, every one marked SPECIMEN. **Development only: a production build offers no button, command or drawer for it before M5** | mock / dev |
| `08-enlarge-dialog-buttons.png` | The enlarged screenshot's Earlier (disabled, quiet) and Later (focused, with the ring), cropped to the buttons: 72x36 each. The picture itself is a fixture gradient and is not saved | mock with `?frames=1` |
| `09-dashboard-project-menu.png` | A project's menu on the shelf: "Invite a friend to StudPilot" (was "Copy invite link") | mock |
| `10-auth-primary-link-button.png` | A primary anchor button (`<Link className="btn btn-primary btn-block">`) on `/app/reset` with no link: the accent fill, **the accent border and 46px height** (measured `1px solid rgb(166, 124, 255)`, 20px line, 46). Before cycle 3 it was 47.7px (a 21.7px line against a `<button>`'s 20px); with the cycle 1 rule `.auth-page a.btn` put back it measured `1px solid rgba(255, 255, 255, 0.12)` | the real app (not mock), signed out |
| `06a-connections-today.png` | Settings > Connections as it is today: no Google or Discord card | mock; the Roblox card's request is answered with a payload of the real shape (the mock app has no worker) |
| `06b-connections-providers-preview.png` | The Google (connected) and Discord (not connected) cards | mock with `?providers=google,discord&linked=google` (dev-only flags): a preview, not today's state |
| `06c-settings-share.png` | Settings > Share: the invite link and the "Made with StudPilot" line | mock |
| `07-usage-plans-beta.png` | The in-app plan ladder, labelled "Free while in beta. Paid plans start later." | mock |

Not saved: the screenshots strip with fixture frames (`?frames=1`): they are gradient renders made for layout review and could be mistaken for
Studio output.
