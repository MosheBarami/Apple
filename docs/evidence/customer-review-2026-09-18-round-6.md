# Harsh customer review — round 6

Date: 2026-09-18 (Asia/Jerusalem)
Observed: 2026-09-18 02:39:52 +0300 (IDT)

## Scope and evidence

This was one bounded, fixture-only Chrome pass against `http://127.0.0.1:5179/app/` with the
local mock fixture (`VITE_APPLE_MOCK=1`). I opened the mock `Ember Halls` project in Chrome tab
`1045984301`, then closed that tab. This is not live backend proof and says nothing about paid
provider calls, deployment, Roblox Studio state, authentication, billing, or publishing.

I did not send or generate a request, sign in, pair Studio, start checkout, or spend anything. I
typed only an unsent local draft: `Round 6 draft — make the lobby warmer but keep the portal
centered.`

## Observed checks

### Model picker and upgrade route — passed in the fixture

The composer exposes an accessible `Model: Apple` picker. Its menu presents `Apple Free · limited
daily usage` as the selected option and `Apple MAX Subscribers · upgrade to unlock` as the other
option. Selecting Apple MAX navigated to `http://127.0.0.1:5179/app/usage`, where the mock shows
Today’s Credits and Free/Builder/Studio/Enterprise plan cards. I did not click a paid upgrade
button.

### Draft preservation — passed in the fixture

With the unsent draft present, I selected Apple MAX, observed the `/app/usage` route, returned to
the project list, and reopened `Ember Halls`. The composer still contained the exact draft text.
The draft was not sent or transformed.

### Readability, accessibility, and diagnostic banners — no reproduced issue

The rendered conversation screenshot showed white primary chat text on the black surface with
clear line spacing, and the composer text remained readable. The accessibility tree exposed names
for the composer, model picker, Images and 3D checkboxes, Studio-selection control, Templates,
attachment, and Send controls; the disabled voice control included an explanatory help label.
Expanding `View results` showed the code diff and Visual quality gate content. No diagnostic-image
banner was visible in the rendered chat during this pass.

## Verdict

No reproducible top-three UI bugs in this fixture-only round. The narrow checks above behaved as a
customer would expect, but they are not evidence of production readiness or live usage/billing
correctness.

## Coverage limit

This pass did not exercise a real run, live account, checkout, Studio pairing, image generation,
or Roblox place changes. Those remain unverified here.

## Follow-up pass after the local server restart

Observed during the resumed pass at 2026-09-18 02:47–02:49 +0300 (IDT), on a new local Chrome tab
`1045984305` (closed afterward):

- The current separate `ProductModel` picker behaved as a two-option menu: `Apple Free · limited
  daily usage` was selected, while `Apple MAX Subscribers · upgrade to unlock` was exposed as a
  menuitemradio. MAX navigated to `/app/usage`; browser Back returned to the same project and kept
  the exact unsent draft `Round 6 current pass draft — keep this unsent text.`
- The full-width chat remained concise and readable in the rendered dark screenshot. No diagnostic
  image banner appeared.
- The mock does not actually offer a disconnected Studio state: its socket fixture marks Studio
  connected for every project. On the unlinked `The Long Quarry` project, the AX tree still exposed
  an enabled `3D` control and `2 selected`, and initially announced `Studio connected · Ember Halls`.
  A read-only DOM check confirmed the visible `3D` button had `disabled: false`. Therefore the
  intended “3D disabled without Studio” state was not verifiable in this fixture; this is a
  fixture-state limitation, and the cross-project connection/transcript reuse below is recorded as
  a fixture-only defect, not live-product proof.

### Reproduced fixture-only defects

1. `The Long Quarry` (shown as `9d`, unlinked, with no place name) rendered the `Ember Halls`
   conversation verbatim, including the golden portal request and the 6.5/10 visual-gate reply.
   The mock history is not scoped to the selected project, so a customer reviewing another project
   could mistake another project's work for theirs.
2. The same unlinked project showed `Studio connected · Ember Halls`, a selected Studio reference,
   and an enabled 3D control. This is inconsistent project scoping in the mock and prevents a
   trustworthy visual check of the disconnected/disabled-3D path.

No send, generation, sign-in, checkout, pairing, account write, or paid call occurred.
