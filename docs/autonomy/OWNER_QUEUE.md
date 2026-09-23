# OWNER QUEUE

Only the actions that stay human-only (payments, account creation, passwords/2FA, CAPTCHAs, security
settings of an account) — see `.claude/skills/apple-owner-autonomy/references/human-only.md`. Everything
else is done by the agent without asking. Each item is one step; the product is built to switch on by
itself when the step is done.

Line format (read by `.claude/hooks/autonomy_stop_gate.py`):
`- [open|done] Q-NNN: <the step> — why: <what it unblocks> — Blocks findings: <ids or none>`

- [done] Q-004: in a terminal run `claude auth login`, approve in the browser, and paste the code it shows back into the terminal — why: the unattended supervisor (scripts/autonomy-supervisor.py) runs fresh `claude -p` sessions and the CLI is logged out; the agent can open the page but must not type the authorization code — Blocks findings: none — done 2026-09-23: `claude auth status` → loggedIn true (claude.ai)
- [open] Q-005: in Roblox Studio, click **Don't Save** on the "Save changes to Apple-Mission2b-Baseplate.rbxl?" prompt — why: it belongs to a macOS panel process the agent's Studio permission does not cover, and until it closes Studio cannot be relaunched on the fresh place for the next mission run — Blocks findings: none (F-049 re-run waits on it)
- [open] Q-001: GitHub → Settings → Billing and plans → fix the failed payment or raise the Actions spending limit — why: CI has not run a single job since 2026-09-21 ("recent account payments have failed"); the agent verifies with the local suites meanwhile — Blocks findings: none
- [open] Q-002: (optional) create an OpenRouter account and add its key as the worker secret OPENROUTER_API_KEY, or tell the agent where it is stored — why: free models then work for customers without their own key; the code already switches on by itself when the secret exists — Blocks findings: none
- [open] Q-003: Supabase dashboard → Authentication → Settings → turn on leaked-password protection — why: F-017 (an account security setting the agent does not change) — Blocks findings: F-017
