# F-067: flat scatter region no longer refused

The reported failure was the worker rejecting a `scatter_instances` region with a flat Y span
(`min.y == max.y`) before sending an operation to Studio. The regression uses that exact shape:
`min: [-40, 2, -40], max: [40, 2, 40]`. It asserts one scatter operation is sent, its Y ray
span contains the supplied height, its X/Z bounds are unchanged, and the result says the span was
widened. A second check confirms an inverted horizontal region is still refused with a valid-form
example. Both are in `apps/worker/tests/phase-a-tools.test.mjs`.

On 2026-09-25, `node --test apps/worker/tests/phase-a-tools.test.mjs` passed 20/20. Commit
`598d3e4` containing the fix is an ancestor of deployed worker build `f14733d`; the public
`/api/health` route returned HTTP 200 and `buildSha: f14733d` in the same check. The reported
worker-side refusal is therefore fixed in the live build. This evidence does not claim a new
Studio game run or that any scattered model was visually inspected.
