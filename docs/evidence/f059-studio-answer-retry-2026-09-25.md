# Studio asset-source answer: retry boundary (2026-09-25)

F-059 remains **open**. The live Studio question and a successful library insert in the same run have not been observed.

## Failure and change

The Studio bridge previously removed a person's asset-source choice after any HTTP 200 poll. The worker can return 200 while reporting that it could not save the choice. The dock kept showing the question, but the bridge sent no choice on later polls. A regression case that returned `{ owed: true, message: "Apple could not save that. Try again." }` failed with `a rejected answer was not retried` before the fix.

The bridge now retains the choice only when the worker explicitly marks the failure as retryable. Invalid or account-restricted choices require a new choice from the person. The worker marks a failed write or failed preference refresh as retryable; it marks an invalid or policy-restricted choice as final. The absent-source policy still allows nothing.

Commits: `56032a6` (initial retry), `666ec60` (explicit retryable contract and permanent-refusal guard). The committed code was deployed in clean worker build `f14733d`; `/api/health` returned that SHA after deployment.

## Verification

- The Luau regression failed before the fix on both the transient failure and permanent-refusal cases, then the whole Studio plugin suite passed **58/58**.
- The worker's asset-source suite passed **7/7**. Worker and web TypeScript checks passed.
- A clean archive of `f14733d` passed **4,176/4,176** worker tests before deployment.
- GitHub Actions run [36089011844](https://github.com/MosheBarami/Apple/actions/runs/36089011844) passed all six jobs for `f14733d`, including the plugin build, typecheck, tests and Playwright smoke.
- The public Creator Store installation and a new Studio game run are still unverified. This source and deployment check does not close F-059.
