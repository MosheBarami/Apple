# AI builder stalls and empty completion reports

Reported 2026-10-08 in an existing authenticated conversation. Inspection found three builder tasks returned empty or cut-off reports over roughly twelve minutes, with no write operations in the recorded plugin log. The root conversation was already settled when inspected. Its recorded Studio place is now disconnected.

## Reproduced causes

The actual Flue coordinator + delegate + Cloudflare provider path was run locally with a fake AI binding and fake Studio gate, never a paid provider. All four requests sent reasoning_effort=medium, bypassing the low fallback in withAgentDefaults. The regression assertion failed before the fix.

A reasoning-only child response ending with finish_reason=length was also reproduced through the real runtime. It became a successful task with no text. The regression assertion requiring output-error failed before the fix. The historical child finish_reason is not exposed by the public snapshot, so its exact token-limit termination is not claimed as directly observed.

## Change

- Set thinkingLevel=low at the root model hook; delegates inherit it. Keep the 6,500-token cap and all budget/credit gates.
- Guard streaming responses: length exhaustion and reasoning-only empty completion fail visibly rather than becoming successful delegates. Preserve normal answers, tool calls, UTF-8 and streaming headers.
- Bound first-response and idle-stream waits at 60 seconds through the existing provider options.
- Instruct the coordinator to retry a failed teammate once at most.
- Add Stop working through the SDK's authenticated abort endpoint; preserve the draft and display a retryable stop failure.
- Show empty historical delegate reports as No result, with actual returned text available in the task details.
- Stamp Studio deployments in /studio/api/health and verify that marker, alongside the existing assets check.

## Validation before deployment

- 26/26 Studio tests passed, including real-runtime coordinator/delegate requests and exhausted-child failure.
- 29/29 website browser scenarios passed.
- 3/3 stop/draft/retry browser checks passed, including mobile and desktop.
- Studio and www TypeScript passed. check-www clean, 111 files. Studio production build passed.
- At 390x844, Stop and project-drawer controls were measured separately with no overlap.
- Before live testing, /api/admin/spend reported month $7.21 / 655,559 billable neurons, today 9,721 neurons, kill switch false.

Live verification and remaining connection limits are recorded in the private local result after deployment. No test claims that the original island was built.
