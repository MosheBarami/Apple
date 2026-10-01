# What the owner's tutorial videos teach the agent (2026-10-01)

Studied frame by frame; the computer has no speech-to-text, so values come from what is on screen. "inferred" marks
anything not read from a frame.

## "Make Your Roblox Game Look 10x Better With Lighting" (4:37)
Final recipe (now `MOODS.studded` in apps/worker/src/worldbuilding.ts; the composer's daylight reads it):
- Lighting: Brightness 3; Ambient 84,107,156 and OutdoorAmbient 117,120,145 (sky-tinted instead of grey);
  ShadowSoftness 0.2; GeographicLatitude 7; EnvironmentDiffuse/Specular 1; ClockTime about 8.4 in the video (not
  readable at the end); Apple uses 13.5 so play areas stay bright.
- Atmosphere: Density 0.34, Offset 0, Haze 1.27, Glare 0 (2.86 was tried and reset), Color 208,208,208, Decay 119,126,141.
- Bloom: Intensity 1, Size 56, Threshold 2. The caption says "not that much".
- SunRays: Intensity 0.01, Spread 0.1.
- ColorCorrection: TintColor 226,238,255; Saturation 0.5 in the video (Apple uses 0.3 because studded colours are
  already saturated); Contrast not readable (0.1 inferred).
- A cloudy "anime" Sky (ids partly readable, 13107325341.., unverified). Apple cannot set Sky images (Content
  properties); the default sky stays.
- The floor gets a "Studs" MaterialVariant. That is the same method Apple now uses on every part (Resurface).
- Detail lessons: semi-transparent textures on big faces, small brightness variation between blocks, and a black
  Highlight outline on characters for a cartoon read.
- Lessons: replace grey ambient with sky-tinted ambient; use haze, not offset, to melt the horizon; keep bloom subtle;
  change one thing at a time and judge the picture.

## "How to Animate Models in Roblox Studio!" (5:22): RigEdit Lite on a cannon
- Model: Cannon > Base (Part, the root, set as PrimaryPart) and Main (Primary, Back, Front, Hole).
- Rig with RigEdit Lite: click Part0, then Part1, then Create Joints. The Motor6D goes under Part0 and is named after
  Part1. The chain runs from the root outwards: Base > Primary > Back > Front > Hole. Use Joints View/Edit to place
  pivots, and Reset Joints to make the current pose the rest pose.
- AnimationController in the model. Animation Editor keys at 0:00, 0:07 and 0:14 (a recoil). Loop off, Priority
  Action. Publish to Roblox, then an Animation with that id, then a Script:
  `controller:LoadAnimation(anim)` and `ClickDetector.MouseClick` plays it.
- Apple cannot publish animation assets, so it keeps the rig method and plays keyframes from code:
  - plugin ops `rig_model`, `set_joint_pivot` and `reset_joints` (apps/apple-plugin/src/ops/Joints.luau, after RigEdit);
  - the animate component (packages/components/animate), which tweens Motor6D C0 on loop, click, prompt, touch or once,
    with a sound;
  - the agent tool `animate_model` and creation skill `props-rig-animate`.

## Still to learn
- "People making games from scratch" videos: none have been supplied yet. Downloading them from YouTube (yt-dlp is
  installed) needs the owner's go-ahead per file. Transcripts would also need a speech-to-text model (about a 1.5 GB
  download), which also needs a yes.
