# Apple grounding test — 2026-09-26

## Measured local result

Saved isolated place `/private/tmp/apple-codex-gauntlet-place.rbxl`. Data-only Lune deserialization of saved bytes measured ground top Y=0 and the far flower model minimum Y=1.199913501739502. Two sibling Models were named Flowers. Operator selected the second model in native Explorer, focused it to inspect the remote planter, and renamed it **PlazaFlowers**; geometry was not changed by that preparation.

Apple MAX Agent run **388e7644-8b34-4af1-9fb9-d0fe33a40b49** completed one successful transform_instances call with move [0,-1.199913501739502,0], then stopped done. Cost: **4 product Credits**, one provider model call, **105 neurons**.

Saved-file comparison against `/private/tmp/apple-floating-before.rbxl`, normalizing the two operator model renames, found **exactly two BaseParts changed**, zero added/missing parts or scripts. Both translations equal [0,-1.199913501739502,0]; sizes, anchoring and collision flags are unchanged. Bounding minimum Y after save is **0**. The exact CFrames are retained in the private local diff `/private/tmp/apple-grounding-diff.json`. No downloaded source executed. Native Play showed the retained planter in the active scene; this distant screenshot is not a close-up visual-quality verdict.

## Failures retained separately

- First verbose flower request **c3fb62c9-d7e2-4611-8ebd-46c99450e830**: incomplete, no tool calls, no geometry mutation. Four Credits refunded, net0; provider one successful call/112 neurons.
- Fence request **c6199bbb-17a0-44d5-a9d6-f3dfc414bc37**: incomplete, no tool calls, no geometry mutation, net0 product Credits; provider one successful call/59 neurons. Operator had renamed the second duplicate landscapeFence model **PlazaFence**. Its minimum Y remains **1.1999082565307617**, so the fence is still floating. No repeat of the fence request was made.

All three runs: **4 net product Credits,3 provider calls,276 neurons**. Provider calls report ok with no errorKind; cause of the two no-tool incomplete responses is not established. This is a measured agent reliability gap, not a plugin transform failure.

## Final state and limits

Native Play stopped; transient Revix panel closed; local editor restored with Apple Studio **Access: inspect only**. Flower placement and two unique model names were saved locally. No permanent Roblox uploads, new detailed geometry, third-party insertion, Q-022 change, or appeal submission. The sparse garden, floating fence and missing Tomato/Pumpkin visuals remain; F-059/F-064 and independent reviews0/3 remain open.

[Native Play after](apple-grounding-20260926/play-after.png). [Unchanged floating fence before](apple-grounding-20260926/fence-before.png).

CI for **fa4c212** freshly passed **all six jobs**, run [36231055786](https://github.com/MosheBarami/Apple/actions/runs/36231055786). Sole CPU supervisor PID35962 remained alive; v32 remains training. No training interruption or reset credit action.
