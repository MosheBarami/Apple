# Customer review — 2026-09-18, round 11

Scope: fresh, bounded, read-only review of `https://apple.moshe-barami111.workers.dev/app/settings` in a dedicated Chrome tab. I did not change preferences, toggle controls, save, submit, generate a code/key, open destructive actions, or transmit credentials. The tab was closed after inspection.

## Observed state

- The page loaded signed in as `moshe.barami111@gmail.com` and settled from transient loading text to concrete states: two-step verification `Off`; account history `Nothing has been recorded on this account yet.`; Roblox `No Roblox account is connected.`; API keys `You have no API keys.`.
- The Roblox connection card remains expanded while disconnected and exposes an enabled `Connect` submit button. Its `Roblox user id` field visibly/AX-reportedly contains `moshe.barami111@gmail.com` (the signed-in email), despite its numeric-ID placeholder (`e.g. 11279664020`). This is misleading and risks a failed or misdirected connection attempt: disconnected status is clear, but the prefilled identifier is the wrong kind of value.
- The Roblox permission list is hard to scan visually and for assistive technology. Labels and explanations are concatenated without a separator, e.g. `Read your assetsApple can look up...`, `Create assets in your accountApple can upload...`, `Read your public profileApple can read...`, and `Let others use your assetsApple can grant...`. The same mashed strings appear in the AX label output, so this is not only a visual spacing issue.
- The Discord card shows a project selector (`Image verification — 18 Sep`) and an enabled `Get a code` button, but no status such as connected, disconnected, pending, or unavailable for the selected project. The surrounding sentence says how to connect, but a customer cannot tell the current connection state without initiating the code flow (which was intentionally not done).
- The adjacent privacy copy says `Your projects are private. Apple never trains on your work.` while the next control offers `Contribute anonymised snippets to improve Apple — optional, off by default, revocable any time.` The opt-in qualifier softens the apparent conflict, but the absolute “never” wording is ambiguous about whether anonymised project-derived snippets count as “your work.”

## Keyboard and disclosure checks

- `Skip to content` is present in the accessibility tree and reachable in reverse tab order. The first visible focus ring on the settings search field was high contrast and clearly visible.
- Native inputs, selects, radios, checkboxes, and action buttons were present in the tab sequence. Disabled `Change`, `Change password`, `Save asset sources`, `Save notification settings`, and `Everything is already default` controls were exposed as disabled; no disabled action was invoked.
- Settings sections are persistently expanded. Native select controls are collapsed by default and exposed in AX as popup buttons with an `Expand` action; no option was selected or changed during this review.

## Customer impact / priority

1. **P1 — wrong Roblox identifier prefill:** a disconnected user is shown an email in a field labelled as a numeric Roblox user ID. Clear the field or populate it only from a validated Roblox ID; do not infer it from the Apple email.
2. **P1 — permission disclosure is mashed together:** missing whitespace/punctuation between each permission name and its explanation makes high-impact Roblox scopes difficult to understand and produces joined screen-reader labels. Separate the name and explanation in both rendered text and accessible naming.
3. **P2 — Discord connection state is undisclosed:** show an explicit per-project state (`Not connected`, `Connected`, `Code pending`, or `Unavailable`) next to the project selector and keep `Get a code` as the action.
4. **P2 — privacy wording is ambiguous:** qualify “never trains on your work” with the opt-in boundary or rewrite the two adjacent statements so their relationship is unambiguous.

No deployment or code change was made in this review.
