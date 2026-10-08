---
name: animation
description: Making characters and models move. Covers rigs (R6/R15, Motor6D Part0/Part1/C0/C1/Transform, Bones), Humanoid vs AnimationController and Animator, rigging a static model with animate_model (root part, joints from the root outwards, pivots on hinges), authoring KeyframeSequence/Keyframe/Pose and CurveAnimation in code with easing, previewing without upload (KeyframeSequenceProvider:RegisterKeyframeSequence, AnimationClipProvider:RegisterAnimationClip), why a live game needs an uploaded Animation asset (owner action) or code-driven playback, procedural motion with TweenService/CFrame, looping, priority, weights, and common failures. Load before animating anything.
---

# Animation

Two kinds of motion:
- **Rigid prop motion** (doors, lids, platforms, spinning coins, a crane arm): usually procedural — TweenService or
  per-frame CFrame — and needs no animation asset at all.
- **Articulated motion** (characters, creatures, machines with many joints): a rig of joints plus keyframed clips
  played by an `Animator`.
Pick the simplest that gives the requested movement.

## 1. How rigs work

- A rig is parts connected by `Motor6D` joints (or `Bone`s inside a skinned MeshPart). The model has one **root part**
  (for characters `HumanoidRootPart`); every other moving part hangs from it through a chain of joints.
- `Motor6D`: `Part0` (parent side), `Part1` (child side), `C0` (joint frame in Part0's space), `C1` (joint frame in
  Part1's space), `Transform` (the animated offset). Relationship:
  `Part1.CFrame = Part0.CFrame * C0 * Transform * C1:Inverse()`.
  The joint's pivot (hinge) is where `Part0.CFrame * C0` is in the world: rotations in `Transform` turn Part1 about it.
- Only the root is `Anchored`; every jointed part must be **unanchored** (an anchored Part1 will not move).
  `Weld`/`WeldConstraint` for parts that move with their parent but never animate themselves.
- **R6**: 6 parts (Torso root joints: Neck, Left/Right Shoulder, Left/Right Hip, RootJoint). **R15**: 15 MeshParts
  with joints named e.g. `Root`, `Waist`, `Neck`, `LeftShoulder`, `LeftElbow`, `LeftWrist`, `LeftHip`, `LeftKnee`,
  `LeftAnkle` (and Right*). An animation for one rig type does not play on the other. `Humanoid.RigType` tells which.
- **Humanoid + Animator**: player characters and NPCs that walk. **AnimationController + Animator**: anything
  animated that is not a humanoid (creatures without Humanoid physics, machines, props). The `Animator` is a child of
  the Humanoid/AnimationController and is what `LoadAnimation` is called on.

## 2. Rigging a static model (the joint method, via animate_model)

`animate_model` rigs a model the way builders do with RigEdit Lite. Read its parameter schema; the method:
1. `model_anatomy` the model: list parts, sizes, existing joints/welds, which parts belong together.
2. **Choose the root**: the part that never moves (base, body, frame). It stays anchored and becomes `PrimaryPart`.
3. **Build the chain from the root outwards**: body → upper arm → forearm → hand; base → turret → barrel. Each joint
   is a Motor6D parented to the part it hangs from, named after its Part1, with `C0` = Part1's current offset from
   Part0 and `C1` = identity, so nothing moves when rigged. Parts that only follow (decor on an arm) get welds.
4. **Put each pivot on its hinge**: a door on its hinge edge, a lid at its back edge, a jaw at the jaw joint, a wheel
   at its axle centre. Moving the pivot changes C0 and C1 together so the part does not move. Orient the pivot axes
   so the intended rotation is about one axis (e.g. a door about Y).
5. Check with `model_anatomy` again: joints present, root anchored, others unanchored, which way a positive angle turns.
6. Remove leftover welds between parts that must now move (a stray WeldConstraint freezes the joint).

## 3. Authoring clips in code

**KeyframeSequence** (the classic format):
- Hierarchy: `KeyframeSequence` → `Keyframe` (`Time` in seconds) → `Pose` named after the **root part** → nested
  `Pose`s named after each joint's **Part1**, following the joint tree. A Pose's `CFrame` is the joint's `Transform`
  at that time (offset from rest, so identity = rest pose).
- Per pose: `EasingStyle` (Enum.PoseEasingStyle: Linear, Constant, Cubic, Elastic, Bounce, CubicV2) and
  `EasingDirection` (Enum.PoseEasingDirection) shape the motion **toward the next keyframe**; `Weight` (0-1).
- Sequence: `Loop` (bool), `Priority` (Enum.AnimationPriority: Core < Idle < Movement < Action < Action2 < Action3 <
  Action4). `keyframe:AddMarker(KeyframeMarker)` for timed events (footstep, hit frame).
- Build with `Instance.new` in `run_luau` (or let `animate_model` author the clip from your keyframes). Rotations:
  `CFrame.Angles(math.rad(x), math.rad(y), math.rad(z))`.

**CurveAnimation** (curve format): `CurveAnimation` → `Folder` per joint (named after the part, nested by hierarchy)
→ `Vector3Curve` named `Position` and/or `EulerRotationCurve`/`RotationCurve` named `Rotation`, plus `FloatCurve`s for
other channels (e.g. FaceControls). Use when you need per-channel curves; otherwise KeyframeSequence is simpler.
`search_docs` "CurveAnimation" for the key APIs before using it.

Animation craft (make it read well):
- Key poses first (anticipation → action → follow-through → settle), then timing. Fast actions 0.1-0.3 s; idles 2-4 s
  loops with small amplitude.
- Ease in/out on most joints; `Constant` for snaps; overshoot then settle for weight.
- Offset timing between parts (the hand lags the arm) so it does not look robotic.
- Loops: the last keyframe must equal the first.

## 4. Previewing and shipping

- **Preview in Studio without upload**: `KeyframeSequenceProvider:RegisterKeyframeSequence(kfs)` returns a temporary
  id; set it as `Animation.AnimationId`, then `animator:LoadAnimation(animation):Play()`. For CurveAnimation/any
  AnimationClip: `AnimationClipProvider:RegisterAnimationClip(clip)`. These ids work **only in Studio** sessions.
- **A published game** cannot play those temporary ids. Two ways:
  1. Upload the clip as an Animation asset (Animation Editor / asset upload) owned by the experience owner (the user or
     their group) and use `rbxassetid://<id>`. That is an **owner action**: tell the user exactly which clip to
     upload; never upload to their account yourself.
  2. Code-driven playback: a script evaluates the keyframes and writes the joints itself (interpolate between poses
     with `TweenService:GetValue(alpha, style, direction)` and set `Motor6D.Transform` each frame in
     `RunService.PreSimulation`/`Stepped`, or tween `C0` on the server so it replicates). Works live with no asset;
     no blending/priority system, so keep it to props and simple machines.
- Animations on player characters are played by the owning client (LocalScript) and replicate automatically. For NPCs
  play them on the server.

## 5. Playing clips (AnimationTrack)

- `local track = animator:LoadAnimation(animationInstance)`; load once and reuse the track.
- `track:Play(fadeTime?, weight?, speed?)` (default fade 0.1), `track:Stop(fadeTime?)`, `track:AdjustSpeed(s)`,
  `track:AdjustWeight(w, fade?)`, `track.Looped`, `track.Priority`, `track.TimePosition`, `track.Length` (0 until
  loaded), events `Ended`, `Stopped`, `DidLoop`, `track:GetMarkerReachedSignal(name)`.
- Blending: higher priority overrides lower on the same joints; equal priorities blend by weight. A custom walk must
  be Movement priority; an attack Action so it overrides walk on the arms.
- Default character animations come from the `Animate` LocalScript in the character; replace its `StringValue`/
  `Animation` children's ids to swap run/idle.

## 6. Procedural motion for props (no rig needed)

- Single rigid part or model: TweenService on `CFrame` of an anchored part, or on a `CFrameValue` whose `Changed`
  calls `model:PivotTo()` (tween can't target a Model's pivot directly).
- Rotate about a hinge: compute `hingeCFrame * CFrame.Angles(0, angle, 0) * hingeCFrame:Inverse() * closedCFrame`.
- Spin/bob forever: on the client `RunService.Heartbeat` with time-based math (`math.sin(os.clock() * speed)`), so
  it is smooth and costs no network.
- Physics-driven alternatives: `HingeConstraint` (ActuatorType Motor/Servo, `AngularVelocity`, `TargetAngle`),
  `PrismaticConstraint` for sliders, `AlignPosition`/`AlignOrientation` — when the motion should interact with
  players physically.

## 7. Common failures

| Symptom | Cause |
|---|---|
| Nothing moves | Part1 anchored; Animator missing; wrong rig type; pose names do not match part names; temporary id in a live game. |
| Part flies to origin / rotates around the wrong point | Pivot (C0/C1) not on the hinge; built C0 from world instead of Part0 space. |
| Model falls apart or drops in play | Root not anchored, or parts unanchored with no joint to the root. |
| Animation plays but is overridden | Lower priority than the default Animate script's tracks. |
| `Failed to load animation` in logs | Asset not owned by the experience owner / not uploaded / id wrong. |
| Jittery code animation | Setting Transform at the wrong step, or server-side per-frame updates (do them on the client). |

## 8. Verification

- `model_anatomy` after rigging; `get_instance` on a joint to read C0/C1.
- Preview: `run_luau` to register the sequence and play it on the Animator, then read joint `Transform`s or part
  positions after a short wait; or `animate_model`'s own preview.
- `play_check` to confirm it runs in play and shows no errors; describe what moves and how.
- State clearly whether what you made will play in the published game or needs the owner to upload an asset.
