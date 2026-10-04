# Animation, audio and VFX (Animator, new Audio API, particles, beams, trails, highlights, game feel)
_Researched 2026-10-04 by Claude (Sonnet 5.5 research agent). Sources: 69._

How this file was built, so the reader can weigh it. Property names, types, defaults, ranges and deprecation flags come from the engine data of Studio build 0.741.19.7411056 ([S29] Roblox's Full API Dump and [S30] the rbx-dom reflection database, both for that exact build, checked against the live client-version endpoint on 2026-10-04). Descriptions and limits come from the official reference and guides ([S1]-[S28]), read from the Roblox/creator-docs repository that generates create.roblox.com/docs (fetched 2026-10-04) and spot-checked on the live site. Dates and caveats come from DevForum staff posts ([S32]-[S52]). Concrete effect and mix numbers in the recipes are **[OWN]**: my own starting values, built inside the verified ranges and never rendered or listened to by me. Treat [OWN] numbers as a first draft to be checked with a Studio screenshot.

## Key facts

### Platform timeline that matters for this topic (newest facts first)
- Animation Graphs reached full release on 2026-07-15 (node-based blend/select/layer graphs, driven from script with `AnimationTrack:SetParameter`); the beta post of 2026-04-02 said graphs were Studio-only then [S45][S46].
- Adaptive Animation (HumanoidRigDescription / DigitsRigDescription, one animation across rigs) reached full release 2026-04-29 [S47]. Creating and selling Animation Packs on Marketplace is in full release as of 2026-09-09 [S52].
- Acoustic Simulation (automatic occlusion, diffraction, reverb for audio-API emitters) was announced 2026-01-28 and the post records a full release on 2026-09-22 [S35]. The Fall 2026 roadmap lists "Acoustic Simulation - Sounds" (legacy `Sound`) for early 2027, "2D particles" (screen-space particles on UI) and "audio debug tools" for late 2026, State Machine nodes and Luau expressions for Animation Graphs and root motion for mid 2027 [S50].
- Highlight cap rose from 31 to 255 simultaneous instances on 2025-11-10 [S40]; the 2023 tutorial still says 31 [S41].
- Custom particle flipbook layouts (`FlipbookLayout = Custom` with `FlipbookSizeX/Y`, values 1-64, non-square and non-power-of-two textures) arrived 2025-10-13 [S43]; flipbooks themselves left beta 2022-10-21 [S42].
- Attachments no longer need a BasePart ancestor (beta 2025-06-17, live 2025-09-02), so Beams, Trails, ParticleEmitters and Sounds can hang off Models, Folders, Cameras or Workspace-level attachments [S44].
- The modular Audio API entered beta 2024-02-22 (post last updated 2024-02-28) [S32]; Dec 2024 added AngleAttenuation (beta), AudioLimiter, `AudioPlayer:GetWaveformAsync`, `AudioEcho.RampTime` and `SoundService.DefaultListenerLocation` [S33]. Text-to-speech (`AudioTextToSpeech`) reached full release 2025-10-09 [S36].
- Audio privacy: since 2022-03-22 uploaded audio is private and, for experiences, assets "will stop working" unless uploaded by the experience's creator (user or group) or permission is granted; audio under 6 seconds had stayed public [S38].
- Creator Store got separate "Gameplay" and "Visual Effects" categories on 2026-04-29 and plans automatic sandboxing of scripted assets [S51].

### Animation: Animator and AnimationTrack
- `Animator` is the class that plays and replicates animations; all replication of playing tracks goes through it [S5]. It lives under a `Humanoid` or an `AnimationController` [S5][S7]. `Humanoid:LoadAnimation`, `Humanoid:GetPlayingAnimationTracks` and the Humanoid/AnimationController `AnimationPlayed` path are flagged Deprecated in the engine data; the documented replacement is `Animator:LoadAnimation()` [S29][S23]. `Humanoid:PlayEmote` is also flagged Deprecated, superseded by `Humanoid:PlayEmoteAsync()`, although the emotes guide still shows `PlayEmote` [S12][S23][S29].
- `Animator:LoadAnimation(animation)` returns a new `AnimationTrack` every call. The Animator must be inside Workspace or the call throws. To reuse an existing track use `Animator:GetTrackByAnimationId(id)`, which returns nil if none was loaded [S5].
- Replication rule: if the Animator is inside a player's character, animations started on that player's client replicate to the server and other clients. If the Animator is not in a player character (NPCs), load and play on the server. The Animator must be created on the server; one created on a client does not replicate its tracks [S5].
- `Animator.PreferLodEnabled` (default true) lets the engine throttle animation evaluation for remote characters by distance, screen coverage and frame budget; set false only for hero NPCs. `Workspace.ClientAnimatorThrottling` (enum Default/Disabled/Enabled) independently controls throttling for all animators. `Animator.EvaluationThrottled` (read only) tells procedural code that the pose was reused this frame [S5][S23].
- AnimationTrack members: properties `Animation, IsPlaying, Length, Looped, Priority, Speed, TimePosition, WeightCurrent, WeightTarget`; methods `Play(fadeTime=0.1, weight=1, speed=1)`, `Stop(fadeTime=0.1)`, `AdjustSpeed(speed=1)`, `AdjustWeight(weight=1, fadeTime=0.1)`, `GetMarkerReachedSignal(name)`, `GetTimeOfKeyframe(name)`, `SetParameter / GetParameter / GetParameterDefaults` (animation graphs); events `DidLoop, Ended, KeyframeReached, Stopped` [S6][S29]. `Length` is 0 until the animation has loaded [S6]. `Stopped` fires when playback finishes; `Ended` fires only after the fade-out is complete and the subject is neutral [S6].
- Priority order, highest first: `Action4, Action3, Action2, Action, Movement, Idle, Core` (enum values Idle 0, Movement 1, Action 2, Action2 3, Action3 4, Action4 5, Core 1000, but Core is the lowest priority). If two tracks drive the same limb at the same priority, weights blend them; a higher priority wins outright [S6][S10][S29].
- `Stop()` then `AdjustWeight()` misbehaves: to adjust a fading-out track call `Play()` first. Fade time 0 on rigs whose Motor6D `MaxVelocity` is 0 freezes joints [S6].
- Speed 0 pauses a track and `TimePosition` can be set to freeze on a frame, but `TimePosition` only works while the track is playing [S6]. Negative speed plays backwards and Looped handles reverse playback [S6].
- Animation events: add named markers in the Animation Editor event track (optional parameter string), then `track:GetMarkerReachedSignal("Name"):Connect(function(param) end)` [S8]. `KeyframeReached` only fires for keyframes with a non-default name and names cannot be set by script [S6].
- Animation Editor defaults: 30 frames per second, timeline shown as seconds:frames, easing styles Linear, Constant, CubicV2, Elastic, Bounce; a looping animation does not interpolate last-to-first keyframe, so duplicate the first keyframes at the end; to replace a default character animation (run, jump) the last keyframe must be renamed `End` (case-sensitive); publishing for a group-owned game needs the group chosen in the Creator field [S10]. A Curve Editor (converts KeyframeSequence to CurveAnimation, Euler or quaternion tracks) and face/body video capture (up to 60 s face recording, mp4/mov body video for R15) also exist [S13].
- Animation assets are permissioned: owner, collaborators, group members with permission, and experiences explicitly granted in the asset Permissions tab may use an animation [S49]. What the failure looks like was not stated in the post (unverified).
- Default character animation override pattern: edit the `Animate` script values (`animateScript.run.RunAnim.AnimationId`, `walk.WalkAnim`, `jump.JumpAnim`, `idle.Animation1/Animation2`, `fall.FallAnim`, `swim.Swim`, `swimidle.SwimIdle`, `climb.ClimbAnim`) from a server Script on `CharacterAppearanceLoaded`, stopping playing tracks first; idle variants are chosen by `Weight` values (weight / total weight) [S7]. The docs list catalog packs with IDs, e.g. Ninja run 656118852, walk 656121766, jump 656117878, fall 656115606, climb 656114359; Cartoony run 742638842, walk 742640026, jump 742637942; Zombie run 616163682, walk 616168032, jump 616161997; Superhero run 616117076, walk 616122287, jump 616115533. Seventeen packs are listed (Astronaut, Bubbly, Cartoony, Elder, Knight, Levitation, Mage, Ninja, Pirate, Robot, Rthro, Stylish, Superhero, Toy, Vampire, Werewolf, Zombie) [S7]. Default Roblox Walk is 507777826 and Wave 507770239 (used in the graph tutorial) [S13].
- IK: `IKControl` (child of the Humanoid or AnimationController) needs `Type` (Transform, Position, Rotation, LookAt), `EndEffector`, `Target`, `ChainRoot`; also `Pole`, `Weight` (1), `SmoothTime` (0.05), `Priority` (0), `Offset`, `EndEffectorOffset`, `Enabled`. Without joint constraints elbows and wrists bend unnaturally; the docs show a HingeConstraint for elbows and a BallSocketConstraint with `UpperAngle` 80 for wrists, with attachments matching the Motor6D C0/C1 [S9][S29].
- Procedural layering: `AnimationConstraint.Transform` is the writable offset on modern rigs; `AnimationConstraint` gained `AngularStrength/LinearStrength/AngularDamping/LinearDamping` (defaults 1) in a staged rollout (opt-in 2026-06-23, default targeted 2026-07-21, unconditional targeted 2026-09-15) [S48][S29].
- Adaptive Animation needs at least 15 joints mapped to the standard Roblox skeleton; hands support up to 15 joints each via `DigitsRigDescription`; client 717+ recommended [S11][S47]. The R6 to R15 adapter (`Workspace.AvatarUnificationMode = Enabled`) lets R15 avatars join an R6 game [S27].
- Emotes: the emotes menu holds up to 8 equipped emotes via `HumanoidDescription:SetEquippedEmotes`; `StarterPlayer.UserEmotesEnabled` can only be set in Studio [S12].
- Humanoid defaults: `WalkSpeed` 16, `JumpPower` 50 (`UseJumpPower` true), `JumpHeight` 7.2, `CameraOffset` (0,0,0) in object space, `RigType` R6 when made with `Instance.new` [S29][S23].

### Procedural motion: TweenService and springs
- `TweenService:Create(instance, TweenInfo, {props})`; a Tween's configuration cannot be changed after creation, two tweens on the same property cancel the older one, and a new Tween is needed for new goals [S24]. `TweenInfo.new(time=1, style=Quad, direction=Out, repeatCount=0, reverses=false, delay=0)`; repeatCount -1 loops forever [S24]. Easing styles: Linear, Sine, Back, Quad, Quart, Quint, Bounce, Elastic, Exponential, Circular, Cubic [S29].
- UI tween guidance: set `AnchorPoint` first, use Scale not Offset, add a `UIAspectRatioConstraint` when tweening Size, and tween a `CanvasGroup.GroupTransparency` for whole-group fades [S24].
- Roblox has no built-in spring API. The community library `spr` (Fraktality) animates properties of Vector3, CFrame, Color3, UDim2 with `spr.target(obj, dampingRatio, undampedFrequency, props)`; damping below 1 overshoots, 1 is critical, above 1 is slower [S60]. `AnimationConstraint` damping and strength are physics, not a general spring tool [S48].
- `Debris:AddItem(item, lifetime=10)` is current; only the lowercase `addItem` is deprecated [S25][S29]. The Debris reference sample shows `task.delay` as the alternative [S25].

### Audio: the modular API (AudioPlayer, AudioEmitter, AudioListener, AudioDeviceOutput, Wire)
- Roblox's own guide says `Sound`, `SoundGroup` and `SoundEffect` are discouraged in favour of audio objects; the 2024 beta post says the older API "will remain active" [S14][S20][S32]. Studio's Toolbox inserts a legacy `Sound` when you click a Creator Store audio asset, so scripts and plugins still meet both [S16].
- Producers: `AudioPlayer` (Output pin), `AudioDeviceInput` (microphone, Output), `AudioTextToSpeech` (Output), `AudioListener` (Output), `VideoPlayer`. Consumers: `AudioEmitter` (Input), `AudioDeviceOutput` (Input), `AudioSpeechToText`, `AudioRecorder`, `AudioAnalyzer`. Effects have Input and Output. `Wire` carries a stream: `SourceInstance`, `SourceName` (default "Output"), `TargetInstance`, `TargetName` (default "Input"; `AudioCompressor` also has a "Sidechain" pin), and `Connected` is true only if both ends exist and the graph is not cyclic [S14][S17][S29]. Wirable list also includes `AudioGate` (noise gate) and `VideoDisplay` [S17][S37].
- 2D audio = AudioPlayer -> Wire -> AudioDeviceOutput. 3D audio = AudioPlayer -> Wire -> AudioEmitter (position comes from the emitter's parent: BasePart, Attachment, Camera or other PVInstance; any other parent makes it silent) ... AudioListener -> Wire -> AudioDeviceOutput [S14][S17]. `AudioDeviceOutput.Player` limits who hears it; empty means everyone [S17].
- `SoundService.DefaultListenerLocation` (enum Default, None, Character, Camera): Camera or Character auto-creates a listener, wires it to an AudioDeviceOutput under SoundService and gives it an empty interaction group; Default creates the listener on the camera only in experiences that enable voice chat; None means create your own [S14][S19][S33]. Its default value is Default [S29]. The 2D tutorial tells you to set it to Character so the output device exists [S26].
- AudioPlayer: `Asset` (ContentId; the older `AssetId` string is flagged Deprecated and hidden, preferred name is `Asset`; the docs' prose still says "AssetID") [S29]. Defaults: Volume 1 (range 0-10), PlaybackSpeed 1 (range 0-20, directly changes pitch), Looping false, AutoLoad true, AutoPlay false (only affects locally created/deserialized players, mostly an edit-time convenience), LoopRegion and PlaybackRegion default 0 to 60000 s (seconds, whole asset), TimePosition 0 [S17][S29]. `Play(atTime?)` and `Stop(atTime?)` replicate server to client and can be scheduled against `SoundService:GetMixerTime()` for sample-accurate timing; they return an action id usable with `Cancel(id)` [S17]. `Ended` fires on natural completion only (not on Stop, not for Looping) and is the intended hook for destroying one-shot players; `Looped` fires per loop; `IsReady` flips true when loaded; `GetWaveformAsync(timeRange, samples)` samples loudness before playing [S17].
- AudioEmitter: `DistanceAttenuationMode` enum Custom (default), InverseTapered, Linear, LinearSquared, Inverse with `DistanceAttenuationBounds` NumberRange default (4, 10000) used by the non-Custom presets (full volume inside min, silent at max); Custom uses `SetDistanceAttenuation(table)` of up to 400 distance-to-volume pairs (keys >= 0, values 0-1) and falls back to an inverse rolloff if none is set; `SetAngleAttenuation` takes angle keys 0-180 for directional sources; `AudioInteractionGroup` (string) means only listeners in the same group hear the emitter; `GetAudibilityFor(listener)` returns 0-1 for gameplay such as stealth meters [S17][S29][S33]. `PositionType` Parent (default) or Instance with `PositionInstance` [S17].
- AudioListener mirrors this (distance and angle curves, interaction group, `Reset()`, `GetInteractingEmitters`), so a hero with "enhanced hearing" can have a different curve [S17]. Multiple listeners are allowed (split screen, portals) and effects can be wired after a listener to process everything heard [S32].
- Acoustic Simulation: `SoundService.AcousticSimulationEnabled` is false by default and must be true; `AudioEmitter` and `AudioListener` also have `AcousticSimulationEnabled` (default true), per-effect `OcclusionEnabled / DiffractionEnabled / ReverbEnabled` (SimulationMode Default, Enabled, Disabled); parts have `AudioCanCollide`; density and acoustic absorption of `PhysicalProperties` shape muffling and echo; it may lower accuracy or switch off to protect frame rate, so do not build competitive gameplay on it; only the shortest diffraction path is simulated and reverb is computed around listeners only [S17][S19][S29][S34][S35]. It applies to audio-API instances, not legacy Sounds, until the early-2027 roadmap item [S35][S50].
- Effects and exact ranges ([S18], defaults from [S29]):
  - `AudioFader.Volume` 0-3 (default 1).
  - `AudioCompressor`: Threshold -60 to 0 dB (default -40), Ratio 1-50 (default 40), Attack 0.0001-0.5 s (0.1), Release 0.01-5 s (0.1), MakeupGain -30 to 30 dB (0), Sidechain pin for ducking.
  - `AudioLimiter`: MaxLevel -12 to 0 dB (default 0), Release 0.001-1 s (0.01); reacts instantly, unlike the compressor [S33].
  - `AudioReverb`: DecayTime 0.1-20 s (1.5), WetLevel -80 to 20 dB (-6), DryLevel -80 to 20 dB (0), Density and Diffusion 0.1-1 (1), DecayRatio 0.1-1 (0.5), EarlyDelayTime 0-0.3 s (0.02), LateDelayTime 0-0.1 s (0.04), HighCutFrequency 20-20000 Hz (20000), ReferenceFrequency (5000), LowShelfFrequency (250) and LowShelfGain -36 to 12 dB (0).
  - `AudioEqualizer`: LowGain, MidGain, HighGain each -80 to 10 dB (0), MidRange default 400-4000 Hz (crossovers 200 up).
  - `AudioFilter`: FilterType Peak (default), LowShelf, HighShelf, Lowpass6/12/24/48dB, Highpass12/24/48dB, Bandpass, Notch; Frequency 20-22000 Hz (2000), Gain -30 to 30 dB, Q 0.1-10 (0.707).
  - `AudioEcho`: DelayTime 0.001-5 s (1), Feedback 0-1 (0.5), WetLevel and DryLevel -80 to 10 dB, RampTime (0) smooths delay changes.
  - `AudioPitchShifter`: Pitch 0.5-2 (default 1.25), WindowSize Small/Medium/Large.
  - `AudioDistortion.Level` 0-1 (0.5); `AudioChorus` and `AudioFlanger` Depth, Mix 0-1, Rate 0-20 Hz; `AudioTremolo` Frequency 0.1-20 Hz, Depth 0-1.
  - `AudioGate` Attack and Release 0.001-5 s, Threshold NumberRange in dB. `AudioAnalyzer` gives `PeakLevel`, `RmsLevel` (client only; 0 on the server) and `GetSpectrum()` (turn `SpectrumEnabled` off to save CPU) [S18].
  - `AudioTextToSpeech`: Text up to 300 characters, `VoiceId` from the documented list (1 British male, 2 British female, 3 and 5 US male, 4 and 6 US female, 7 and 8 Australian, 9 and 10 retro, 11 host; localized voices 101-1002 were added by August 2026), Speed 0.5-2, Pitch -12 to 12 semitones, Volume 0-3; rate limit 1 + 6 x concurrent users requests per minute per experience [S14][S18][S36].
- Sound limits on content: import mp3, ogg, wav or flac, single track, under 20 MB and 7 minutes, sample rate up to 48 kHz, mono or stereo or 2.0/3.0/5.1; 2,000 free imports per 30 days if ID-verified, 100 if not (the 2022 post said 100 and 10, so older numbers are stale) [S16][S38].
- Legacy `Sound` facts still useful: Volume default 0.5 (range 0-10), RollOffMinDistance 10, RollOffMaxDistance 10000, RollOffMode Inverse, `PlayOnRemove`, `SoundService.RespectFilteringEnabled` (a client-played Sound replicates only if this is false), `SoundService.AmbientReverb` (ReverbType presets) applies to legacy Sounds only; `SoundGroup.Volume` default 0.5 multiplies member Sounds (0.5 x 0.5 = 0.25) and a Sound joins a group via its `SoundGroup` property, not by parenting; ducking uses `CompressorSoundEffect.SideChain` [S19][S20]. Every `Sound` can expose its engine-side player with `Sound:GetUnderlyingAudioPlayer()` [S29].
- Studio ships a few engine sounds usable as `rbxasset://sounds/...`: action_falling.ogg, action_footsteps_plastic.mp3, action_get_up.mp3, action_jump.mp3, action_jump_land.mp3, action_swim.mp3, impact_explosion_03.mp3, impact_water.mp3, oof.ogg, ouch.ogg, volume_slider.ogg (present in the installed Studio content folder, build 0.741) [S31].

### Music and sound rights
- Upload only audio you have the legal right to; Roblox's Creator Store offers "more than 100,000" professionally produced effects and tracks from partners (APM, Monstercat, Pro Sound Effects, Nettwerk, Position Music named in 2022; Too Lost added July 2026 as rights-cleared independent music) [S16][S38][S39].
- Uploads are classified automatically as sound effect or song. Songs can appear on the experience details page (15 s preview) only if they pass moderation and copyright checks, meet duration/playback/age thresholds, have a meaningful title, the uploader is ID-verified and has accepted the Audio Terms; sound effects never appear there but can be distributed in the Creator Store [S16][S39].
- Asset privacy means another creator's private audio ID stops working in your experience unless permission is granted; test with the experience's real owner account [S16][S38].
- Scripts inside Creator Store assets can be turned off with Disable Scripts; Roblox prohibits obfuscated code and runtime-loaded remote code in distributed assets [S28].

### VFX: ParticleEmitter
- Parent to a BasePart (particles spawn in its box or `Shape`) or an Attachment (spawn at the point; attachment orientation sets direction). Sphere and Cylinder `Shape` render wrongly under an Attachment [S1].
- Verified defaults (Studio build 0.741) [S29]: Rate 20, Lifetime 5-10 s, Speed 5-5, Size NumberSequence 1 to 1, Transparency 0 to 0 (never fades unless you set it), Color white, LightEmission 0, LightInfluence 0 in the data (but 1 when inserted with Studio tools, 0 with `Instance.new`) [S1], Brightness 1, Drag 0, Acceleration (0,0,0), SpreadAngle (0,0), EmissionDirection Top, Orientation FacingCamera, Shape Box, ShapeInOut Outward, ShapeStyle Volume, ShapePartial 1, Squash 0, ZOffset 0, Rotation 0-0, RotSpeed 0-0, TimeScale 1, VelocityInheritance 0, LockedToPart false, FlipbookLayout None, FlipbookMode Loop, FlipbookFramerate 1-1, FlipbookBlendFrames true, Texture `rbxasset://textures/particles/sparkles_main.dds`. `Enabled` true. `VelocitySpread` is deprecated (use `SpreadAngle`).
- Limits and rules from the docs [S1]: one emitter creates at most 400 particles per second (100 per second on mobile); particle lifetime is capped at 20 seconds; flipbook framerate max 30 fps; `Emit(n)` default 16 spawns n instantly; `Enabled = false` stops new particles but existing ones live on until expiry or `Clear()`; `Lifetime` 0 emits nothing; `LightEmission` 0 is normal blending and 1 is additive (glow); `Drag` is described as the seconds in which particles lose half their speed by exponential decay, negative values accelerate them; `Speed` negative reverses direction; `Squash` above 0 shrinks horizontally and grows vertically, below 0 the opposite; `Rotation` is clockwise degrees (commonly 0 to 360); `Orientation` VelocityParallel/VelocityPerpendicular align to travel direction; `ZOffset` layers emitters without changing screen size; `TimeScale` 0-1 slows or freezes.
- Performance guidance [S1]: fill-rate and overdraw dominate, so keep Rate low and use size and lifetime to get the look; fade Transparency in and out to avoid popping; check effects at the lowest and highest Studio Editor Quality Level. Estimate live particles as Rate x average Lifetime.
- Flipbooks [S1][S42][S43]: Layouts None, Grid2x2 (4 frames), Grid4x4 (16), Grid8x8 (64), Custom (`FlipbookSizeX/Y` 1-64). Modes Loop, OneShot (frame rate derived from lifetime / frame count, `FlipbookFramerate` ignored), PingPong, Random. `FlipbookStartRandom` with framerate 0 makes each particle a random static frame. Leave transparent spacing between frames. Clients disable flipbooks when memory is low (older phones). The engine's own `FlipbookIncompatible` message mentions 1024 by 1024 textures, the 2022 post allowed squares from 8x8 to 1024x1024, and the 2025 post allows non-square sizes via Custom [S29][S42][S43].
- Built-in textures that ship in the Studio content folder (and which a Roblox preset library in this repo already treats as present in every client): `rbxasset://textures/particles/` + sparkles_main.dds (8-point white star, 128 px), smoke_main.dds (soft grey puff, 128 px), fire_main.dds (brown flame strands, 256 px), explosion01_core_main.dds (orange fireball puff), explosion01_smoke_main.dds (very dark smoke), explosion01_shockwave_main.dds (soft ring), explosion01_implosion_main.dds, forcefield_vortex_main.dds, forcefield_glow_main.dds, SquareParticle.png, fire_sparks_main.dds (64 px; renders almost nothing in practice) [S31][S69]. My look descriptions come from converting the .dds files to PNG; the engine tints them with `Color`.
- Legacy one-line effects still work: `Fire` (Heat 9 range -25 to 25, Size 5 range 2-30, Color orange, SecondaryColor brown; inner particles are additive so black inner color disappears), `Smoke` (Opacity 0.5 where 0 is invisible, RiseVelocity 1 range -25 to 25, Size 1 range 0.1-100), `Sparkles` (SparkleColor default purple 144,25,255, slowly shifts green-red when white), `Explosion` [S22][S30]. The docs recommend `ParticleEmitter` for anything detailed [S22].
- `Explosion` is a physics object first: default BlastPressure 500000, BlastRadius 4 (0-100), DestroyJointRadiusPercent 1, ExplosionType Craters (carves Terrain), Visible true; it kills unprotected Humanoids and breaks joints in range, parenting it anywhere live detonates it at once, and `Visible = false` keeps the physics but hides the graphic [S22][S30].

### VFX: Beam, Trail, Highlight, lights
- `Beam` needs Attachment0 and Attachment1 (different attachments); removing either stops rendering. Defaults [S29]: Width0 1, Width1 1, Segments 10, CurveSize0/1 0, FaceCamera false, LightEmission 0, LightInfluence 0, Brightness 1, TextureMode Stretch, TextureLength 1, TextureSpeed 1, Transparency 0.5 to 0.5, Color white, Enabled true. Width below 0 is set to 0. The curve is a cubic Bezier whose control points sit CurveSize0 studs along +X of Attachment0 and CurveSize1 studs along -X of Attachment1. TextureMode Wrap/Static repeats length/TextureLength times, Stretch repeats TextureLength times. A beam is a flat ribbon, so set `FaceCamera = true` if it must read from all angles [S2].
- `Trail` draws between two attachments as they move. Defaults [S29]: Lifetime 2 s (valid 0.01-20), MinLength 0.1, MaxLength 0 (unlimited), WidthScale 1 to 1 (a multiplier of the attachment distance, 0-1), Transparency 0.5 to 0.5, FaceCamera false, LightEmission 0, TextureMode Stretch, Enabled true. No texture draws a solid plane. Changing the attachments while drawing wipes drawn segments. Setting `Enabled = false` lets existing segments expire; call `Trail:Clear()` to remove them at once. TextureMode Static "stamps" the texture (paw prints, tire marks) [S3].
- `Highlight` defaults [S29]: FillColor red (1,0,0), FillTransparency 0.5, OutlineColor white, OutlineTransparency 0, DepthMode AlwaysOnTop, Enabled true, Adornee nil (parent it to the target or set Adornee; allowed containers include Workspace, StarterPlayer, StarterGui, StarterPack, ReplicatedStorage). The guide text says defaults of 0 for the transparencies; the engine data says FillTransparency 0.5, so always set values explicitly [S4][S29]. DepthMode Occluded hides it behind walls. Max 255 simultaneous (disabled ones still count; delete permanent ones); adding or removing a highlight rebuilds geometry and can spike, changing its properties is cheap, so reuse one Highlight and move `Adornee`; the first visible highlight costs up to about 1 ms GPU on mobile, more screen coverage costs more on mobile, nested highlighted objects can draw wrongly [S4][S40].
- Lights ([S21], defaults from [S30]): `PointLight` Range 8, Brightness 1, Color white, Shadows false; `SpotLight` Angle 90 (max 180), Range 16, Face Front; `SurfaceLight` Angle 90, Range 16, Face Front; Light must be a direct child of a BasePart or Attachment inside Workspace. Brightness does not enlarge the lit area (Range does). `Shadows = true` casts shadows; I found no official numeric limit on shadow-casting lights (unverified).

### Game feel ("juice")
- `Camera.FieldOfView` is vertical, clamped 1-120, default 70; the docs suggest raising it when sprinting and lowering it to magnify [S23]. `Humanoid.CameraOffset` shifts the camera in object space relative to the HumanoidRootPart and is the safe hook for bob, breathing and small shakes (community example: breath height 0.3, speed 3, driven by sin on RenderStepped, first person only) [S23][S57].
- Camera shake modules: Sleitnick's `RbxCameraShaker` (MIT, a port of Unity's EZ Camera Shake; presets Bump, Explosion, Earthquake, BadTrip, HandheldCamera, Vibration, RoughDriving; parameters magnitude, roughness, fadeIn, fadeOut) and `EZ Camera Shake V2` (2026-06-06; CameraShakeInstance with Magnitude, Roughness, FadeInTime, FadeOutTime, PositionInfluence, RotationInfluence, regions; applies `CFrame *=` at render priority `Enum.RenderPriority.Camera.Value + 16`) [S58][S59]. `RenderPriority`: First 0, Input 100, Camera 200, Character 300, Last 2000 [S29].
- Client-side effects: two community tutorials (and their comment threads) is that VFX and hit sounds are rendered on clients, with the server validating and broadcasting (`FireAllClients`), and that hitboxes and damage never move to the client; the originating client may play the effect immediately for zero latency [S54][S55].
- Hit-stop, screenshake, squash and stretch, and "juice" are described in two well-known talks (Jonasson and Purho, "Juice it or lose it"; Jan Willem Nijman, "The art of screenshake"); I could confirm only the titles, so no numbers are taken from them [S67][S68]. Every duration in the recipes below is [OWN].

## How to apply it (rules for an AI builder)

### Animation
- DO get the Animator with `humanoid:FindFirstChildOfClass("Animator")` (or under an `AnimationController` for non-humanoid rigs) and call `animator:LoadAnimation`. DON'T call `Humanoid:LoadAnimation`, `Humanoid:PlayEmote` or `Humanoid.AnimationPlayed` in new code.
- DO load each animation once per Animator and keep the AnimationTrack (`GetTrackByAnimationId` or your own table). DON'T call `LoadAnimation` on every attack.
- DO play NPC animations from the server (the Animator was created on the server) and player-character animations from the owning client.
- DO set `track.Priority` explicitly: `Idle` for idles, `Movement` for locomotion overrides, `Action` for attacks and emotes, `Action2`-`Action4` only for things that must override those. A track with the same priority blends by weight; a higher one replaces.
- DO use `Play(0.1)` for snappy actions, 0.15-0.25 for locomotion blends and `Stop(0.1-0.2)`; avoid fade 0.
- DO put named event markers (`Hit`, `FootstepL`, `Spawn`) in the animation and react with `GetMarkerReachedSignal`; check `track.Length > 0` before trusting length or keyframe times.
- DO publish animations with the experience owner (the group for group games) or share them in the asset's Permissions tab; the builder cannot invent animation IDs, so use the catalog IDs listed in [S7] or ask for an upload.
- DO use IKControl for look-at (`Type = LookAt`) and reach (`Type = Transform`/`Position`) and add Hinge/BallSocket constraints for elbows and wrists; DON'T add IK to many distant NPCs at once (cost unmeasured, unverified).
- DO set `Animator.PreferLodEnabled = false` only for hero NPCs; leave it true for crowds.
- DO NOT claim an Animation Graph works unless the target client and Studio have the feature (full release 2026-07-15); the roadmap says State Machine nodes and Luau expressions are still future (mid 2027) [S46][S50].

### Audio
- DO use `AudioPlayer` + `Wire` + `AudioEmitter/AudioDeviceOutput` for new work; DO set `AudioPlayer.Asset` (not `AssetId`).
- DO make sure a listener and an output exist: set `SoundService.DefaultListenerLocation` to Camera (or Character) in Studio, or create `AudioListener` (parent: `Workspace.CurrentCamera`) + `AudioDeviceOutput` + `Wire` yourself in a LocalScript. Do not rely on "Default", it depends on voice chat being enabled.
- DO route by bus: SFX, Music, Ambience, UI each through one `AudioFader` into the output, so a settings menu changes one `Volume` (0-3). The one-shot "play a clip" pattern is: create player + wire, `Play()`, destroy on `Ended`.
- DO treat AudioPlayer Volume 1 as the full-scale default; my starting mix is [OWN]: music 0.3-0.5, ambience 0.2-0.4, UI 0.4-0.6, SFX 0.6-1.0, announcements and voice 1.0; listen on a phone speaker and headphones. The official 2D tutorial uses 0.2 for background and 3 for emphasis [S26]. Official Sound docs warn that Volume above 2 on loud sources becomes overwhelming [S20].
- DO give repeated SFX variation: 3-5 sample variants and a random `PlaybackSpeed` of 0.92-1.08 [OWN]; PlaybackSpeed also changes pitch (2 = one octave up).
- DO duck music under voice or big stingers: music through `AudioCompressor` Input, trigger sound wired to its Sidechain pin; start with Threshold -30 dB, Ratio 6, Attack 0.05 s, Release 0.4 s [OWN]; confirm the pin with `compressor:GetInputPins()`.
- DO put `AudioLimiter` (MaxLevel -3 dB, Release 0.05 s [OWN]) before the output on loud games to protect ears.
- DO use `AudioEqualizer` or `AudioFilter` for muffling (underwater, behind a door) and `AudioReverb` for rooms (DecayTime 0.8-1.5 s small room, 2.5-4 s hall, 6-10 s cave, WetLevel -12 to -6 dB [OWN]); wire them after the listener to colour everything the player hears.
- DO set the 3D rolloff explicitly: `DistanceAttenuationMode = InverseTapered` or `Linear` with `DistanceAttenuationBounds` (e.g. 6 to 60 studs for a campfire, 20 to 200 for a waterfall [OWN]); the default mode is Custom with no curve set, which uses an inverse (1/distance style) rolloff that keeps sounds audible far away (exact curve unverified), and the bounds default (4, 10000) only applies to the non-Custom presets.
- DO turn on `SoundService.AcousticSimulationEnabled` only for atmosphere-focused games, never for competitive audio cues (it can switch itself off on weak devices) [S35].
- DO NOT put an AudioEmitter under a non-spatial parent (a Folder, Script): it is silent [S17].
- DON'T hardcode audio asset IDs from memory; search the library or let the owner upload. The engine files in `rbxasset://sounds/` listed above are safe placeholders (jump, land, footsteps, explosion impact, water impact).
- DON'T ship unlicensed music; use Creator Store audio, original uploads, or licensed catalog items, and remember a short sound (under 6 s) was the only public class in 2022 [S38].
- DO write TTS text under 300 characters and expect rate limits (1 + 6 x CCU requests per minute) [S36].

### VFX
- DO insert ParticleEmitters under an Attachment (rotate the attachment to aim; since 2025 attachments need no part [S44]). DON'T leave defaults: set `Texture`, `Color`, `Size` sequence, a `Transparency` sequence that ends at 1, `Lifetime`, `Speed`, `Rate`, `LightEmission`, `LightInfluence` and `Rotation` explicitly.
- DO set `LightInfluence = 0` for glows, fire and magic (full brightness at night) and 0.6-1 for smoke and dust that should darken in shadow.
- DO use `LightEmission = 1` (additive) for fire, sparkles, magic, energy; use 0 for smoke, dust, rain (normal blending).
- DO use one-shot bursts: `Enabled = false`, `Rate = 0`, and `emitter:Emit(count)`. Typical counts: 8-24 for pickups, 20-45 for explosions per emitter [OWN].
- DO budget: Rate x mean Lifetime is the live count per emitter; keep a single effect under about 150 live particles and the whole screen under about 600 on desktop and 250 on mobile [OWN, unverified]; hard caps are Rate 400/s (100/s mobile) and Lifetime 20 s.
- DO scale an effect for size by multiplying `Size` keypoints and `Speed` by k and `Rate` by about sqrt(k) [OWN].
- DO use the built-in textures (`rbxasset://textures/particles/...`) so no upload is needed; DON'T use `fire_sparks_main.dds` for sparks, use `sparkles_main.dds` [S69].
- DO create one-shot VFX on the client from a server event, and keep hit detection on the server [S54][S55].
- DO enable `Trail` only while an action lasts (and `Clear()` on stop); set `FaceCamera = true` for sword slashes and speed lines.
- DO use Beam `FaceCamera = true`, `LightEmission = 1` and a `Transparency` sequence that ends at 1 for energy beams; animate `TextureSpeed` or per-frame `CurveSize0/1` for lightning.
- DO reuse a single `Highlight` for hover/selection and change `Adornee`; stay far below 255; set `FillTransparency` and `OutlineTransparency` explicitly (1 hides that part).
- DO use `PointLight` on an Attachment next to fire or magic: Brightness 1.5-3, Range 12-18 for a campfire/torch, Shadows off unless it is the hero light [OWN].
- DON'T use the default `Explosion` for looks: set `BlastPressure = 0`, `DestroyJointRadiusPercent = 0`, `ExplosionType = NoCraters` (or `Visible = false` and use particles), and handle damage yourself.
- DON'T expect `ParticleEmitter` to be a UI effect yet; 2D (screen-space) particles are on the late-2026 roadmap [S50]. Use ViewportFrame/ImageLabel tweens for UI sparkle.

### Game feel
- DO add small feedback to every important action within one frame: sound, particle burst, a 0.1-0.2 s scale pop on the UI counter, and where fitting a camera nudge. Over-shaking hurts (a 2025 DevForum reviewer said heavy hit-stop made a 2D fighter look choppy) [S52, listing of an unrelated thread; treat as anecdotal].
- DO use trauma-style shake: add 0.2-0.3 for hits, 0.5-0.7 for explosions, decay about 1.5 per second, shake strength = trauma squared [OWN].
- DO use FOV kick: +6 to +10 degrees over 0.15 s (Quad Out) on sprint start or dash, return over 0.3 s [OWN].
- DO use hit-stop of 0.04-0.10 s on melee impact by `AdjustSpeed(0)` on the attacker and target tracks, then restore the previous speed [OWN].
- DO use squash and stretch on pickups, buttons and landings: scale (1.2, 0.8, 1.2) then back with `Back`/`Elastic` easing in 0.2-0.35 s [OWN].

## Recipes (each becomes a skill)
All numeric values in these recipes are [OWN] unless a source tag is shown. Ranges are verified [S29][S18][S1].

### Play, cache and chain animations on a character or NPC
When to use: attacks, emotes, spawn-in, idle overrides for a player character or an NPC rig.
Steps:
1. Find the Animator: player character `humanoid:FindFirstChildOfClass("Animator")` (the engine adds one); NPC Humanoid rig: same on the server, creating `Instance.new("Animator")` under the Humanoid if missing; non-humanoid rig: `AnimationController` with a child `Animator`.
2. Build an `Animation` with `AnimationId = "rbxassetid://<id>"` (catalog IDs from [S7] or the owner's uploads).
3. `local track = animator:GetTrackByAnimationId(id) or animator:LoadAnimation(anim)`; set `track.Priority = Enum.AnimationPriority.Action`, `track.Looped = false`.
4. `track:Play(0.1, 1, 1)`. Chain with `track.Stopped:Wait()` or `track.Ended:Once(...)`.
5. React to markers: `track:GetMarkerReachedSignal("Hit"):Connect(...)`; disconnect on `Stopped`.
6. To cancel early call `track:Stop(0.15)`; to blend two actions use `AdjustWeight(w, fade)`.
Pitfalls: Animator inside Workspace before `LoadAnimation`; animation not owned by the experience owner will not play for others [S49]; `Stop` then `AdjustWeight` does nothing until `Play` [S6]; a default-animation replacement must end on a keyframe named `End` [S10].

### Replace default locomotion with a catalog pack
When to use: give every player a ninja, zombie or toy walk.
Steps:
1. Server Script in ServerScriptService; on `player.CharacterAppearanceLoaded` get `character:WaitForChild("Animate")`.
2. Stop all playing tracks with `playingTrack:Stop(0)` (as in [S7]).
3. Assign `animateScript.run.RunAnim.AnimationId`, `walk.WalkAnim`, `jump.JumpAnim`, `fall.FallAnim`, `climb.ClimbAnim`, `idle.Animation1/2` from one pack row in [S7] (Ninja: run 656118852, walk 656121766, jump 656117878, fall 656115606, climb 656114359).
4. Optional idle weights: `idle.Animation1.Weight.Value = 5`, `idle.Animation2.Weight.Value = 10` gives 1/3 and 2/3 [S7].
Pitfalls: R6 vs R15 packs can differ (verify the rig type; some packs such as Rthro target a different body shape, unverified); changes on the client alone do not replicate the movement state to others.

### NPC rig animation without a Humanoid (AnimationController)
When to use: statues, creatures, props with Motor6D or AnimationConstraint joints.
Steps: 1. Under the rig add `AnimationController` then `Animator` on the server. 2. Load and play on the server so it replicates. 3. For distant or many NPCs leave `PreferLodEnabled = true`. 4. For a hero creature set it false. 5. Use `Animator.EvaluationThrottled` to skip procedural offsets on stale frames [S5].
Pitfalls: `AnimationController:LoadAnimation` is deprecated, always `Animator:LoadAnimation`; animator created on a client will not replicate [S5][S29].

### Footsteps and impact sounds from animation markers
When to use: footstep dust and sound that stay in sync at any walk speed.
Steps: 1. In the Animation Editor show the event track, add `FootstepL`/`FootstepR` on touch-down frames (copy-paste duplicates). 2. In script connect `GetMarkerReachedSignal("FootstepL")` per track. 3. In the handler play a pooled 3D one-shot at the foot (see audio recipes) with `PlaybackSpeed = 0.95 + math.random()*0.1`, and `Emit(3)` on a dust emitter. 4. Gate on `humanoid.FloorMaterial` for surface variants [S8].
Pitfalls: markers fire on every client that plays the track, so play only locally relevant sound (own character full volume, others quieter via emitter distance).

### Procedural motion with Tween and a spring (pickups, UI pops, camera lag)
When to use: floating/bobbing coins, button pops, smooth follow.
Steps: 1. Bob: tween `Position` by +1 stud with `TweenInfo.new(1.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)`. 2. Spin: in `RunService.Heartbeat` multiply CFrame by `CFrame.Angles(0, dt * math.rad(120), 0)`. 3. Pop (squash and stretch): tween Size to 1.2x/0.8x in 0.08 s Quad Out, then to 1x in 0.25 s with `Back` Out. 4. For interruptible motion that retargets every frame use the spring snippet below instead of recreating tweens.
Pitfalls: a Tween's goal cannot change after creation and a second tween on the same property cancels the first [S24]; tweening many Parts every frame is costly, prefer one controller loop; spring dt must be clamped.

### 2D UI or pickup sound (non-positional)
When to use: button clicks, level-up stingers, currency ticks, music.
Steps: 1. Ensure one `AudioDeviceOutput` under SoundService (the engine adds one if DefaultListenerLocation is Camera or Character [S14]). 2. Per play create `AudioPlayer` (`Asset`, `Volume`), a `Wire` (`SourceInstance = player`, `TargetInstance = output`), `Parent = SoundService`, `Play()`, destroy on `Ended` (snippet below). 3. Route through a bus `AudioFader` if you have volume sliders. 4. Pitch ladder for combos: `PlaybackSpeed = 1.0595 ^ comboIndex`, capped at 12 steps (one octave) [OWN].
Pitfalls: `Ended` does not fire for looping or stopped players; assets must be loaded (`IsReady`) before the first `Play` if latency matters, so preload with a hidden player at game start.

### 3D positional sound (campfire, door, explosion, NPC voice)
When to use: anything the player should localise.
Steps: 1. Under the sounding Part or Attachment add `AudioPlayer` (`Asset`, `Looping` for loops), `AudioEmitter`, and a `Wire` from player to emitter. 2. Emitter: `DistanceAttenuationMode = Enum.DistanceAttenuationMode.InverseTapered`, `DistanceAttenuationBounds = NumberRange.new(6, 60)` for a campfire. 3. Make sure a listener exists (DefaultListenerLocation Camera or a manual `AudioListener` on the camera wired to an `AudioDeviceOutput`). 4. For directional sources `SetAngleAttenuation({[0]=1,[90]=0.6,[180]=0.25})`. 5. Optional `AudioInteractionGroup` strings for team-only sounds. 6. One-shot: create the trio, play, destroy on `Ended`.
Pitfalls: a Folder/Script parent is silent [S17]; the default mode is Custom with no curve, so set a mode explicitly; server-created one-shots replicate with latency, so use client-created ones for sub-100 ms feedback.

### Ambient bed, random one-shots and music with ducking
When to use: forests, caves, cities; background music that yields to voice.
Steps: 1. Layers: a loop of 30-48 s (looping bed), plus a looping tonal bed, plus 10-30 short random clips (under about 10 s) triggered at random intervals around the player, as the 2025 environmental-audio tutorial recommends (its park example uses 27 bird calls, 6 rustles, 6 wind variations) [S62]. 2. Buses: Ambience fader 0.3, Music fader 0.4, SFX fader 0.9 into one output [OWN]. 3. Crossfade music by tweening two faders' `Volume` over 2-4 s, both started, then `Stop` the old one. 4. Ducking: music -> `AudioCompressor` Input; voice/stinger player -> same compressor `Sidechain`; Threshold -30, Ratio 6, Attack 0.05, Release 0.4 [OWN]. 5. Optional `AudioLimiter` last.
Pitfalls: very short loops are obvious; random one-shots must avoid repeats of the same clip twice in a row; ducking needs the sidechain pin name from `GetInputPins()`; community tools (AudioEngine, Audiophile mixing console, Resonance wrapper) exist if the builder wants a ready system [S63][S64][S65].

### Underwater, indoor reverb and cave echo
When to use: zone-based audio colouring.
Steps: 1. Create a global post-listener chain: `AudioListener` -> `AudioFilter` (`FilterType = Lowpass12dB`, `Frequency = 1000`, `Q = 0.707`) -> `AudioReverb` -> `AudioDeviceOutput`. 2. When the camera enters water set filter Frequency 20000 -> 900 over 0.3 s (tween), and back on exit. 3. Rooms: `AudioReverb` with DecayTime 1.2, WetLevel -10, DryLevel 0, HighCutFrequency 9000 (small room); DecayTime 3.5, WetLevel -8 (hall); DecayTime 8, WetLevel -6, LowShelfGain -6 (cave) [OWN]. Switch values by zone with a short tween.
Pitfalls: a filter with `Bypass = true` is transparent, use it to switch the effect off cheaply [S18]; Acoustic Simulation can do much of this automatically but is off by default and unreliable on low-end devices [S35]; reverb through legacy `SoundService.AmbientReverb` only affects legacy Sounds [S19].

### Fire (loop) with flicker light
When to use: campfires, torches, braziers, burning props.
Steps (all [OWN]):
1. Attachment at the flame base (aimed up). ParticleEmitter "Flames": Texture `rbxasset://textures/particles/explosion01_core_main.dds` (orange puff; `fire_main.dds` is a darker, brown option to test), Color sequence 0 = (255,200,90), 0.5 = (255,110,20), 1 = (120,30,10); Size 0:0.8, 0.35:1.6, 1:0.2; Transparency 0:0.35, 0.7:0.55, 1:1; Lifetime 0.5-0.9; Speed 2-4; SpreadAngle (12,12); Acceleration (0,5,0); Drag 1.5; Rate 30; Rotation 0-360; RotSpeed -45 to 45; LightEmission 1; LightInfluence 0; EmissionDirection Top.
2. Second emitter "Embers": Texture sparkles_main.dds; Color 0 = (255,210,120), 1 = (255,80,20); Size 0:0.3, 1:0; Transparency 0:0, 1:1; Lifetime 1-2; Speed 2-5; SpreadAngle (30,30); Acceleration (0.5,3,0); Rate 6; LightEmission 1.
3. PointLight (same attachment): Color (255,150,60), Brightness 1.8, Range 14, Shadows false. Flicker in a loop: `light.Brightness = 1.8 + (math.noise(os.clock()*6) * 0.8)` each Heartbeat (math.noise returns about -0.5 to 0.5).
4. 3D loop sound: crackle loop through emitter with bounds 4-40.
Pitfalls: Transparency left at default never fades; point lights are cheap but many shadowed ones are not; legacy `Fire` object (Heat 9, Size 5) is acceptable for background props [S22].

### Smoke (loop)
When to use: chimneys, wrecks, extinguished fires.
Steps ([OWN]): ParticleEmitter, Texture smoke_main.dds; Color 0 = (110,110,115), 1 = (60,60,65); Size 0:1.5, 1:6; Transparency 0:1, 0.15:0.5, 1:1; Lifetime 3-5; Speed 2-3; SpreadAngle (15,15); Acceleration (0.5,1,0) for wind; Drag 0.8; Rate 7; Rotation 0-360; RotSpeed -20 to 20; LightEmission 0; LightInfluence 0.8; ZOffset -0.5 to sit behind fire.
Pitfalls: smoke is the main overdraw cost (large, overlapping, translucent): live particles = 7 x 4 = about 28 here; do not exceed that by an order of magnitude on mobile.

### Sparkles and a "rare item" shimmer (loop)
When to use: rare pets, chests, shop highlights, checkpoints.
Steps ([OWN]): ParticleEmitter under the object's part, Shape Sphere, ShapeStyle Volume; Texture sparkles_main.dds; Color 0 = (255,255,255), 0.5 = (255,240,170), 1 = (180,220,255); Size 0:0, 0.3:0.5, 0.7:0.4, 1:0 (twinkle in and out); Transparency 0:0.1, 1:1; Lifetime 0.8-1.6; Speed 0.2-0.8; SpreadAngle (180,180); Rate 9; Rotation 0-360; RotSpeed -60 to 60; LightEmission 1; LightInfluence 0. Pair with a very slow-pulsing `Highlight` outline (OutlineTransparency tween 0.3 to 0.8) for chests.
Pitfalls: Sphere/Cylinder shapes need a BasePart parent, not an Attachment [S1]; the legacy `Sparkles` object works but has a purple default.

### Magic burst (one-shot)
When to use: spell impact, level up, ability proc, egg hatch.
Steps ([OWN]): 1. Three ParticleEmitters, all `Enabled = false`, `Rate = 0`. Flash: sparkles_main (or the shockwave ring texture at small size), Color (210,150,255), Size 0:2, 0.3:6, 1:7, Transparency 0:0, 1:1, Lifetime 0.3, Speed 0, LightEmission 1; emit 1. Ring: explosion01_shockwave_main.dds, Color 0 = (230,190,255), 1 = (140,70,255), Size 0:1, 1:10, Transparency 0:0, 1:1, Lifetime 0.5, Speed 0, Orientation VelocityPerpendicular, LightEmission 1; emit 1 (verify it lies flat in Studio, since speed 0 leaves the direction to the emission face). Shards: sparkles_main, Color 0 = (255,230,255), 1 = (150,80,255), Size 0:0.8, 1:0, Lifetime 0.4-0.8, Speed 14-24, SpreadAngle (180,180), Drag 5, RotSpeed -200 to 200, LightEmission 1; emit 20. 2. PointLight Color (200,140,255) Brightness 4, Range 18, tween Brightness to 0 over 0.3 s then destroy. 3. Trigger: `for _, e in container:GetChildren() do if e:IsA("ParticleEmitter") then e:Emit(e:GetAttribute("EmitCount") or 16) end end` (store counts in an attribute). 4. Pair a rising whoosh + impact chime one-shot.
Pitfalls: Emit on a disabled emitter still spawns; do not parent the burst to something destroyed within the particle lifetime (use `task.delay(1.5, ...)` to clean up).

### Coin pickup (VFX + sound + UI)
When to use: any collectible currency.
Steps: 1. Coin Part (Anchored, CanCollide false, CanTouch true), bobbing and spinning (see the procedural recipe). 2. On server `Touched` validate the player and grant the currency once (debounce); then fire the client with the position. 3. Client plays: gold glints ParticleEmitter (sparkles_main.dds, Color 0 = (255,236,140) to 1 = (255,190,40), Size 0:0.9, 0.4:0.7, 1:0, Transparency 0:0, 0.8:0.2, 1:1, Lifetime 0.6-1.1, Speed 10-18, SpreadAngle (55,55), Acceleration (0,-30,0), Drag 1.5, LightEmission 1) `Emit(16)`; short flash (Size 1.5 to 4, Lifetime 0.3). 4. Sound: a 0.2-0.5 s bright "ding" with `PlaybackSpeed` rising 1.0595 per consecutive pickup within 1.5 s [OWN]. 5. Coin shrinks to 0 in 0.12 s with `Back` In easing, then Destroy. 6. UI counter: UIScale 1 -> 1.2 -> 1 in 0.15 s; number tweens up over 0.25 s.
Pitfalls: grant currency on the server only, effects on the client; many simultaneous coins need a pooled sound player and an emit cap per frame.

### Explosion (visual + sound + shake, no physics)
When to use: bombs, rockets, destructible props, boss death.
Steps ([OWN]): 1. Do not use the default `Explosion` for looks. Emitters (all disabled, Rate 0): Fireball (explosion01_core_main.dds, Color 0 = (255,240,180), 0.3 = (255,140,30), 1 = (90,30,10), Size 0:3, 0.3:9, 1:11, Transparency 0:0, 0.5:0.4, 1:1, Lifetime 0.5-0.8, Speed 4-10, SpreadAngle (180,180), Drag 4, LightEmission 1, RotSpeed -90 to 90; emit 14); Shockwave (shockwave ring, Size 0:2, 1:26, Lifetime 0.45, Transparency 0:0.1, 1:1, additive; emit 1); Sparks (sparkles_main, Size 0:0.5, 1:0, Lifetime 0.6-1.2, Speed 35-60, Acceleration (0,-40,0), Drag 2, Orientation VelocityParallel, additive; emit 40); Smoke (smoke_main, Color 0 = (90,80,75), 1 = (45,45,45), Size 0:4, 1:14, Transparency 0:0.3, 1:1, Lifetime 2-3.5, Speed 6-12, Drag 3, Acceleration (0,3,0), LightInfluence 0.7; emit 12). 2. PointLight Brightness 6, Range 40 tweened to 0 in 0.25 s. 3. Sound: `rbxasset://sounds/impact_explosion_03.mp3` as a placeholder through a 3D emitter (bounds 10-300), a low-pass pass on the tail optional. 4. Camera shake trauma +0.6 scaled by `1 - distance/80`. 5. Damage and force on the server: if you use the `Explosion` class, set `BlastPressure = 0`, `DestroyJointRadiusPercent = 0`, `ExplosionType = NoCraters`, `Visible = false`, and use `Hit` or your own radius query [S22].
Pitfalls: default Explosion breaks joints, kills Humanoids and carves terrain; shockwave ring orientation needs a Studio check; cap simultaneous explosions.

### Rain (area emitter that follows the player)
When to use: storms and mood scenes.
Steps ([OWN], with orientation notes seen in this repo's preset work [S69]): 1. A transparent anchored Part (Transparency 1, CanCollide false, CanQuery false, size about 90 x 1 x 90) kept 45 studs above the camera by a RenderStepped update. 2. ParticleEmitter on it: Texture `rbxasset://textures/particles/SquareParticle.png`, Shape Box, EmissionDirection Bottom, Orientation VelocityParallel, Color (190,210,235), Size 0.25 constant, Squash -2 constant (verify the streak is vertical), Transparency 0.25 constant, Lifetime 0.9-1.1, Speed 70-80, SpreadAngle (2,2), LightEmission 0.2, LightInfluence 0, Rate 300 on desktop and 90 on touch devices (docs cap: 400/s, 100/s mobile [S1]). 3. Sound: looping rain through the 2D bus at Volume 0.3; behind a Lowpass filter when indoors. 4. Optional ground splashes: small ring emitter on terrain hits is not recommended on mobile.
Pitfalls: a rate over the platform cap is clamped; rain under a roof needs a raycast check or a roof-zone Enabled toggle; fog and Atmosphere do more for mood than particle count.

### Dust puffs (landing, footsteps, vehicles)
When to use: movement feedback.
Steps ([OWN]): ParticleEmitter on an Attachment at the feet, Texture smoke_main.dds, Color 0 = (190,165,130), 1 = (150,130,100), Size 0:0.8, 1:2.5, Transparency 0:0.5, 1:1, Lifetime 0.5-0.9, Speed 2-4, SpreadAngle (70,70), Drag 3, Acceleration (0,1,0), LightInfluence 0.8, `Enabled = false`. On `Humanoid.StateChanged` to Landed (or a Footstep marker) call `Emit(5)` (landing 8-10 if fall speed above a threshold). For vehicles: Enabled with Rate 22 while speed > 10, `VelocityInheritance` 0.3.
Pitfalls: pick color from the floor Material or the terrain colour (grass vs sand); keep Emit counts small; dust must fade to 1.

### Sword slash, dash and speed trails
When to use: melee swings, dashes, projectiles.
Steps ([OWN]): 1. Two Attachments on the blade about 3 studs apart (tip and guard), or on the player's back for a dash. 2. `Trail` Attachment0/1, Lifetime 0.3, MinLength 0.1, Color 0 = (255,255,255), 1 = (120,200,255), Transparency 0:0.2, 1:1, WidthScale 1 -> 0, LightEmission 1, FaceCamera true, no texture. 3. `Enabled = true` at swing start via marker, false at swing end, `Clear()` when the tool unequips. 4. Add a 0.06 s hit-stop and a 0.25 trauma shake on hit (see game-feel recipe).
Pitfalls: changing attachments while drawing erases segments [S3]; a trail on a character that teleports draws a streak, so `Clear()` after teleports.

### Beams: lasers, tethers and lightning
When to use: laser traps, connection lines, lightning, healing links.
Steps ([OWN]): 1. Two attachments; Beam Attachment0/1, Width0 0.3, Width1 0.3, Color red-orange to white, LightEmission 1, FaceCamera true, Transparency sequence 0:0, 0.9:0.2, 1:1, Segments 10 for straight, 20 for curvy. 2. Lightning: each 0.05 s set `CurveSize0 = math.random(-6, 6)`, `CurveSize1 = math.random(-6, 6)` and flash Width between 0.2 and 0.5. 3. Textured energy: TextureMode Wrap, TextureLength 4, TextureSpeed 2.
Pitfalls: beams do not render unless both attachments exist; a Beam is flat unless FaceCamera is true [S2].

### Interactive Highlight (hover, selection, team outlines)
When to use: the thing the player can pick up or talk to, teammates through walls.
Steps: 1. Create ONE Highlight in Workspace; per hover set `Adornee = target`, `FillTransparency = 1`, `OutlineColor = Color3.fromRGB(255,235,90)`, `OutlineTransparency = 0`, `DepthMode = Enum.HighlightDepthMode.Occluded` [OWN]. 2. For team members: `DepthMode = AlwaysOnTop`, `FillTransparency = 0.8`, team colour. 3. Remove by `Adornee = nil` or `Enabled = false` temporarily; delete permanently unused ones.
Pitfalls: more than 255 are ignored; creating and destroying per hover causes spikes [S4]; the first highlight carries most of the mobile cost.

### Game feel kit (camera shake, FOV kick, hit-stop, squash and stretch)
When to use: combat, collection, dashes, UI rewards.
Steps ([OWN]): 1. Camera shake with trauma (snippet below) bound at `Enum.RenderPriority.Camera.Value + 1`. 2. FOV kick tween `FieldOfView` 70 to 78 over 0.15 s Quad Out, back over 0.3 s. 3. Hit-stop `AdjustSpeed(0)` for 0.06 s on attacker and victim tracks. 4. Squash on land: Part Size multiply (1.15, 0.8, 1.15) back with Back Out 0.25 s (cosmetic parts only). 5. Sound and flash on the same frame as the hit. 6. Provide a settings toggle to reduce shake for comfort.
Pitfalls: shake and bob can induce motion sickness; keep magnitude low and offer an off switch; hit-stop must restore the exact previous speed; do not freeze animations on the server authoritative character without matching physics.

### Replicating one-shot effects safely
When to use: abilities, impacts, pickups seen by many players.
Steps: 1. The acting client sends a RemoteEvent request. 2. The server validates cooldown, range and hit, applies damage, then `FireAllClients(effectName, cframe)` (or FireClient for personal effects). 3. Each client clones the effect from ReplicatedStorage, parents it to Workspace, `Emit`s, and cleans up with `task.delay`. 4. The acting client may play its own copy immediately and ignore the echo.
Pitfalls: do not replicate hitboxes from clients; server-side VFX raise load and ping [S54][S55].

## Luau reference snippets
All APIs below exist in the engine data of build 0.741.19.7411056 [S29]; behaviour tagged OWN is my design.

```lua
--!strict
-- 1. Animator access, track cache, play with marker (client or server, see Animator rules)
local function getAnimator(model: Model): Animator?
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local holder: Instance? = humanoid or model:FindFirstChildOfClass("AnimationController")
	return holder and holder:FindFirstChildOfClass("Animator") or nil
end

local function loadTrack(animator: Animator, animationId: string): AnimationTrack
	local existing = animator:GetTrackByAnimationId(animationId)
	if existing then
		return existing
	end
	local animation = Instance.new("Animation")
	animation.AnimationId = animationId
	return animator:LoadAnimation(animation)
end

local function playAction(animator: Animator, animationId: string, onHit: (() -> ())?): AnimationTrack
	local track = loadTrack(animator, animationId)
	track.Priority = Enum.AnimationPriority.Action
	track.Looped = false
	local conn: RBXScriptConnection? = nil
	if onHit then
		conn = track:GetMarkerReachedSignal("Hit"):Connect(function(_param: string)
			onHit()
		end)
	end
	track.Stopped:Once(function()
		if conn then
			conn:Disconnect()
		end
	end)
	track:Play(0.1, 1, 1)
	return track
end
```

```lua
--!strict
-- 2. Modern audio helpers (client LocalScript). One-shot 2D and 3D, wired, self-cleaning.
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local output = SoundService:FindFirstChildOfClass("AudioDeviceOutput")
if not output then
	output = Instance.new("AudioDeviceOutput")
	output.Parent = SoundService
end

local function wire(source: Instance, target: Instance, targetPin: string?): Wire
	local w = Instance.new("Wire")
	w.SourceInstance = source
	w.TargetInstance = target
	if targetPin then
		w.TargetName = targetPin -- e.g. "Sidechain" on an AudioCompressor
	end
	w.Parent = target
	return w
end

local function play2D(assetId: string, volume: number?, speed: number?)
	local player = Instance.new("AudioPlayer")
	player.Asset = assetId -- not AssetId (deprecated)
	player.Volume = volume or 1
	player.PlaybackSpeed = speed or 1
	wire(player, output :: Instance)
	player.Parent = SoundService
	player.Ended:Once(function()
		player:Destroy()
	end)
	player:Play()
end

local function play3D(assetId: string, parent: Instance, volume: number?, minDist: number?, maxDist: number?)
	local player = Instance.new("AudioPlayer")
	player.Asset = assetId
	player.Volume = volume or 1
	local emitter = Instance.new("AudioEmitter")
	emitter.DistanceAttenuationMode = Enum.DistanceAttenuationMode.InverseTapered
	emitter.DistanceAttenuationBounds = NumberRange.new(minDist or 6, maxDist or 80)
	wire(player, emitter)
	player.Parent = parent
	emitter.Parent = parent -- parent must be a BasePart, Attachment or Camera
	player.Ended:Once(function()
		player:Destroy()
		emitter:Destroy()
	end)
	player:Play()
end

-- Own listener if DefaultListenerLocation is not set to Camera/Character in Studio:
local function ensureListener()
	local camera = Workspace.CurrentCamera
	if camera and not camera:FindFirstChildOfClass("AudioListener") then
		local listener = Instance.new("AudioListener")
		listener.Parent = camera
		wire(listener, output :: Instance)
	end
end
```

```lua
--!strict
-- 3. Ducking: music under a stinger via AudioCompressor sidechain (values OWN)
local function buildDuck(music: AudioPlayer, stinger: AudioPlayer, out: Instance)
	local comp = Instance.new("AudioCompressor")
	comp.Threshold = -30
	comp.Ratio = 6
	comp.Attack = 0.05
	comp.Release = 0.4
	comp.Parent = music.Parent
	-- confirm pin names at runtime: print(comp:GetInputPins())
	local w1 = Instance.new("Wire"); w1.SourceInstance = music; w1.TargetInstance = comp; w1.Parent = comp
	local w2 = Instance.new("Wire"); w2.SourceInstance = stinger; w2.TargetInstance = comp; w2.TargetName = "Sidechain"; w2.Parent = comp
	local w3 = Instance.new("Wire"); w3.SourceInstance = comp; w3.TargetInstance = out; w3.Parent = comp
end
```

```lua
--!strict
-- 4. One-shot burst from a container of disabled emitters (counts stored as attributes)
local function burst(container: Instance)
	for _, child in container:GetDescendants() do
		if child:IsA("ParticleEmitter") then
			child:Emit((child:GetAttribute("EmitCount") :: number?) or 16)
		end
	end
end
```

```lua
--!strict
-- 5. Critically-damped-ish spring (OWN design, semi-implicit Euler with sub-steps)
export type Spring = { pos: number, vel: number, target: number, freq: number, damp: number }

local function newSpring(pos: number, freq: number, damp: number): Spring
	return { pos = pos, vel = 0, target = pos, freq = freq, damp = damp }
end

local function stepSpring(s: Spring, dt: number): number
	dt = math.min(dt, 1 / 20)
	local steps = math.max(1, math.ceil(dt / (1 / 120)))
	local h = dt / steps
	local k = s.freq * s.freq
	local c = 2 * s.damp * s.freq
	for _ = 1, steps do
		s.vel += ((s.target - s.pos) * k - s.vel * c) * h
		s.pos += s.vel * h
	end
	return s.pos
end
```

```lua
--!strict
-- 6. Camera shake (trauma model, OWN) + FOV kick + hit-stop
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local camera = workspace.CurrentCamera :: Camera

local trauma = 0
local function addTrauma(amount: number)
	trauma = math.min(1, trauma + amount)
end

RunService:BindToRenderStep("CameraShake", Enum.RenderPriority.Camera.Value + 1, function(dt: number)
	trauma = math.max(0, trauma - dt * 1.5)
	if trauma <= 0 then
		return
	end
	local strength = trauma * trauma
	local t = os.clock() * 25
	local rx = math.noise(t, 0, 1) * strength * math.rad(4)
	local ry = math.noise(t, 7, 2) * strength * math.rad(4)
	local rz = math.noise(t, 13, 3) * strength * math.rad(2)
	camera.CFrame *= CFrame.Angles(rx, ry, rz)
end)

local baseFov = camera.FieldOfView
local function fovKick(delta: number)
	TweenService:Create(camera, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { FieldOfView = baseFov + delta }):Play()
	task.delay(0.15, function()
		TweenService:Create(camera, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { FieldOfView = baseFov }):Play()
	end)
end

local function hitStop(tracks: { AnimationTrack }, seconds: number)
	local previous: { number } = {}
	for i, track in tracks do
		previous[i] = track.Speed
		track:AdjustSpeed(0)
	end
	task.delay(seconds, function()
		for i, track in tracks do
			if track.IsPlaying then
				track:AdjustSpeed(previous[i])
			end
		end
	end)
end
```

```lua
--!strict
-- 7. Pickup bob, squash-and-pop and a reusable Highlight (values OWN)
local TweenService = game:GetService("TweenService")

local function bob(part: BasePart)
	local info = TweenInfo.new(1.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
	TweenService:Create(part, info, { Position = part.Position + Vector3.new(0, 1, 0) }):Play()
end

local function pop(part: BasePart)
	local base = part.Size
	local up = TweenService:Create(part, TweenInfo.new(0.08, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = base * Vector3.new(1.2, 0.8, 1.2) })
	local down = TweenService:Create(part, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Size = base })
	up.Completed:Once(function()
		down:Play()
	end)
	up:Play()
end

local hover = Instance.new("Highlight")
hover.FillTransparency = 1
hover.OutlineColor = Color3.fromRGB(255, 235, 90)
hover.OutlineTransparency = 0
hover.DepthMode = Enum.HighlightDepthMode.Occluded
hover.Parent = workspace
local function setHover(target: Instance?)
	hover.Adornee = target
end
```

```lua
--!strict
-- 8. Rain that follows the camera (client; rate capped for touch devices; values OWN)
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local camera = workspace.CurrentCamera :: Camera
local sheet = Instance.new("Part")
sheet.Anchored = true
sheet.CanCollide = false
sheet.CanQuery = false
sheet.CanTouch = false
sheet.Transparency = 1
sheet.Size = Vector3.new(90, 1, 90)
sheet.Parent = workspace

local rain = Instance.new("ParticleEmitter")
rain.Texture = "rbxasset://textures/particles/SquareParticle.png"
rain.Shape = Enum.ParticleEmitterShape.Box
rain.EmissionDirection = Enum.NormalId.Bottom
rain.Orientation = Enum.ParticleOrientation.VelocityParallel
rain.Color = ColorSequence.new(Color3.fromRGB(190, 210, 235))
rain.Size = NumberSequence.new(0.25)
rain.Squash = NumberSequence.new(-2)
rain.Transparency = NumberSequence.new(0.25)
rain.Lifetime = NumberRange.new(0.9, 1.1)
rain.Speed = NumberRange.new(70, 80)
rain.SpreadAngle = Vector2.new(2, 2)
rain.LightEmission = 0.2
rain.LightInfluence = 0
rain.Rate = if UserInputService.TouchEnabled then 90 else 300
rain.Parent = sheet

RunService.RenderStepped:Connect(function()
	sheet.Position = camera.CFrame.Position + Vector3.new(0, 45, 0)
end)
```

```lua
--!strict
-- 9. Server broadcasts one-shot VFX; clients render (RemoteEvent "Fx" in ReplicatedStorage)
-- Server:
--   fxRemote:FireAllClients("MagicBurst", targetCFrame)
-- Client:
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local fxRemote = ReplicatedStorage:WaitForChild("Fx") :: RemoteEvent
fxRemote.OnClientEvent:Connect(function(name: string, cf: CFrame)
	local template = ReplicatedStorage:WaitForChild("Effects"):FindFirstChild(name)
	if not template then
		return
	end
	local fx = template:Clone() :: BasePart
	fx.CFrame = cf
	fx.Parent = workspace
	for _, e in fx:GetDescendants() do
		if e:IsA("ParticleEmitter") then
			e:Emit((e:GetAttribute("EmitCount") :: number?) or 16)
		end
	end
	task.delay(3, function()
		fx:Destroy()
	end)
end)
```

## Open questions / unverified
- None of the [OWN] effect and mix numbers were rendered or listened to by me; they sit inside verified ranges but need a Studio screenshot pass (and a phone-speaker listen for audio).
- The two game-feel talks ([S67], [S68]) were only confirmed by title and channel; no hit-stop or shake figures come from them. I found no Roblox-specific hit-stop write-up (DevForum search for "hitstop" returned only hitbox libraries) [S52].
- No official numeric guidance was found for: shadow-casting light limits, total live-particle budgets, AudioPlayer loudness targets (LUFS), maximum `Emit()` count per call, or IKControl cost. My budgets are marked [OWN]. Some planned searches were not run because the session's web-search allowance ran out (shadow-light limits, audio loudness standards).
- The live docs site and the docs repository can disagree: Highlight transparency defaults (guide says 0, engine data says FillTransparency 0.5), `AudioPlayer.AssetId` (docs prose) versus `Asset` (current, `AssetId` deprecated), `Humanoid:PlayEmote` (guide) versus `PlayEmoteAsync`, free audio import quotas (2022 post: 10/100; current doc: 100/2,000). I followed the engine data.
- The Audio Upload License Agreement page returned 403, so its exact terms are unverified; the 2022 post only describes the privacy change.
- Behaviour when an animation asset is not permitted for an experience is not documented in the sources read.
- Whether `SoundService.DefaultListenerLocation` can be set reliably from a server script and replicates is unverified; set it in Studio or build the listener on the client (snippet 2).
- The exact orientation of a flat ring (speed 0, VelocityPerpendicular) and the look of `fire_main.dds` versus `explosion01_core_main.dds` need a Studio check; my texture notes come from converting the .dds files, not from rendering in Roblox.
- Built-in `rbxasset://textures/particles/*` and `rbxasset://sounds/*` were confirmed in the installed Studio content folder (build 0.741); the repository's own preset notes treat them as shipping in every client, but I did not test published mobile clients.
- Animation Graph runtime cost, node limits and the status of in-experience playback on older clients are not documented in what I read; beta notes said "no maximum node count established" [S45].
- The R6 versus R15 animation compatibility rules were not re-verified here beyond Adaptive Animation (any R15 animation can drive a mapped custom rig) and the R6 to R15 adapter [S11][S27].
- Legacy `Sound` auto-routing through the new Audio engine is implied by `Sound:GetUnderlyingAudioPlayer()` but not documented; acoustic simulation for legacy `Sound` is scheduled early 2027 [S29][S50].
- Repo-fit note (internal): the Studio plugin's allowlist in `apps/apple-plugin/src/Commands.luau` currently lists ParticleEmitter, Beam, Trail, Highlight, Sound, SoundGroup, the three lights, Fire, Smoke, Sparkles, Attachment and BloomEffect, and permits the engine particle textures above, but it does not list AudioPlayer, AudioEmitter, AudioListener, AudioDeviceOutput, Wire, the audio effects, Animator, Animation, IKControl or Explosion (checked 2026-10-04, read only). Audio-API and animation recipes therefore have to be delivered through scripts, or the allowlist extended by the owner [S69].

## Sources
Official documentation (create.roblox.com/docs; text read from the Roblox/creator-docs repository on GitHub, branch main, 2026-10-04, equals the site source):
[S1] ParticleEmitter class reference and "Particle emitters" guide, Roblox, 2026-10-04 fetch. https://create.roblox.com/docs/reference/engine/classes/ParticleEmitter and https://create.roblox.com/docs/effects/particle-emitters (live copy also at https://create.roblox.com/docs/building-and-visuals/lighting-and-effects/particle-emitters)
[S2] Beam class reference and "Beams" guide, Roblox. https://create.roblox.com/docs/reference/engine/classes/Beam , https://create.roblox.com/docs/effects/beams
[S3] Trail class reference and "Trails" guide, Roblox. https://create.roblox.com/docs/reference/engine/classes/Trail , https://create.roblox.com/docs/effects/trails
[S4] Highlight class reference and "Highlighting objects" guide, Roblox. https://create.roblox.com/docs/reference/engine/classes/Highlight , https://create.roblox.com/docs/effects/highlighting
[S5] Animator class reference, Roblox. https://create.roblox.com/docs/reference/engine/classes/Animator
[S6] AnimationTrack class reference, Roblox. https://create.roblox.com/docs/reference/engine/classes/AnimationTrack
[S7] "Use animations" guide (default animation replacement, catalog pack IDs), Roblox. https://create.roblox.com/docs/animation/using
[S8] "Animation events" guide, Roblox. https://create.roblox.com/docs/animation/events
[S9] "Inverse Kinematics" guide and IKControl reference, Roblox. https://create.roblox.com/docs/animation/inverse-kinematics
[S10] "Animation Editor" guide, Roblox. https://create.roblox.com/docs/animation/editor
[S11] "Adaptive Animation" guide, Roblox. https://create.roblox.com/docs/characters/adaptive-animation
[S12] "Emotes" guide, Roblox. https://create.roblox.com/docs/characters/emotes
[S13] Animation Graph editor, Curve Editor and Animation capture guides, Roblox. https://create.roblox.com/docs/animation/graph-editor , /animation/curve-editor , /animation/capture
[S14] "Audio" overview and "Audio objects" guide, Roblox. https://create.roblox.com/docs/audio/objects
[S15] "Audio effects" guide, Roblox. https://create.roblox.com/docs/audio/effects
[S16] "Audio assets" guide (import limits, song vs sound effect visibility), Roblox, live page fetched 2026-10-04. https://create.roblox.com/docs/audio/assets
[S17] Class references AudioPlayer, AudioEmitter, AudioListener, AudioDeviceOutput, AudioDeviceInput, Wire, Roblox. https://create.roblox.com/docs/reference/engine/classes/AudioPlayer (and siblings)
[S18] Class references AudioFader, AudioCompressor, AudioLimiter, AudioReverb, AudioEqualizer, AudioFilter, AudioEcho, AudioPitchShifter, AudioDistortion, AudioChorus, AudioFlanger, AudioTremolo, AudioGate, AudioAnalyzer, AudioTextToSpeech, AudioSpeechToText, Roblox. https://create.roblox.com/docs/reference/engine/classes/AudioReverb (and siblings)
[S19] Class references Sound, SoundGroup, SoundService, Roblox. https://create.roblox.com/docs/reference/engine/classes/SoundService
[S20] Legacy "Sound objects", "Sound groups" and "Dynamic effects" guides, Roblox. https://create.roblox.com/docs/sound/objects , /sound/groups
[S21] "Light sources" guide and Light, PointLight, SpotLight, SurfaceLight references, Roblox. https://create.roblox.com/docs/effects/light-sources
[S22] Fire, Smoke, Sparkles, Explosion class references, Roblox. https://create.roblox.com/docs/reference/engine/classes/Explosion (and siblings)
[S23] Camera, Humanoid, AnimationConstraint, Workspace, IKControl references, Roblox. https://create.roblox.com/docs/reference/engine/classes/Camera
[S24] TweenService, Tween, TweenInfo references and "UI animation/tweens" guide, Roblox. https://create.roblox.com/docs/ui/animation
[S25] Debris class, RBXScriptSignal, NumberSequence, ColorSequence, NumberRange, PhysicalProperties references, Roblox. https://create.roblox.com/docs/reference/engine/classes/Debris
[S26] Tutorials "Add 2D audio" and "Add 3D audio", Roblox, live pages fetched 2026-10-04. https://create.roblox.com/docs/tutorials/use-case-tutorials/audio/add-2D-audio , .../add-3D-audio
[S27] "R6 to R15 Adapter" guide, Roblox. https://create.roblox.com/docs/characters/r6-to-r15-adapter
[S28] "Creator Store" page (script safety rules), Roblox, fetched 2026-10-04. https://create.roblox.com/docs/production/creator-store
Engine data and local observation:
[S29] Roblox Full API Dump for Studio 0.741.19.7411056 (version-76e1a02649ad4f35), fetched 2026-10-04. https://setup.rbxcdn.com/version-76e1a02649ad4f35-Full-API-Dump.json
[S30] rbx-dom reflection database (default property values; version 0.741.19.7411056), rojo-rbx/rbx-dom. https://github.com/rojo-rbx/rbx-dom/tree/master/rbx_reflection_database
[S31] Local Roblox Studio install content folder (rbxasset textures/particles and sounds), observed 2026-10-04 on the owner's Mac (not a web source).
DevForum staff announcements (devforum.roblox.com):
[S32] "New Audio API [Beta]: Elevate Sound and Voice in Experiences", Roblox staff, 2024-02-22 (updated 2024-02-28). https://devforum.roblox.com/t/2848873
[S33] "New Audio API Features: Directional Audio, AudioLimiter, and More", Doctor_Sonar, 2024-12-02. https://devforum.roblox.com/t/new-audio-api-features-directional-audio-audiolimiter-and-more/3282100
[S34] "[Beta] Acoustic Simulation", Doctor_Sonar, 2025-05-01. https://devforum.roblox.com/t/beta-acoustic-simulation/3634265
[S35] "[Full Release] Acoustic Simulation: Emit audio with presence!", Doctor_Sonar, 2026-01-28 (full release noted 2026-09-22). https://devforum.roblox.com/t/full-release-acoustic-simulation-emit-audio-with-presence/4307121
[S36] "Build More Immersive Experiences: Text-to-Speech API Full Release", hydr0h0mie, 2025-10-09. https://devforum.roblox.com/t/build-more-immersive-experiences-text-to-speech-api-full-release/3986607
[S37] "[Studio Beta] Advanced Video API: Synchronize Video, Control 3D Audio, and More", phri, 2025-10-02. https://devforum.roblox.com/t/studio-beta-advanced-video-api-synchronize-video-control-3d-audio-and-more/3972775
[S38] "[Action Needed] Upcoming Changes to Asset Privacy for Audio", BitFist, 2022-03-09 (stale on quotas). https://devforum.roblox.com/t/1701697
[S39] "Launching Music on the Game Details Page and New Songs from Too Lost", hydr0h0mie, 2026-07-27. https://devforum.roblox.com/t/launching-music-on-the-game-details-page-and-new-songs-from-too-lost/4760221
[S40] "Lights, Camera, More Highlights!", m0bsterlobster (Rendering), 2025-11-10. https://devforum.roblox.com/t/lights-camera-more-highlights/4061534
[S41] "How to Highlight Parts, Models, Players & More", madzxla, 2023-04-25 (stale on the 31 limit). https://devforum.roblox.com/t/how-to-highlight-parts-models-players-more/2310607
[S42] "Particles' Flipbook Release", LightBeamRays, 2022-10-21 (older than 2024, partly superseded). https://devforum.roblox.com/t/particles’-flipbook-release/2029388
[S43] "[Client Beta] Optimize your particle animations with custom flipbook layouts", macabaneenbois, 2025-10-13. https://devforum.roblox.com/t/client-beta-optimize-your-particle-animations-with-custom-flipbook-layouts/4005128
[S44] "Attachments no longer require a BasePart (aka Detached Attachments)", ReallyLongArms, 2025-06-17 (live 2025-09-02). https://devforum.roblox.com/t/attachments-no-longer-require-a-basepart-aka-detached-attachments/3750286
[S45] "[Studio Beta] Introducing the Animation Graph System", NeoShr3dder, 2026-04-02. https://devforum.roblox.com/t/studio-beta-introducing-the-animation-graph-system/4554788
[S46] "[Full Release] Animation Graphs: Create Complex Character Motion Visually", NeoShr3dder, 2026-07-15. https://devforum.roblox.com/t/full-release-animation-graphs-create-complex-character-motion-visually/4739840
[S47] "[Full Release] Adaptive Animation: Use One Animation Across Any Rig", NeoShr3dder, 2026-04-29. https://devforum.roblox.com/t/full-release-adaptive-animation-use-one-animation-across-any-rig/4605672
[S48] "Improved AnimationConstraint", m0bsterlobster, 2026-06-23. https://devforum.roblox.com/t/improved-animationconstraint-stable-mass-independent-tracking-for-physically-simulated-joints/4700211
[S49] "Sharing Animation Assets with Connections and Groups", BobaMuncher, 2025-08-21. https://devforum.roblox.com/t/sharing-animation-assets-with-connections-and-groups/3892540
[S50] "Creator Roadmap 2026: Fall Update", Roblox, 2026-09-18. https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S51] "New Creator Store Layout and Search", Kairomatic, 2026-04-29. https://devforum.roblox.com/t/new-creator-store-layout-and-search/4603900
[S52] DevForum announcement and search listings (Discourse JSON) used for dating the items above and for the "[Full Release] Create and Sell Animation Packs on Marketplace" post of 2026-09-09 (id 4861803) and the hit-stop search, queried 2026-10-04. https://devforum.roblox.com/c/updates/announcements/36.json
Community tutorials and libraries (named authors):
[S53] "Introduction to VFX: Particles", VisuallyFX, 2022-12-01. https://devforum.roblox.com/t/introduction-to-vfx-particles/2068650
[S54] "Full Beginner's Guide on scripting Anime/Fighting VFX [Part 1]", SushiScripter, 2022-01-02. https://devforum.roblox.com/t/full-beginners-guide-on-scripting-animefighting-vfxvisual-effects-part-1/1610853
[S55] "Client Replication 101. The guide to replicating effects to clients", j_adsa, 2022-05-12. https://devforum.roblox.com/t/client-replication-101-the-guide-to-replicating-effects-to-clients/1789487
[S56] "Crecent Sword Slash Effect", ImaginePowerq, 2021-03-16 (older than 2024; mesh-based slash technique). https://devforum.roblox.com/t/crecent-sword-slash-effect/1113871
[S57] "Creating Common Camera Effects", Den_vers, 2023-02-15. https://devforum.roblox.com/t/creating-common-camera-effects/2184881
[S58] "EZ Camera Shake V2", PioTheDeveloper, 2026-06-06. https://devforum.roblox.com/t/ez-camera-shake-v2-a-refresh-of-a-popular-preferred-module-for-applying-camera-shake-effects/4671745
[S59] RbxCameraShaker, Sleitnick, GitHub (MIT; port of Unity EZ Camera Shake). https://github.com/Sleitnick/RbxCameraShaker
[S60] spr (spring animation library), Fraktality, GitHub. https://github.com/Fraktality/spr
[S61] "The Audio Balance in most Roblox games is terrible, but it doesn't have to be!", ShipooI, 2020-08-18 (stale; contains no numbers). https://devforum.roblox.com/t/the-audio-balance-in-most-roblox-games-is-terrible-but-it-doesnt-have-to-be/729433
[S62] "AmbientSorcery's Tutorial 1: Creating Compelling Environmental Audio", AmbientSorcery (posted by OffGridDude), 2025-02-25. https://devforum.roblox.com/t/ambientsorcery%E2%80%99s-tutorial-1-creating-compelling-environmental-audio/3507022
[S63] "[Plugin] Audiophile: a real-time mixing console for the new Audio API", Nartheos, 2026-07-06. https://devforum.roblox.com/t/plugin-audiophile-a-real-time-mixing-console-for-the-new-audio-api/4719764
[S64] "AudioEngine - An easy-to-use adaptive audio system for Roblox", Not_Lowest, 2026-08-12. https://devforum.roblox.com/t/audioengine-an-easy-to-use-adaptive-audio-system-for-roblox/4807450
[S65] "Resonance - Acoustics Library", anon66567989, 2025-09-07. https://devforum.roblox.com/t/resonance-acoustics-library/3924703
[S66] "Smile4's Dynamic Reverb - Simple, Performant, and Realistic Audio", smile4cs, 2025-07-11. https://devforum.roblox.com/t/smile4s-dynamic-reverb-simple-performant-and-realistic-audio/3809813
Talks (title and channel only confirmed; content not verified):
[S67] "Juice it or lose it", Martin Jonasson and Petri Purho (YouTube). https://www.youtube.com/watch?v=Fy0aCDmgnxg
[S68] "The art of screenshake", Jan Willem Nijman, Vlambeer, INDIGO Classes 2013 (YouTube). https://www.youtube.com/watch?v=AJdEqssNZ-U
Internal repository observation (not a web source):
[S69] RbxAI repo: packages/asset-library/vfx/presets.mjs (engine texture list and measured notes, e.g. fire_sparks_main renders almost nothing, rain streak orientation) and apps/apple-plugin/src/Commands.luau (class and texture allowlists), read 2026-10-04.
