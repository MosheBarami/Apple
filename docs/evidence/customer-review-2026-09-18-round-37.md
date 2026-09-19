# Customer review — 2026-09-18, round 37

## Scope and method

I used one Chrome tab against the deployed public site and read only the public
[Privacy Policy](https://apple.moshe-barami111.workers.dev/privacy) and
[Privacy & data](https://apple.moshe-barami111.workers.dev/docs/privacy-and-data) pages. This was
read-only: I did not sign in, open an account or project, submit a form, pair Studio, send a
prompt, pay, upload/download, or change data. This is a review of user-facing copy only; it does
not verify the underlying data handling or retention behavior.

## New findings

### P2 — The public privacy copy gives conflicting access boundaries for checkpoints

**Observed:** The Privacy Policy says checkpoints are **“only readable by you.”** Its processor
section also says Cloudflare hosts **“project session storage (including chat history and
checkpoints).”** The public Privacy & data page then says **“Nobody else”** can read data, but in
the same section says **“Operators can access production systems for debugging under access
controls.”** Neither page explicitly excludes checkpoint content from that operator statement.

**Inference:** A customer can reasonably read the absolute “only readable by you” sentence as
meaning that operators cannot access checkpoint content, while the later copy leaves operator
access to production data open. This is a copy contradiction, not evidence that an operator has
actually read a checkpoint.

**Suggested fix:** State one precise boundary in both places: either explicitly exclude checkpoint
content from operator access, or replace the absolute claim with the controlled-access rule and
say what support/debugging access can include.

### P2 — The privacy-policy short version overpromises complete export and deletion

**Observed:** The Privacy Policy’s short version says customers can **“download everything we hold
about you from your account settings”** and **“delete it from the same page.”** Later, that policy
says the export names things it does not contain, and its deletion section says the sign-in
identity plus the usage ledger and support messages survive account deletion; backup copies can
remain for up to 30 days. The Privacy & data page repeats those export omissions and deletion
exceptions.

**Inference:** The later detail qualifies the promise, but the first “everything”/“delete it” copy
can lead a customer to expect a complete one-file export and total erasure. This is an observable
documentation inconsistency, not a claim about what the settings controls actually do.

**Suggested fix:** Make the short version say that the settings export covers account/workspace
data and that accounting/support records and backup copies follow the stated retention windows;
link directly to the exceptions.

## Coverage limit

No account, private project, Studio, billing, credentials, pairing, or data-export/deletion flow
was opened. No underlying storage or retention behavior was independently verified.
