# Harsh customer review — 2026-09-18, round 15

Date: 2026-09-18 (Asia/Jerusalem)

Observed: 2026-09-18 04:00–04:12 IDT

## Scope and method

I used one fresh Chrome tab (`1045984396`) against the deployed site at
`https://apple.moshe-barami111.workers.dev`. I set the supported browser viewport to 390×844
and reviewed two small, read-only journeys:

1. The landing page’s `Open your workspace` link → the signed-in project shelf → the
   `Laundry Simulator` project whose shelf description says `Nothing built yet — open it and
   start describing`. I collapsed the project-stage panel, inspected the empty composer state,
   opened the mobile Conversations drawer, and exercised keyboard focus/close behavior.
2. From that drawer, the `Image verification — 18 Sep` project → its conversation and empty
   composer at the same viewport.

I did not type or submit a prompt, toggle Images, open an attachment picker, send or regenerate a
message, change settings, sign out, purchase, upload, pair/connect Studio, or alter project data.
I only used navigation, panel disclosure, focus, and Escape. The temporary viewport override was
reset and the tab was closed after inspection. I did not re-score the known public plugin
installation limitation.

## Settled observations

- At 390×844, the project header kept the hamburger, project title, `Studio ↗`, and `Project +`
  controls visible. Long titles were visually ellipsized in the header but remained available as
  their full accessible names.
- The mobile Conversations drawer opened as a 340×844 `dialog` labelled `Conversations`. Its
  single labelled close control was visible. Tab focus entered the drawer, stayed within its
  controls, and Escape closed it and restored focus to `Open navigation`.
- With the project-stage panel collapsed, the composer stayed within the viewport. The accessible
  label was `What should Apple build in your place?`; the placeholder was `Ask anything about
  your project...`. `Model: Apple` and `Images` were enabled; `3D`, voice input, and `Send` were
  disabled in the disconnected, empty state. Their visible/helper text explained the disabled
  state (`Connect Roblox Studio to use 3D` and `Voice input isn’t supported yet` in the
  accessibility tree). The body had no horizontal overflow (`scrollWidth=390`, `clientWidth=390`).
- Clicking the textarea exposed a clear focus-within border on the composer; Tab focus rings were
  visible on the model and Images controls. The helper text fit below the composer at this width:
  `↵ to send · ⇧↵ for a new line Apple can get things wrong. Check what it changed before you
  publish.`
- Neither project exposed a genuinely empty conversation: the shelf’s `Nothing built yet`
  project already contained historical messages, and the second project contained image-run
  history. Creating a new project was outside this read-only review, so the dedicated
  `What would you like to build?` start sheet was not claimed as observed.

## New finding

### P2 — Mobile navigation’s modal background is still exposed to accessibility, with an unnamed scrim button

**Repro:** At 390×844, open `Open navigation` in either project and inspect the settled DOM and
accessibility tree.

**Observed:** The drawer is `role="dialog" aria-modal="true" aria-label="Conversations"`, but the
same settled state also exposes the full underlying `main` in the accessibility tree, including
`Workspace navigation`, the expanded `Open navigation` button, the conversation, and the
composer. The underlying `main` has no `aria-hidden` and is not `inert`. In addition, the full
viewport `.gx-scrim` is a visible `<button>` with no accessible name or role (DOM geometry
390×844; `tabIndex=-1`). Keyboard Tab did remain trapped in the drawer, so this is not a reported
keyboard focus leak; it is the incomplete modal/a11y boundary and unnamed background control.

**Impact:** A screen-reader or accessibility-tree navigator can encounter an unnamed button and
background workspace content while the Conversations modal is open. The labelled close button is
clear, but the modal does not consistently communicate that the rest of the workspace is inert.

**Suggested fix:** Keep the scrim pointer-only and hidden from the accessibility tree (`aria-hidden`
plus its existing non-tab-stop treatment), and mark the underlying application content inert or
otherwise hidden from assistive technology while the drawer is open. Preserve the existing focus
trap and focus restoration.

## Verdict

The checked mobile composer controls fit and remain operable/readable without horizontal overflow;
empty Send/3D/voice states and focus indicators were explicit, and the drawer’s keyboard trap and
Escape restoration worked. The fresh issue in this narrow pass is the incomplete accessibility
isolation of the open navigation drawer. No new product claim is made about the unobserved empty
start sheet or any Studio/plugin action.

## Coverage limit

This covered the requested mobile navigation/composer/focus slice in two journeys (100% of this
pass’s planned coverage), not the whole product. I did not test a new project, anonymous signup,
prompt/build, model change, file selection, image generation, billing, pairing, or Roblox Studio.
No code or account state was changed.
