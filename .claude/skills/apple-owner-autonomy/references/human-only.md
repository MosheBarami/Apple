# Human-only actions — the complete list, and what to do instead

These four categories stay with the owner no matter who asks. Everything not on this list is yours.

| Category | Examples in this project | What you do instead |
|---|---|---|
| Moving money / billing | GitHub Actions blocked by a failed payment or spending limit; buying credits; changing a plan | Queue the one step ("GitHub → Settings → Billing → fix the payment method"). Keep verifying locally with the gate suite (`node scripts/gate-suite.mjs` or the per-package suites) so nothing waits on CI. |
| Creating an account | An OpenRouter account for a platform key; any new SaaS signup | Queue it. Ship the code path that activates automatically when the key appears (for example `env.OPENROUTER_API_KEY`), and label the feature honestly until then. |
| Passwords, 2FA codes, passkeys | A login page asking for a password; an MFA prompt during a publish; `claude auth login` landing on a password form | Go as far as the flow allows without typing a credential (an already-signed-in OAuth "Authorize" click is fine when the owner asked for that login). At the password/code field, stop that branch, queue it, continue elsewhere. |
| CAPTCHAs / bot checks | A captcha during a signup or publish | Stop that branch, queue it, continue elsewhere. |

Not human-only (do these yourself): deploying, committing, pushing, setting worker secrets you generate
in memory, running migrations on project infrastructure, publishing through a flow the owner told you to
run (Creator Store update of Apple Studio from his signed-in Studio), browser QA in his signed-in Chrome,
installing the local plugin build, restarting Studio, reading logs/Sentry/Supabase/Cloudflare.

Never, for any reason: read or print `.env` / `.dev.vars` / Keychain / browser password stores, copy a raw
secret into a prompt, log, commit, transcript or evidence file, or weaken RLS/auth to make something work.

## The owner queue format

`docs/autonomy/OWNER_QUEUE.md`, one item per line, newest first:

```
- [open] Q-003: <one plain sentence the owner can act on> — why: <what it unblocks> — Blocks findings: F-020, F-034
- [done] Q-001: … — done <date>
```

The Stop gate reads the "Blocks findings" ids of OPEN items and does not demand work on those findings.
Mark an item done the moment you see it done (for example, CI runs green again).
