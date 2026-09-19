# Customer review — 2026-09-18, round 18

## Boundary

- Fresh-context, ordinary-customer review of the live site at `https://apple.moshe-barami111.workers.dev` in Chrome, approximately 05:02–05:04 Asia/Jerusalem (the status page displayed `Last checked 5:02:39 AM`; the settings page displayed `Sep 18, 2026, 5:02 AM GMT+3`).
- Public surfaces visited: `/`, `/pricing`, `/status`, `/docs/plugin`, and `/docs/credits-and-limits`.
- Signed-in surfaces visited through the already-authenticated browser session: `/app/usage` and `/app/settings`. The account email is intentionally omitted here.
- No existing project or Roblox place was opened. No build, payment, credential/key entry, preference save, upload, publication, deletion, or account/security action was performed. The settings search box was filled with `timezone` only to check filtering; it was not a saved preference.
- The live UI was the only source for this review. This report does not infer model identity from historical usage rows.

## Overall opinion

The public copy is more honest than the core product readiness: the status, pricing, and plugin documentation repeatedly say that public Studio installation is unavailable and that paid checkout is not open. An ordinary new customer can sign up and chat, but cannot complete the promised inside-Studio workflow. The signed-in account also exposes what looks like seeded/internal usage data, which damages confidence in the quota meter even if it is isolated to this account.

## Findings

### P1 — The core new-customer Studio journey is unavailable (known blocker, not a new UI regression)

**Observed reproduction**

1. On `/`, the hero says “Built with you, inside Roblox Studio,” while the early-preview note says “Public Studio installation is not available yet.”
2. On `/pricing`, Free lists “Studio integration · public installation pending”; the comparison table says “Roblox Studio plugin — Public installation unavailable” for every plan; the page also says paid checkout is not open.
3. On `/status`, the API is shown as operational (17 ms in this observation), but the known issue says: “New customers can use chat, but cannot build inside Studio without an existing working plugin connection.” It gives no public workaround or confirmed release date.
4. `/docs/plugin` repeats “Public installation is unavailable,” says the previous Creator Store listing was removed, and says the replacement is only being tested locally and is not published or approved for distribution.

**Customer impact / opinion**

For a new customer, the product's defining Roblox outcome is blocked. Chat is available, but the customer cannot reach the advertised place where Apple reads and edits the customer's Studio project. This is a release/acquisition blocker even though the disclosure is clear; it should not be described as a working end-to-end Studio product until the public install path exists.

**Scope not verified**

I did not open Studio, a place, or an existing plugin connection, so I did not test whether an already-connected customer's plugin still works. The status page itself is the evidence for the new-customer limitation.

### P1 — The signed-in free account shows an implausible purchased-credit balance

**Observed reproduction**

1. Open `/app/usage` in the existing signed-in session.
2. The page identifies the active plan as Free and shows `231` of `231` daily Credits remaining, with a reset in `22h`.
3. Immediately below the meter it displays `999,999,593 purchased credits, which do not expire — spent only once the allowance is gone`.
4. Opening the workspace navigation repeats the balance and adds `about 12987010 more builds`.
5. The public `/pricing` page says paid checkout is not open and labels Builder and Studio as planned/unavailable, so an ordinary preview customer has no visible purchase path that explains this balance.

**Customer impact / opinion**

This looks like test/admin data leaking into a customer-facing quota surface. It makes the usage meter and the meaning of the daily hard ceiling hard to trust; it also suggests that this account can effectively ignore the advertised quota once the daily allowance is spent. That is a P1 trust risk if representative of customer accounts, even though no purchase or spend was performed in this review.

**Scope not verified**

I did not spend or alter Credits, and I cannot tell from the UI whether this is an isolated seeded account, a grant/refund artifact, or a broader production-data problem. Recheck with a fresh ordinary account before treating the balance as systemic.

### P2 — The usage breakdown exposes an opaque internal-looking label

**Observed reproduction**

1. On the same `/app/usage` page, scroll/read “What those Credits went on.”
2. The only list item is `Usage stone 455`.
3. The “Last 30 days” chart shows `224 Credits` on Sep 16 and `231 Credits` on Sep 17 (455 total), but the breakdown supplies no date, run, mode, project, status, or plain-language explanation.

**Customer impact / opinion**

The heading promises to explain what Credits went on, but “Usage stone 455” is not an auditable customer explanation. A customer cannot tell which request consumed the 455 Credits or whether it was a build, a failed run, or something else. The label should be treated as opaque telemetry/test data, not as a meaningful model or work-mode name.

**Scope not verified**

This was one signed-in account's current history. I did not open a project or infer any product/model identity from this historical row; I do not know whether other accounts see the same label. Root-side work may be correcting this state, so this exact observation is a pre-deployment snapshot.

### P2 — Plan copy leaves collaboration entitlement ambiguous

**Observed reproduction**

On `/pricing`, the Free and Builder cards do not list shared projects, while the Studio card lists “Shared projects.” The same page's “What each plan includes” table marks “Shared projects and collaborators” as `Included` for Free, Builder, Studio, and Enterprise. The page explains that cards describe what a tier adds, but a customer reading the cards first receives the opposite impression from the comparison row.

**Customer impact / opinion**

The page does not give one unambiguous answer about whether collaboration is a Free capability or a Studio differentiator. A customer could reasonably choose or reject a plan based on the wrong interpretation. This is a copy/entitlement-communication issue; it is not proof that the backend grants or denies collaboration.

**Scope not verified**

I did not open a project or attempt collaboration. The comparison table was the only entitlement signal checked.

## Honesty and usability positives

- `/status` explicitly limits the meaning of “API operational”: it says the check does not verify Studio, builds, or billing. That is a good guard against a false-green status claim.
- `/pricing` clearly says paid checkout is not open, labels the paid plans as planned, and explains that Agent usage is metered against actual work rather than promising a fixed cost.
- `/docs/plugin` does not invent a download workaround or release date; it says the local replacement is not a released plugin.
- `/app/settings` clearly warns about irreversible Roblox asset/game-pass/permission consequences before any key is connected. No key was entered.
- Settings search works as expected: entering `timezone` filtered the page to the Language and region / Time zone control and its explanatory text.

