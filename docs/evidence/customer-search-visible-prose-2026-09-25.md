# Customer search uses the same prose as the transcript

Measured 2026-09-25 UTC. The assistant transcript already removed spilled Studio wire objects from its visible reply, but project search indexed the raw `messages.content`. A search for `className` could therefore return a technical snippet the conversation did not show. The person's own messages remain searchable verbatim.

Commit `e63b2c1` moved the existing narrow wire detector into `@golem/shared`; the web transcript and the worker search now call the same function. The worker converts non-user message content to visible prose before `runSearch` builds snippets. SQL may read a raw candidate, but `runSearch` cannot return a hit absent from visible prose.

Evidence:

- The new assistant-search test failed first because `customerMessageSearchText` did not exist; after the change, the combined focused suite passed 82/82. It proves a visible sentence is found and a hidden `className` object is not, while the person's own message is unchanged.
- Working tree: worker 4,187/4,187; web 2,428/2,428; worker and web typechecks passed.
- Clean `git archive HEAD` export: worker 4,176 pass, 0 fail, 2 skipped; web 2,428 pass, 0 fail; worker, web and shared typechecks passed; web production build succeeded.
- `infra/deploy-static.mjs --only web` verified all 38 served files. An independent `curl` read of `/app` matched the export's `index.html` bytes.
- `infra/deploy-worker.mjs apple --build-sha e63b2c1` verified the deployed SHA. An independent `/api/health` request returned `ok: true`, `buildSha: e63b2c1`.
- GitHub CI run [36086755107](https://github.com/MosheBarami/Apple/actions/runs/36086755107) completed successfully: all six jobs, including root tests and Playwright smoke, were green.

Limit: the round-7 project has no assistant message containing this wire pattern, so this was not reproduced through authenticated live search. The search privacy claim is supported by the shared function, focused test, clean build and deployed bytes, not by a customer click on a matching historical record.
