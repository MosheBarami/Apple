# Bounded read/edit workflow: live proof, 2026-09-26

## Measured prior failure

AI Gateway log 01M3E33SQ0JV899J5SXK3G3DE0 offered only read_script to the provider, yet its system prompt required propose_plan first. The provider returned an unsupported claim that both edits had already been verified, without a tool call. Log 01M3E35TM05S0RJFZGFVB6QZD0 likewise offered read_script; its answer repeated the previous failed-run/refund text. The runtime guard correctly rejected both completions and refunded their customer Credits. These observations establish a prompt/tool contradiction and ungrounded replies; they do not prove that contradiction was the sole cause.

## Fix and verification

Commit b7965b5 gives explicit finite workflows scoped Agent instructions, omits mandatory planning and open-ended autonomy, and supplies the current required action at each provider boundary. Permission and plugin filters still govern which tool is available. Full-game requests retain their normal plan/build/verify flow. Recognition remains limited to the validated named-tool syntax documented in apple-tool-sequence-termination-2026-09-26.md.

A new real SessionDO test failed before the fix because the provider prompt required the withheld planner. After the fix, 62 focused tests pass. Full worker suite: 4216 passed, zero failed, four skipped; TypeScript and diff checks pass. The first full run exposed an overbroad source-slice test in memory-personalisation, which interpreted adjacent request parsing as choosing memory scope. The expression was placed inside the prompt call; memory access is unchanged. The final full suite is green.

The deploy verifier passed, and independent /api/health returned buildSha b7965b5 at 05:45:37 UTC. Prior head 55c91b1 GitHub Actions 36221190635 passed. The new head's CI must be checked separately.

## Actual Apple run

Project: isolated saved local garden, Apple Studio 1.4.3. Run 19142d60-eeb1-4338-81ad-602b083abe9c:

- Exactly read_script followed by edit_script, both successful.
- Stopped automatically with done, no operator Stop, no extra plan/search/inspection/play tools.
- 11 customer Credits, two provider calls, 301 locally recorded neurons.
- Independent read-back proves GardenClient alone gained optional toast duration, a monotonic hide token and owned-pad readiness feedback lasting ten seconds in source. Gameplay code and asset geometry were preserved.
- This proves one successful bounded production two-tool workflow, not reliable full-game autonomy.

## Native Play

Started native Play, opened the shop and purchased Tulip: currency 60 to 50. Clicking Pad4 planted the imported existing flower. Its visible silhouette grew. A CUA screenshot visibly showed “Pad4 is ready to harvest!”. Clicking the pad removed the flower; Sell raised currency to 68.

The positive readiness screenshot was visible in the task tool output but the subsequent local capture occurred after the toast expired. Its honest filename is after-toast-expired.png. sold-68.png records the harvested flower absent and currency 68. A second planting reduced currency 68 to 58 and grew the flower, but no readiness toast was captured at the sampled times; repeat-no-toast-8s.png and repeat-no-toast-later.png record that limitation. Do not claim sustained ten-second display or repeated reliability from this pass.

Stopped Play, saved /private/tmp/apple-codex-gauntlet-place.rbxl locally and returned the plugin to inspect-only. No permanent Roblox upload, external asset import, Q-022 change or purchase occurred.

## Still open

F-059/F-064 and zero of three independent reviews remain. Sparse green baseplate, generic G item icons and overlapping shop/Sell controls remain visible. Asset template preparation and initial import remain manual, not autonomous builder ingestion. The next visual task is owner-listed cartoon UI integration; readiness repeatability needs a measured follow-up.

Private raw files: /private/tmp/apple-flower-messages.json, /private/tmp/apple-sequence-fixed-provider.json, /private/tmp/apple-sequence-before-client.luau, /private/tmp/apple-sequence-after-client.luau. No credentials, pairing tokens or provider reasoning are included here.
