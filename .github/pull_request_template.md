## What this changes and why

<!-- One or two sentences. Name the user-visible behaviour, not the files. -->

## Checklist

**Generalization (the product builds anything, so a fix may not be about one thing)**
- [ ] I tried at least 3 requests per affected category that this change was NOT written against, each in a fresh chat on a clean Baseplate. Categories: single object, silly request, modify ("make it cooler"), map, system, UI, whole game. The requests and their results are listed below.
- [ ] No subject-specific code: nothing in the diff names the thing a test request asked for (a prop, a game genre, a map name). If a rule only helps when the request says "castle", it is not a fix.

**Tests**
- [ ] Tests were written red first: I saw each new test fail for the stated reason before the change, and pass after.
- [ ] CI is green on this PR, or the red checks are listed here with the reason they are not caused by this change.

**Measured live**
- [ ] What I measured against the live product or a real Studio session is stated below, with the number and how it was taken. "Looks right" and "the unit tests pass" are not a live measurement. If nothing was measured live, I say so.

**Safety**
- [ ] No secret, token, `.env` value, cookie or API key is in the diff, the description or the screenshots (this repository is public).
- [ ] No change to a wire literal or an infrastructure name (`golem.v1`, `X-Golem-`, worker, D1 or KV names) unless that is the point of the PR.

## Evidence

<!-- Unseen requests tried (>= 3 per category), the fresh-chat result for each, the live measurement, links to evidence files. -->
