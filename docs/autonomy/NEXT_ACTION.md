# NEXT ACTION

**Fix F-001 (critical): a tool call truncated at the provider output ceiling must never end a
customer run.** Then deploy and re-run the vis-01 lamp prompt in the paired Studio place, and read the
place back to prove the lamp exists.

Owner of the change: the worker run-loop (apps/worker/src/providers/workers-ai.ts decode +
apps/worker/src/do/session.ts history hygiene), after Track C of workflow wf_c5472c17-bf0 releases
those files. Falsification condition: the same prompt still ends `error` or builds nothing.
