# NEXT ACTION

**Load the new plugin build in Studio, then re-check what only it can show.** Studio pid 24529 sits behind a
"Save changes?" prompt the agent may not click (OWNER_QUEUE Q-005). Once it is gone, relaunch
`/private/tmp/RobloxStudioNoUpdate.app/Contents/MacOS/RobloxStudio -localPlaceFile
/Users/moshe/Documents/Apple-Mission2c-Baseplate.rbxl -task EditFile` (installed plugin sha256 8a9ec295: Terrain in
renders, ColorGradingEffect checkpoints, [t,v] NumberSequence keypoints, terrain_edit clear). Then:
1. F-051: the first checkpoint on a fresh place is taken (no "ColorGradingEffect" toast).
2. Mission 2 once more: inspect_visually now SEES the island — record its score instead of "not scored".
3. F-033: start a build and press Disconnect in the Apple panel mid-run; the reply must say Studio
   disconnected, not "not offered in this mode", and must not overcount changes.
4. F-052 live: after "Start building" the composer is empty.

Then: F-028 (read-only diagnosis), F-036 (a lighting change under ~60 Credits), F-053, three fresh reviews,
and the final plugin publish + appeal before 2026-10-23 01:23 IDT (D-STORE-2) which closes F-020/F-034/F-038.

**Fresh reviews run only under the supervisor, and it refuses while an interactive Product Owner session
drives the checkout (D-AUT-1; measured 2026-09-23 07:58: "refusing to start: an interactive Product Owner
(pid …) is driving this checkout").** .autonomy/state.json is set to phase "reviewer". After the final
publish + appeal, end the interactive session and start `python3 scripts/autonomy-supervisor.py`; it begins
with a reviewer and records the verdict itself.
