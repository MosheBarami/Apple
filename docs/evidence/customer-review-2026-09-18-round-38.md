# Harsh customer review — public docs focus/search (round 38)

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one fresh Chrome tab (`1045984509`) against the deployed public docs at
`https://apple.moshe-barami111.workers.dev/docs`, then closed the tab. This was a bounded,
read-only ordinary-user pass focused on keyboard focus and documentation search recovery. I did
not sign in, create an account, open a private project, submit a form, pair anything, pay, enter
credentials, upload or download files, or use Roblox Studio.

## Observed checks

### Keyboard focus — passed

**Repro:** Load `/docs`, press `Tab` repeatedly from the page body, and inspect the focused control
after each step.

**Observed:** Focus advanced through the skip link, home/navigation links, theme and sound
checkboxes, sign-in/account links, and finally the `Search the documentation` field. The focused
skip link and search field both had a visible high-contrast focus ring. With a filtered result set,
`Tab` moved from the search field to the first result link.

### No-results and recovery — passed

**Repro:** Focus the `Search the documentation` field, enter the exact query
`zzq-no-such-doc-20260918`, then recover with `Escape` or replace it with `credits`.

**Observed:** The page showed `Nothing matches “zzq-no-such-doc-20260918”.` while keeping the
search field focused. `Escape` cleared the query and restored the documentation navigation;
replacing it with `credits` produced `6 pages` and six visible result links. Focus remained in the
search field during both recovery paths.

## Verdict

No reproducible issue was found in this narrow public-docs focus/search pass. The keyboard path,
explicit empty state, and recovery behavior were understandable and directly observable.

## Coverage limits

This pass did not exercise account/private-project flows, forms, pairing, payments, credentials,
uploads/downloads, or Studio. It also does not establish anything about mobile layouts, backend
search indexing beyond the queries tested, or the behavior of pages reached by opening a result.
