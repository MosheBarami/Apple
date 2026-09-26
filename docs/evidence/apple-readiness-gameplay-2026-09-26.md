# Native Studio readiness and harvest proof — 2026-09-26

Tested the existing saved isolated `/private/tmp/apple-codex-gauntlet-place.rbxl` through Roblox Studio native Play. No new Apple Agent request, source edit, asset import or publication was performed in this test.

## Observed

- Initial balance 60. Opened the imported Studded garden shop and bought the first Tulip card for 10; HUD changed to 50. Tomato and Pumpkin card illustrations remain empty.
- Clicked the near-left soil pad (Pad4); a small purple flower appeared and visibly grew to full size.
- The bottom toast visibly changed to **“Pad4 is ready to harvest!”**. This closes the earlier missing observation for this existing readiness notification, without claiming a new code fix.
- Clicked the same soil pad to harvest; the runtime flower disappeared. Clicked Sell; HUD changed from 50 to 68.
- Native Play stopped; transient Revix floating panel closed; garden editor restored and Apple Studio visibly remained **Access: inspect only**.

Screenshots: [ready](apple-readiness-20260926/ready.png), [sold](apple-readiness-20260926/sold.png).

## Limits

This is one operator gameplay check, not an independent blind review. The garden remains sparse, the barrel/fences/decorations visibly float, and two crop visuals are missing. F-059/F-064 and 0/3 independent reviews remain open. No permanent Roblox upload or Q-022 setting change. No provider request or product Credits were used by this native-only test.

CI for prior head 3a18763: run 36230694017 remained in progress at the check; four jobs passed, two still running. Sole CPU supervisor PID 35962 remained alive with v32 training; no restart or duplicate.
