# M1 summary: rename to StudPilot and the move to studpilot.app (measured, 2026-10-04)

1. **Code:** `node scripts/check-old-names.mjs` reports CLEAN: every remaining "apple" or "golem" is on
   `planning/rename-allowlist.txt` with a reason and a removal condition. Before the cutover PR, the deployed
   bundle and 21 rendered routes passed `check-rebrand --deployed`.
2. **One Worker named `studpilot`**, renamed in place (same id), on copied stores.
   - D1: all 25 tables equal row for row (SHA-256 per row), and the old database is unchanged across the switch.
   - Vectorize: 9527 = 9527 vectors, the same top-5 results.
   - R2: 38 = 38 objects, 5,871,824 bytes, etags equal.
   - KV: same id, retitled `studpilot-kv`, 9 = 9 keys.
3. **Durable Objects:** all 12 namespaces hold the identical object-id sets after the cutover (golem's five are
   now `studpilot_Archive*`).
4. **Live on studpilot.app** after the switch:
   - a chat run completed in 12 s (152 neurons);
   - 200 of 201 project histories have the same message count, the 201st gained only the test chat, and none
     has fewer;
   - retrieval returns the same passages in the same order;
   - the site and app are byte-identical to the build.
5. **Old hosts:** a page load answers 301 to `studpilot.app`. API calls, including the published plugin's poll
   with `X-Golem-*`, pass through to `studpilot` (a plain 301 would break published plugins). The rename left
   the apple host unanswered for 11.5 s.
6. **Platforms:**
   - Supabase: project "StudPilot", Auth site URL `studpilot.app`.
   - Sentry: `studpilot-worker`, `studpilot-web`.
   - Discord: bot "StudPilot", interactions endpoint on `studpilot.app`.
   - GitHub: `MosheBarami/StudPilot` (the old URL answers 301).
7. **Not met yet, and why:**
   - Google and Discord sign-in (BLOCKED N2; email works).
   - A live pairing (N8; the old-host routes answer as the origin does).
   - The Discord app name (N3) and Stripe (X5, N5).
   - "No Cloudflare resource named apple or golem" holds only after the 7-day deletions on 2026-10-11
     (`deletions.md`), and after 2027-01-02 for the two stand-ins.
8. **Spend:** the month stands at $3.92 of the $25 cap. M1 testing cost under $0.01.
9. **Owner decisions D-1 to D-9** are applied (LOG.md). `BLOCKED.md` lists only what waits on the owner, with
   steps; **N1 (Turnstile hostname) is urgent**.
10. **Local folder:** renamed to `~/Developer/StudPilot` (D-6), with a symlink at the old path for now.
    **Owner: reopen Claude Code in `~/Developer/StudPilot`**; the memory was copied there. Eight sibling clones
    were deleted after their 133 refs were archived in the main repo.
