# Customer review — 2026-09-18, round 12

Scope: fresh, bounded, read-only review of the live settings page at
`https://apple.moshe-barami111.workers.dev/app/settings` in a dedicated Chrome tab. I checked
only the Roblox connection form for readability and explicit status copy, then inspected one
notification delivery menu without changing its value. I did not enter credentials, toggle a
control, save, submit, generate a code or key, open a destructive action, touch Roblox Studio, or
change a project. The tab was closed after inspection.

## Observed state

- The Roblox card clearly states `No Roblox account is connected.` The disconnected state is
  visible above the form and is also exposed in the accessibility tree; it is not represented by a
  blank card or a spinner.
- The connection inputs are now individually readable: `Open Cloud API key` with `Paste your key`,
  `Roblox user id` with a numeric example, and `Expires on (optional)` with a date-format hint.
  The user-id field was empty; it no longer contains the signed-in email or another value of the
  wrong type.
- `Acting as` is a labelled group with `My account` selected and `A group I own` available. The
  `What Apple may do` permissions are separated into distinct rows with visible labels and
  explanations. The permanent-effect warnings for asset creation, game-pass creation, and sharing
  permissions are visually distinct and remain readable.
- The notification delivery control is labelled `Delivery`, currently `Tell me as things happen`,
  and exposes exactly three choices in the read-only accessibility/DOM view: `Tell me as things
  happen`, `Once an hour`, and `Once a day`. I did not select an option. Quiet hours are explicitly
  described as inactive when both fields are left empty, and the two account/billing notification
  kinds are visibly marked `Always on` and disabled.

## Result

No new customer-facing defect was found in this bounded pass. The round-11 findings in this scope
were visibly resolved: the Roblox identifier is no longer misleadingly prefilled, permission name
and explanation text is separated, and the checked connection/status copy is explicit. The single
notification menu also presents a clear current value and complete choices without requiring a
change to discover them.

## Coverage limit

This was one connection-form journey plus one notification-menu read-only check. I did not test a
real Roblox key, form validation or submission, notification saves, other settings sections, a
Discord flow, projects, providers, billing, or Roblox Studio. No deployment or code change was
made in this review.
