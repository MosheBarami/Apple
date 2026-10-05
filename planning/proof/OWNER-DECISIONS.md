# Owner decisions: answers to Claude Code's open questions (2026-10-04, via the planning session)

These are final. Apply them and record each one in the milestone LOG where it belongs.

## M1 items found in `planning/proof/M1/LOG.md`
| # | Question | Owner decision |
|---|---|---|
| D-1 | The owner's 4 old golem-era project histories (128 messages, owner and test accounts) | **Delete after the 7-day hold.** Do not import them. The local export in `~/Developer/RbxAI-archive/golem-sessions-2026-10-04/` stays as the backup. |
| D-2 | 48 orphan `golem_SessionDO` objects, plus the archive gap (account erasure does not purge `Archive*` classes) | **Delete the 48 orphans and the whole golem archive after the 7-day hold.** Record it in `deletions.md`. This closes the erasure gap. |
| D-3 | `ROBLOX_CREATOR_USER_ID` (uploads to the owner's Roblox account) | **No. Never set it.** Uploads go only to each user's own account via Roblox OAuth (`asset:write`). |
| D-4 | Spend caps (owner action X3) | **Approved:** $1.65/day and about $25/month (150,000 / 2,270,000 billable neurons). |

## Other owner decisions
| # | Item | Owner decision |
|---|---|---|
| D-5 | Global free-user spend pool (M6) | **$5 per month** for all free users combined (= 100 credits ≈ 70 builds). When it is used up, free building pauses until the next month, with a friendly message. |
| D-6 | Local folder rename (M1 step 1.6) | **Yes.** At the end of M1, rename `~/Developer/RbxAI` → `~/Developer/StudPilot` and fix the paths. Tell the owner in SUMMARY.md to reopen Claude Code in the new folder. |
| D-7 | Unused keys in `.env` (Clerk, Vercel, Resend) | **Keep them.** Do not remove them. |
| D-8 | Supabase custom auth domain (paid) | **No.** Keep the free `*.supabase.co` auth address. |
| D-9 | `.env` access | Agents have full read and write access (owner, 2026-10-04). Never print or commit the values. |

## Still waiting on the owner (keep these in BLOCKED.md; do not wait on them)
- **X1:** close the Codex app fully.
- **X4:** regenerate the Roblox OAuth secret. Due before public launch.
- **X5:** an adult Stripe account holder. Due before charging.
- **X6:** a trademark check for "StudPilot". Due before public launch.
- **X7:** the plugin publishing decision. Due after M7.
- **X8:** the hidden test set. At M7 only.
- **X9:** record the <1-minute OAuth demo video and submit it for review. At M7; Claude Code prepares the script.
- **Optional:** a Cloudflare API token for `CF_ANALYTICS_TOKEN` (analytics readback). Try to create it via the API first; if that is not permitted, list it here with click-by-click steps.

## Owner update, 2026-10-05 (in chat)
| # | Item | Owner decision |
|---|---|---|
| D-10 | N1, O2, N8, N3, X1 | **Done by the owner.** Turnstile allows `studpilot.app`; Sign in with Roblox works; a live pairing works; the Discord app is renamed; Codex is closed. |
| D-11 | N2 (Google and Discord sign-in) | Enable both providers in Supabase from the four `.env` lines, update `/privacy`, verify both sign-ins live. |
| D-12 | X6 (trademark) | **No conflict found** for "StudPilot". Recorded in `planning/proof/M7/trademark.md`. |
| D-13 | N6 (operator and inbox) | **Operator: StudPilot. Contact: support@studpilot.app.** Replace every "Apple Labs" and the old Gmail address everywhere. Cloudflare Email Routing forwards support@ to the owner's Gmail. |
| D-14 | N7 (legal review) | **Approved after these fixes:** account deletion removes the sign-in identity and the Discord link automatically; AI Gateway logs are kept 30 days, stated on `/privacy`; all Roblox-derived data is deleted if StudPilot loses Roblox API access; the `/privacy` short version becomes 6 plain bullets (what we collect, never sold, Roblox data never trains AI, download or delete anytime, 13+, contact). |
| D-15 | The named operator | Added to BLOCKED.md under "Before charging money": an adult or a company must become the named operator. |
| D-16 | BLOCKED.md | Keeps only X4, X5, N5, X7, X8, X9 and N4, plus D-15. |
